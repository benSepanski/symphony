import { useMemo, useState } from "react";
import type { ApiRun } from "./api.js";
import { StatusBadge } from "./shared.js";

type WindowKey = "24h" | "7d" | "all";

const WINDOW_MS: Record<Exclude<WindowKey, "all">, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
};

interface Props {
  runs: ApiRun[];
}

export function MetricsPanel({ runs }: Props) {
  const [window, setWindow] = useState<WindowKey>("24h");

  const filtered = useMemo(() => {
    if (window === "all") return runs;
    const cutoff = Date.now() - WINDOW_MS[window];
    return runs.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
  }, [runs, window]);

  const stats = useMemo(() => computeStats(filtered), [filtered]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-slate-200">Metrics</h2>
        <div className="flex items-center gap-1 text-xs">
          {(["24h", "7d", "all"] as WindowKey[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window === w}
              className={`rounded px-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                window === w ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-500">No runs in this window.</p>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-slate-200">
              <span className="font-mono text-base">{stats.total}</span>{" "}
              <span className="text-slate-500">runs</span>
            </span>
            <span className="text-emerald-300">
              success <span className="font-mono">{stats.successPct}%</span>
            </span>
            <span className="text-slate-400">
              median turns <span className="font-mono text-slate-200">{stats.medianTurns}</span>
            </span>
            <span className="text-slate-400">
              median duration{" "}
              <span className="font-mono text-slate-200">{stats.medianDuration}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {stats.byStatus.map(([status, count]) => (
              <span key={status} className="inline-flex items-center gap-1">
                <StatusBadge status={status} />
                <span className="font-mono text-slate-200">{count}</span>
              </span>
            ))}
          </div>

          {stats.byScenario.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1">by scenario</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {stats.byScenario.map((row) => (
                  <span key={row.scenario} className="text-slate-400">
                    <span className="text-slate-200">{row.scenario}</span>{" "}
                    <span className="font-mono">
                      {row.completed}/{row.total}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface Stats {
  total: number;
  successPct: number;
  medianTurns: number;
  medianDuration: string;
  byStatus: Array<[string, number]>;
  byScenario: Array<{ scenario: string; total: number; completed: number }>;
}

function computeStats(runs: ApiRun[]): Stats {
  const total = runs.length;
  const byStatusMap = new Map<string, number>();
  for (const r of runs) byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
  const completed = byStatusMap.get("completed") ?? 0;

  const turnCounts = runs.map((r) => r.turnCount).sort((a, b) => a - b);
  const durations: number[] = [];
  for (const r of runs) {
    if (r.finishedAt) {
      const d = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
      if (d >= 0) durations.push(d);
    }
  }
  durations.sort((a, b) => a - b);

  const byScenarioMap = new Map<string, { total: number; completed: number }>();
  for (const r of runs) {
    if (!r.scenario) continue;
    const entry = byScenarioMap.get(r.scenario) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (r.status === "completed") entry.completed += 1;
    byScenarioMap.set(r.scenario, entry);
  }

  return {
    total,
    successPct: total === 0 ? 0 : Math.round((completed / total) * 100),
    medianTurns: median(turnCounts),
    medianDuration: durations.length === 0 ? "—" : formatDuration(median(durations)),
    byStatus: [...byStatusMap.entries()].sort((a, b) => b[1] - a[1]),
    byScenario: [...byScenarioMap.entries()]
      .map(([scenario, v]) => ({ scenario, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return remSec === 0 ? `${minutes}m` : `${minutes}m${remSec}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin === 0 ? `${hours}h` : `${hours}h${remMin}m`;
}
