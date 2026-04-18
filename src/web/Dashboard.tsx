import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchRecentEvents,
  fetchRuns,
  fetchSettings,
  type ApiEvent,
  type ApiOrchestratorSettings,
  type ApiOrchestratorState,
  type ApiRun,
  type ApiUsage,
  type ApiWorkflowSummary,
} from "./api.js";
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
      const [freshRuns, freshEvents] = await Promise.all([fetchRuns(), fetchRecentEvents()]);
      setRuns(freshRuns);
      setEvents(freshEvents.events);
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
          <th className="py-2 pr-4">Started</th>
          <th className="py-2 pr-4">Finished</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr
            key={r.id}
            className="border-b border-slate-900 hover:bg-slate-900/60 cursor-pointer"
            onClick={() => {
              window.location.hash = `#/runs/${r.id}`;
            }}
          >
            <td className="py-2 pr-4 font-mono">{r.issueIdentifier}</td>
            <td className="py-2 pr-4 text-slate-200 max-w-xs truncate" title={r.issueTitle ?? "—"}>
              {r.issueTitle ?? "—"}
            </td>
            <td className="py-2 pr-4">
              <StatusBadge status={r.status} />
            </td>
            <td className="py-2 pr-4 text-slate-400">{r.scenario ?? "—"}</td>
            <td className="py-2 pr-4 text-slate-400 font-mono tabular-nums">{r.turnCount}</td>
            <td className="py-2 pr-4 text-slate-400">{formatTs(r.startedAt)}</td>
            <td className="py-2 pr-4 text-slate-400">
              {r.finishedAt ? formatTs(r.finishedAt) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
