import { useEffect, useState } from "react";
import { fetchRuns, type ApiRun } from "./api.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready"; runs: ApiRun[] }
  | { tag: "error"; message: string };

export function Dashboard() {
  const [state, setState] = useState<LoadState>({ tag: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runs = await fetchRuns();
        if (!cancelled) setState({ tag: "ready", runs });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    };
    load();
    const es = new EventSource("/api/events");
    const reload = () => void load();
    es.addEventListener("runStarted", reload);
    es.addEventListener("turn", reload);
    es.addEventListener("runFinished", reload);
    return () => {
      cancelled = true;
      es.close();
    };
  }, []);

  if (state.tag === "loading") {
    return <p className="text-slate-400">loading…</p>;
  }
  if (state.tag === "error") {
    return <p className="text-rose-400">error: {state.message}</p>;
  }
  if (state.runs.length === 0) {
    return (
      <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-medium mb-2">No runs yet</h2>
        <p className="text-slate-400 text-sm">
          Symphony will poll your tracker and start a run as soon as a ticket enters an active
          state. In mock mode, two demo issues are seeded at boot.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400 border-b border-slate-800">
        <tr>
          <th className="py-2 pr-4">Issue</th>
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
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "running"
        ? "bg-cyan-500/10 text-cyan-300"
        : status === "max_turns"
          ? "bg-amber-500/10 text-amber-300"
          : status === "failed"
            ? "bg-rose-500/10 text-rose-300"
            : "bg-slate-500/10 text-slate-300";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}
