import { useEffect, useState } from "react";
import { fetchRun, type ApiRunDetail } from "./api.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready"; detail: ApiRunDetail }
  | { tag: "error"; message: string };

export function RunDetail({ runId }: { runId: string }) {
  const [state, setState] = useState<LoadState>({ tag: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const detail = await fetchRun(runId);
        if (!cancelled) setState({ tag: "ready", detail });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    };
    load();
    const es = new EventSource("/api/events");
    const reload = () => void load();
    es.addEventListener("turn", reload);
    es.addEventListener("runFinished", reload);
    return () => {
      cancelled = true;
      es.close();
    };
  }, [runId]);

  if (state.tag === "loading") return <p className="text-slate-400">loading…</p>;
  if (state.tag === "error") return <p className="text-rose-400">{state.message}</p>;

  const { run, turns, events } = state.detail;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">{run.issueIdentifier}</h2>
        <p className="text-sm text-slate-400">
          Status: <span className="font-mono">{run.status}</span> · Started{" "}
          {new Date(run.startedAt).toLocaleTimeString()}
          {run.finishedAt && <> · Finished {new Date(run.finishedAt).toLocaleTimeString()}</>}
        </p>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase text-slate-400 mb-2">Turns</h3>
        <ul className="space-y-3">
          {turns.map((t) => (
            <li key={t.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  <span className="font-mono text-cyan-400">#{t.turnNumber}</span>{" "}
                  <span className="uppercase">{t.role}</span>
                </span>
                {t.finalState && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                    → {t.finalState}
                  </span>
                )}
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{t.content}</pre>
              {t.toolCalls && (
                <pre className="mt-2 text-xs text-slate-500 overflow-x-auto">{t.toolCalls}</pre>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase text-slate-400 mb-2">Events</h3>
        <ul className="text-xs font-mono text-slate-400 space-y-0.5">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
              <span className="text-cyan-400">{e.eventType}</span>
              {e.payload && <span className="text-slate-500"> {e.payload}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
