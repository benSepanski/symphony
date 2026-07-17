import { useEffect, useState } from "react";
import { requestManualTick, type ApiOrchestratorState, type ApiUsage } from "./api.js";
import type { StreamStatus } from "./useEventStream.js";
import { formatInterval, formatPct } from "./shared.js";

interface Props {
  state: ApiOrchestratorState | null;
  usage: ApiUsage | null;
  streamStatus: StreamStatus;
  onReconnectStream?: () => void;
}

type RefreshState = { tag: "idle" } | { tag: "running" } | { tag: "error"; message: string };

const REFRESH_ERROR_AUTO_CLEAR_MS = 5000;

export function HealthStrip({ state, usage, streamStatus, onReconnectStream }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [refresh, setRefresh] = useState<RefreshState>({ tag: "idle" });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A fresh usage snapshot means the tracker is talking to us again — a
  // stale error banner would misrepresent live state, so drop it.
  useEffect(() => {
    if (!usage) return;
    setRefresh((s) => (s.tag === "error" ? { tag: "idle" } : s));
  }, [usage]);

  // Backstop: even if no tick arrives, don't leave the failure on-screen
  // forever. Cancel on unmount / state change so we never fire against a stale
  // error.
  useEffect(() => {
    if (refresh.tag !== "error") return;
    const id = window.setTimeout(() => {
      setRefresh((s) => (s.tag === "error" ? { tag: "idle" } : s));
    }, REFRESH_ERROR_AUTO_CLEAR_MS);
    return () => window.clearTimeout(id);
  }, [refresh]);

  async function onRefresh() {
    setRefresh({ tag: "running" });
    try {
      await requestManualTick();
      setRefresh({ tag: "idle" });
    } catch (err) {
      setRefresh({ tag: "error", message: (err as Error).message });
    }
  }

  const streamColor =
    streamStatus === "connected"
      ? "bg-emerald-500"
      : streamStatus === "connecting"
        ? "bg-amber-500"
        : "bg-slate-500";
  const streamLabel =
    streamStatus === "connected"
      ? "live"
      : streamStatus === "connecting"
        ? "connecting…"
        : "disconnected";

  const rateLimited = usage?.rateLimitedWindow ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 text-slate-400"
        >
          <span aria-hidden="true" className={`inline-block size-2 rounded-full ${streamColor}`} />
          <span className="sr-only">Live stream: </span>
          {streamLabel}
          {streamStatus === "disconnected" && onReconnectStream && (
            <button
              type="button"
              onClick={onReconnectStream}
              className="ml-1 rounded bg-slate-800/60 px-1.5 py-0.5 text-slate-200 hover:bg-slate-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              title="Re-establish the event stream"
            >
              reconnect
            </button>
          )}
        </span>
        {state ? (
          <>
            <span className="text-slate-400">
              <span className="text-slate-500">poll</span>{" "}
              <span className="text-slate-200">{formatInterval(state.pollIntervalMs)}</span>
              {state.lastTickAt !== null && (
                <span className="text-slate-500"> · last {formatAge(now, state.lastTickAt)}</span>
              )}
              {state.pollingMode === "manual" && (
                <span className="ml-2 text-amber-300">manual</span>
              )}
              {state.pollingMode === "auto" && !state.polling && (
                <span className="ml-2 text-rose-300">paused</span>
              )}
            </span>
            <Pill label="slots" value={`${state.concurrency.current}/${state.concurrency.max}`} />
            <Pill label="queue" value={String(state.queueDepth)} />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refresh.tag === "running"}
              className={`rounded px-2 py-0.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                state.pollingMode === "manual"
                  ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-700/60"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              title={
                state.pollingMode === "manual"
                  ? "Poll the tracker now"
                  : "Poll the tracker immediately instead of waiting for the next interval"
              }
            >
              {refresh.tag === "running" ? "refreshing…" : "refresh now"}
            </button>
            <span
              role="status"
              aria-live="polite"
              className={refresh.tag === "error" ? "text-rose-300" : "sr-only"}
            >
              {refresh.tag === "error" ? refresh.message : ""}
            </span>
          </>
        ) : (
          <span className="text-slate-500">orchestrator idle (replay mode)</span>
        )}
        {usage?.snapshot && !rateLimited && (
          <span className="text-slate-400">
            <span className="text-slate-500">5h</span>{" "}
            {formatPct(usage.snapshot.fiveHour.utilization)}{" "}
            <span className="text-slate-500">· 7d</span>{" "}
            {formatPct(usage.snapshot.sevenDay.utilization)}
          </span>
        )}
      </div>
      {rateLimited && usage?.snapshot && (
        <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 p-4 text-sm">
          <div className="font-medium text-fuchsia-200">
            Rate limited — no new agents will spawn
          </div>
          <div className="text-fuchsia-300/80">
            {rateLimited === "fiveHour" ? "5-hour" : "7-day"} window at{" "}
            {formatPct(usage.snapshot[rateLimited].utilization)}. Resets at{" "}
            {new Date(usage.snapshot[rateLimited].resetsAt).toLocaleString()}.
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-800/60 px-2 py-0.5 text-slate-200">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

function formatAge(nowMs: number, whenMs: number): string {
  const diff = Math.max(0, Math.floor((nowMs - whenMs) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
