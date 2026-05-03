import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchRecentEvents,
  fetchRun,
  fetchRuns,
  fetchSettings,
  type ApiEvent,
  type ApiOrchestratorSettings,
  type ApiOrchestratorState,
  type ApiRun,
  type ApiUsage,
  type ApiWorkflowSummary,
} from "./api.js";
import { applyRunFinishedEvent, applyTurnEvent, hasRun, replaceRun } from "./dashboardEvents.js";
import { useEventStream } from "./useEventStream.js";
import { HealthStrip } from "./HealthStrip.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { ErrorFeed } from "./ErrorFeed.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { StatusBadge, formatTs } from "./shared.js";

export { StatusBadge } from "./shared.js";

type LoadState = { tag: "loading" } | { tag: "ready" } | { tag: "error"; message: string };

export function Dashboard() {
  const [load, setLoad] = useState<LoadState>({ tag: "loading" });
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [state, setState] = useState<ApiOrchestratorState | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [settings, setSettings] = useState<ApiOrchestratorSettings | null>(null);
  const [workflow, setWorkflow] = useState<ApiWorkflowSummary | null>(null);

  const streamStatus = useEventStream(
    ["runStarted", "turn", "runFinished", "usageUpdated", "tick", "settingsUpdated"],
    async (name, data) => {
      if (name === "usageUpdated") {
        setUsage(data as ApiUsage);
        return;
      }
      if (name === "tick") {
        setState(data as ApiOrchestratorState);
        return;
      }
      if (name === "settingsUpdated") {
        setSettings(data as ApiOrchestratorSettings);
        return;
      }
      const payload = data as { runId?: string; status?: string } | null;
      const runId = payload?.runId;
      if (name === "turn" && runId) {
        let needsFullRefetch = false;
        setRuns((prev) => {
          if (!hasRun(prev, runId)) {
            needsFullRefetch = true;
            return prev;
          }
          return applyTurnEvent(prev, runId).next;
        });
        if (needsFullRefetch) {
          const fresh = await fetchRuns();
          setRuns(fresh);
        }
        return;
      }
      if (name === "runFinished" && runId) {
        const finishedAt = new Date().toISOString();
        const status = typeof payload?.status === "string" ? payload.status : "completed";
        setRuns((prev) =>
          hasRun(prev, runId) ? applyRunFinishedEvent(prev, runId, status, finishedAt).next : prev,
        );
        try {
          const detail = await fetchRun(runId);
          setRuns((prev) =>
            hasRun(prev, runId) ? replaceRun(prev, detail.run) : [detail.run, ...prev],
          );
        } catch {
          const fresh = await fetchRuns();
          setRuns(fresh);
        }
        const recent = await fetchRecentEvents();
        setEvents(recent.events);
        return;
      }
      if (name === "runStarted" && runId) {
        const fresh = await fetchRuns();
        setRuns(fresh);
        return;
      }
    },
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, health, recent, settingsResp] = await Promise.all([
          fetchRuns(),
          fetchHealth(),
          fetchRecentEvents(),
          fetchSettings(),
        ]);
        if (cancelled) return;
        setRuns(r);
        setUsage(health.usage);
        setState(health.orchestrator);
        setEvents(recent.events);
        setSettings(settingsResp.settings);
        setWorkflow(settingsResp.workflow);
        setLoad({ tag: "ready" });
      } catch (err) {
        if (!cancelled) setLoad({ tag: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.tag === "loading") return <p className="text-slate-400">loading…</p>;
  if (load.tag === "error") return <p className="text-rose-400">error: {load.message}</p>;

  return (
    <div className="flex flex-col gap-4">
      <HealthStrip state={state} usage={usage} streamStatus={streamStatus} />
      <SettingsPanel
        settings={settings}
        workflow={workflow}
        onSettingsChanged={(next) => setSettings(next)}
      />
      <MetricsPanel runs={runs} />
      <ErrorFeed events={events} runs={runs} />
      <HistoryTotals runs={runs} />
      {runs.length === 0 ? <EmptyState /> : <RunsTable runs={runs} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-medium mb-2">No runs yet</h2>
      <p className="text-slate-400 text-sm">
        Symphony will poll your tracker and start a run as soon as a ticket enters an active state.
        In mock mode, demo issues are seeded at boot (pass <code>--no-demo</code> to skip, or{" "}
        <code>--seed &lt;file.yaml&gt;</code> to supply your own).
      </p>
    </div>
  );
}

function RunsTable({ runs }: { runs: ApiRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400 border-b border-slate-800">
        <tr>
          <th className="py-2 pr-4">Issue</th>
          <th className="py-2 pr-4">Title</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Scenario</th>
          <th className="py-2 pr-4">Turns</th>
          <th className="py-2 pr-4">Tokens</th>
          <th className="py-2 pr-4">Cost</th>
          <th className="py-2 pr-4">Started</th>
          <th className="py-2 pr-4">Finished</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const open = () => {
            window.location.hash = `#/runs/${r.id}`;
          };
          return (
            <tr
              key={r.id}
              role="link"
              tabIndex={0}
              aria-label={`Open run ${r.issueIdentifier}${r.issueTitle ? `: ${r.issueTitle}` : ""}`}
              className="border-b border-slate-900 hover:bg-slate-900/60 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset"
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
            >
              <td className="py-2 pr-4 font-mono">{r.issueIdentifier}</td>
              <td
                className="py-2 pr-4 text-slate-200 max-w-xs truncate"
                title={r.issueTitle ?? "—"}
              >
                {r.issueTitle ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="py-2 pr-4 text-slate-400">{r.scenario ?? "—"}</td>
              <td className="py-2 pr-4 text-slate-400 font-mono tabular-nums">{r.turnCount}</td>
              <td
                className="py-2 pr-4 text-slate-400 font-mono tabular-nums"
                title={formatTokenBreakdown(r)}
              >
                {formatTokenTotal(r)}
              </td>
              <td className="py-2 pr-4 text-slate-400 font-mono tabular-nums">
                {formatCost(r.totalCostUsd)}
              </td>
              <td className="py-2 pr-4 text-slate-400">{formatTs(r.startedAt)}</td>
              <td className="py-2 pr-4 text-slate-400">
                {r.finishedAt ? formatTs(r.finishedAt) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function sumTokens(r: ApiRun): number {
  return (
    (r.tokensInput ?? 0) +
    (r.tokensOutput ?? 0) +
    (r.tokensCacheRead ?? 0) +
    (r.tokensCacheCreation ?? 0)
  );
}

function hasUsage(r: ApiRun): boolean {
  return (
    r.tokensInput !== null ||
    r.tokensOutput !== null ||
    r.tokensCacheRead !== null ||
    r.tokensCacheCreation !== null ||
    r.totalCostUsd !== null
  );
}

function formatTokenTotal(r: ApiRun): string {
  if (!hasUsage(r)) return "—";
  return formatTokenCount(sumTokens(r));
}

function formatTokenBreakdown(r: ApiRun): string {
  if (!hasUsage(r)) return "no token usage recorded";
  return [
    `input ${formatTokenCount(r.tokensInput ?? 0)}`,
    `output ${formatTokenCount(r.tokensOutput ?? 0)}`,
    `cache read ${formatTokenCount(r.tokensCacheRead ?? 0)}`,
    `cache create ${formatTokenCount(r.tokensCacheCreation ?? 0)}`,
  ].join(" · ");
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function HistoryTotals({ runs }: { runs: ApiRun[] }) {
  const withUsage = runs.filter(hasUsage);
  if (withUsage.length === 0) return null;
  const totalTokens = withUsage.reduce((acc, r) => acc + sumTokens(r), 0);
  const totalCost = withUsage.reduce((acc, r) => acc + (r.totalCostUsd ?? 0), 0);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
      <span>
        <span className="text-slate-500">runs with token data:</span>{" "}
        <span className="font-mono text-slate-200">{withUsage.length}</span> /{" "}
        <span className="font-mono">{runs.length}</span>
      </span>
      <span>
        <span className="text-slate-500">total tokens:</span>{" "}
        <span className="font-mono text-slate-200">{formatTokenCount(totalTokens)}</span>
      </span>
      <span>
        <span className="text-slate-500">total cost:</span>{" "}
        <span className="font-mono text-slate-200">{formatCost(totalCost)}</span>
      </span>
    </div>
  );
}
