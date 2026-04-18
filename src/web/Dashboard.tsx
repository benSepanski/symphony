import { useEffect, useState } from "react";
import { fetchRuns, type ApiRun } from "./api.js";
import { StreamStatus, useEventStream } from "./useEventStream.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready"; runs: ApiRun[] }
  | { tag: "error"; message: string };

export function Dashboard() {
  const [state, setState] = useState<LoadState>({ tag: "loading" });
  const streamStatus = useEventStream(["runStarted", "turn", "runFinished"], async () => {
    const runs = await fetchRuns();
    setState({ tag: "ready", runs });
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const runs = await fetchRuns();
        if (!cancelled) setState({ tag: "ready", runs });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.tag === "loading") return <p className="text-slate-400">loading…</p>;
  if (state.tag === "error") return <p className="text-rose-400">error: {state.message}</p>;

  if (state.runs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <StreamIndicator status={streamStatus} />
        <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-medium mb-2">No runs yet</h2>
          <p className="text-slate-400 text-sm">
            Symphony will poll your tracker and start a run as soon as a ticket enters an active
            state. In mock mode, demo issues are seeded at boot (pass <code>--no-demo</code> to
            skip, or <code>--seed &lt;file.yaml&gt;</code> to supply your own).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StreamIndicator status={streamStatus} />
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400 border-b border-slate-800">
          <tr>
            <th className="py-2 pr-4">Issue</th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Scenario</th>
            <th className="py-2 pr-4">Started</th>
            <th className="py-2 pr-4">Finished</th>
          </tr>
        </thead>
        <tbody>
          {state.runs.map((r) => (
            <tr
              key={r.id}
              className="border-b border-slate-900 hover:bg-slate-900/60 cursor-pointer"
              onClick={() => {
                window.location.hash = `#/runs/${r.id}`;
              }}
            >
              <td className="py-2 pr-4 font-mono">{r.issueIdentifier}</td>
              <td className="py-2 pr-4 text-slate-200 max-w-xs truncate">{r.issueTitle ?? "—"}</td>
              <td className="py-2 pr-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="py-2 pr-4 text-slate-400">{r.scenario ?? "—"}</td>
              <td className="py-2 pr-4 text-slate-400">{formatTs(r.startedAt)}</td>
              <td className="py-2 pr-4 text-slate-400">
                {r.finishedAt ? formatTs(r.finishedAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "running"
        ? "bg-cyan-500/10 text-cyan-300"
        : status === "max_turns"
          ? "bg-amber-500/10 text-amber-300"
          : status === "failed"
            ? "bg-rose-500/10 text-rose-300"
            : status === "cancelled"
              ? "bg-slate-500/10 text-slate-300"
              : "bg-slate-500/10 text-slate-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {status === "running" && (
        <span className="inline-block size-1.5 rounded-full bg-cyan-300 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function StreamIndicator({ status }: { status: StreamStatus }) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-slate-500";
  const label =
    status === "connected" ? "live" : status === "connecting" ? "connecting…" : "disconnected";
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`inline-block size-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}
