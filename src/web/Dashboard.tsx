import { useCallback, useEffect, useRef, useState } from "react";
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
import { collectDashboardFailures, type DashboardLoadFailure } from "./dashboardLoadUtils.js";
import { useEventStream } from "./useEventStream.js";
import { HealthStrip } from "./HealthStrip.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { ErrorFeed } from "./ErrorFeed.js";
import { SettingsPanel } from "./SettingsPanel.js";
import {
  RUNS_TABLE_COLUMNS,
  RUNS_TABLE_GRID_COLS,
  formatCost,
  formatRunMetaLine,
  formatTokenBreakdown,
  formatTokenCount,
  formatTokenTotal,
  hasUsage,
  runCardAriaLabel,
  sumTokens,
} from "./runsTable.js";
import { StatusBadge, formatTs } from "./shared.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready" }
  | { tag: "error"; failures: DashboardLoadFailure[] };

const LOADING_CARD_DELAY_MS = 200;

export function Dashboard() {
  const [load, setLoad] = useState<LoadState>({ tag: "loading" });
  const [runs, setRuns] = useState<ApiRun[]>([]);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [state, setState] = useState<ApiOrchestratorState | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [settings, setSettings] = useState<ApiOrchestratorSettings | null>(null);
  const [workflow, setWorkflow] = useState<ApiWorkflowSummary | null>(null);

  const { status: streamStatus, reconnect: reconnectStream } = useEventStream(
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

  const loadGen = useRef(0);
  const loadDashboard = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoad({ tag: "loading" });
    const [runsRes, healthRes, recentRes, settingsRes] = await Promise.allSettled([
      fetchRuns(),
      fetchHealth(),
      fetchRecentEvents(),
      fetchSettings(),
    ]);
    if (gen !== loadGen.current) return;
    const failures = collectDashboardFailures([
      { url: "/api/runs", result: runsRes },
      { url: "/api/health", result: healthRes },
      { url: "/api/events/recent", result: recentRes },
      { url: "/api/settings", result: settingsRes },
    ]);
    if (failures.length > 0) {
      setLoad({ tag: "error", failures });
      return;
    }
    if (runsRes.status === "fulfilled") setRuns(runsRes.value);
    if (healthRes.status === "fulfilled") {
      setUsage(healthRes.value.usage);
      setState(healthRes.value.orchestrator);
    }
    if (recentRes.status === "fulfilled") setEvents(recentRes.value.events);
    if (settingsRes.status === "fulfilled") {
      setSettings(settingsRes.value.settings);
      setWorkflow(settingsRes.value.workflow);
    }
    setLoad({ tag: "ready" });
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => {
      loadGen.current++;
    };
  }, [loadDashboard]);

  if (load.tag === "loading") return <DashboardLoadingCard />;
  if (load.tag === "error")
    return <DashboardErrorCard failures={load.failures} onRetry={loadDashboard} />;

  return (
    <div className="flex flex-col gap-4">
      <HealthStrip
        state={state}
        usage={usage}
        streamStatus={streamStatus}
        onReconnectStream={reconnectStream}
      />
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

function DashboardLoadingCard() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), LOADING_CARD_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return <div aria-hidden="true" />;
  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6"
    >
      <h2 className="text-lg font-medium mb-2">Loading dashboard…</h2>
      <p className="sr-only">Fetching runs, health, recent events, and settings.</p>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-800" />
      </div>
    </div>
  );
}

function DashboardErrorCard({
  failures,
  onRetry,
}: {
  failures: DashboardLoadFailure[];
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-medium mb-2">Couldn't load dashboard</h2>
      <p className="text-slate-400 text-sm">
        {failures.length === 1
          ? "One request failed while loading the dashboard."
          : `${failures.length} requests failed while loading the dashboard.`}
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        {failures.map((f) => (
          <li key={f.url} className="font-mono text-slate-300">
            <span className="text-rose-300">{f.url}</span>{" "}
            <span className="text-slate-400">— {f.message}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-200 hover:bg-cyan-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        Try again
      </button>
    </div>
  );
}

function RunsTable({ runs }: { runs: ApiRun[] }) {
  return (
    <>
      <section aria-labelledby="runs-heading-mobile" className="sm:hidden">
        <h2 id="runs-heading-mobile" className="sr-only">
          Runs
        </h2>
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </ul>
      </section>
      <div className="-mx-4 hidden overflow-x-auto sm:mx-0 sm:block">
        <div
          role="table"
          aria-labelledby="runs-heading"
          className="min-w-[56rem] px-4 text-sm sm:min-w-0 sm:px-0"
        >
          <h2 id="runs-heading" className="sr-only">
            Runs
          </h2>
          <div
            role="row"
            className={`grid ${RUNS_TABLE_GRID_COLS} gap-x-4 px-2 py-2 text-left text-slate-400 border-b border-slate-800`}
          >
            {RUNS_TABLE_COLUMNS.map((col) => (
              <span key={col.key} role="columnheader" id={col.headerId}>
                {col.label}
              </span>
            ))}
          </div>
          <ul role="rowgroup" className="divide-y divide-slate-900/60">
            {runs.map((r) => (
              <li
                key={r.id}
                role="row"
                className={`relative grid ${RUNS_TABLE_GRID_COLS} gap-x-4 items-center px-2 py-2 hover:bg-slate-900/60 focus-within:ring-2 focus-within:ring-cyan-500 focus-within:ring-inset`}
              >
                <span role="cell" aria-labelledby="col-issue" className="font-mono">
                  <a
                    href={`#/runs/${r.id}`}
                    aria-label={runCardAriaLabel(r)}
                    className="absolute inset-0 focus:outline-none"
                  >
                    <span className="sr-only">Open</span>
                  </a>
                  {r.issueIdentifier}
                </span>
                <span role="cell" aria-labelledby="col-title" className="text-slate-200 truncate">
                  {r.issueTitle ?? "—"}
                </span>
                <span role="cell" aria-labelledby="col-status">
                  <StatusBadge status={r.status} />
                </span>
                <span
                  role="cell"
                  aria-labelledby="col-scenario"
                  className="text-slate-400 truncate"
                >
                  {r.scenario ?? "—"}
                </span>
                <span
                  role="cell"
                  aria-labelledby="col-turns"
                  className="text-slate-400 font-mono tabular-nums"
                >
                  {r.turnCount}
                </span>
                <span
                  role="cell"
                  aria-labelledby="col-tokens"
                  className="text-slate-400 font-mono tabular-nums"
                >
                  {formatTokenTotal(r)}
                  <span className="sr-only"> ({formatTokenBreakdown(r)})</span>
                </span>
                <span
                  role="cell"
                  aria-labelledby="col-cost"
                  className="text-slate-400 font-mono tabular-nums"
                >
                  {formatCost(r.totalCostUsd)}
                </span>
                <span role="cell" aria-labelledby="col-started" className="text-slate-400">
                  {formatTs(r.startedAt)}
                </span>
                <span role="cell" aria-labelledby="col-finished" className="text-slate-400">
                  {r.finishedAt ? formatTs(r.finishedAt) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function RunCard({ run: r }: { run: ApiRun }) {
  const metaLine = formatRunMetaLine(r);
  return (
    <li className="relative rounded-lg border border-slate-800 bg-slate-900/60 p-3 hover:bg-slate-900 focus-within:ring-2 focus-within:ring-cyan-500 focus-within:ring-inset">
      <a
        href={`#/runs/${r.id}`}
        aria-label={runCardAriaLabel(r)}
        className="absolute inset-0 focus:outline-none"
      >
        <span className="sr-only">Open</span>
      </a>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-slate-200">{r.issueIdentifier}</span>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-slate-200">{r.issueTitle ?? "—"}</p>
      {metaLine && (
        <p className="mt-1 font-mono text-xs tabular-nums text-slate-400">
          {metaLine}
          <span className="sr-only"> ({formatTokenBreakdown(r)})</span>
        </p>
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>Started {formatTs(r.startedAt)}</span>
        <span>{r.finishedAt ? `Finished ${formatTs(r.finishedAt)}` : "—"}</span>
      </div>
    </li>
  );
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
