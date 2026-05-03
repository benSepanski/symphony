import { useEffect, useMemo, useState } from "react";
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
import {
  applyFilters,
  parseFilters,
  RUN_STATUSES,
  serializeFilters,
  toggleSort,
  toggleStatus,
  type DashboardFilters,
  type SortKey,
} from "./dashboardFilters.js";

export { StatusBadge } from "./shared.js";

type LoadState = { tag: "loading" } | { tag: "ready" } | { tag: "error"; message: string };

export function Dashboard({ search }: { search: string }) {
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

  const filters = useMemo(() => parseFilters(search), [search]);
  const updateFilters = (next: DashboardFilters) => {
    const qs = serializeFilters(next);
    window.location.hash = qs ? `#/${qs}` : "#/";
  };
  const visibleRuns = useMemo(() => applyFilters(runs, filters), [runs, filters]);

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
      {runs.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <FilterBar
            filters={filters}
            total={runs.length}
            visible={visibleRuns.length}
            onChange={updateFilters}
          />
          {visibleRuns.length === 0 ? (
            <NoMatches onClear={() => updateFilters({ ...filters, statuses: [], text: "" })} />
          ) : (
            <RunsTable runs={visibleRuns} filters={filters} onSort={updateFilters} />
          )}
        </>
      )}
    </div>
  );
}

function FilterBar({
  filters,
  total,
  visible,
  onChange,
}: {
  filters: DashboardFilters;
  total: number;
  visible: number;
  onChange: (next: DashboardFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {RUN_STATUSES.map((status) => {
          const active = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(toggleStatus(filters, status))}
              className={`rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                active ? "ring-1 ring-inset ring-cyan-400" : "opacity-70 hover:opacity-100"
              }`}
            >
              <StatusBadge status={status} />
            </button>
          );
        })}
        <input
          value={filters.text}
          onChange={(e) => onChange({ ...filters, text: e.target.value })}
          placeholder="filter by issue id or title…"
          className="ml-auto flex-1 min-w-[12rem] max-w-sm rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-500"
        />
      </div>
      <p className="text-xs text-slate-500">
        showing <span className="font-mono text-slate-300">{visible}</span> of{" "}
        <span className="font-mono">{total}</span> runs
      </p>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
      No runs match the current filters.{" "}
      <button
        type="button"
        onClick={onClear}
        className="text-cyan-400 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
      >
        Clear filters
      </button>
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

function RunsTable({
  runs,
  filters,
  onSort,
}: {
  runs: ApiRun[];
  filters: DashboardFilters;
  onSort: (next: DashboardFilters) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400 border-b border-slate-800">
        <tr>
          <th className="py-2 pr-4">Issue</th>
          <th className="py-2 pr-4">Title</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Scenario</th>
          <SortableHeader label="Turns" sortKey="turns" filters={filters} onSort={onSort} />
          <SortableHeader label="Tokens" sortKey="tokens" filters={filters} onSort={onSort} />
          <SortableHeader label="Cost" sortKey="cost" filters={filters} onSort={onSort} />
          <SortableHeader label="Started" sortKey="startedAt" filters={filters} onSort={onSort} />
          <SortableHeader label="Finished" sortKey="finishedAt" filters={filters} onSort={onSort} />
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

function SortableHeader({
  label,
  sortKey,
  filters,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  filters: DashboardFilters;
  onSort: (next: DashboardFilters) => void;
}) {
  const active = filters.sort.key === sortKey;
  const indicator = active ? (filters.sort.dir === "asc" ? " ↑" : " ↓") : "";
  const ariaSort = active ? (filters.sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className="py-2 pr-4" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(toggleSort(filters, sortKey))}
        className={`-mx-1 px-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          active ? "text-slate-100" : "hover:text-slate-200"
        }`}
      >
        {label}
        <span aria-hidden="true">{indicator}</span>
      </button>
    </th>
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
