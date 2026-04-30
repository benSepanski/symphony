import { useEffect, useState } from "react";
import { fetchRun, type ApiEvent, type ApiRun, type ApiRunDetail } from "./api.js";
import { StatusBadge } from "./Dashboard.js";
import { formatRunTs, formatRunTsTitle } from "./shared.js";
import { useEventStream } from "./useEventStream.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready"; detail: ApiRunDetail }
  | { tag: "error"; message: string };

export function RunDetail({ runId }: { runId: string }) {
  const [state, setState] = useState<LoadState>({ tag: "loading" });

  useEventStream(["turn", "runFinished"], async () => {
    try {
      const detail = await fetchRun(runId);
      setState({ tag: "ready", detail });
    } catch (err) {
      setState({ tag: "error", message: (err as Error).message });
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchRun(runId);
        if (!cancelled) setState({ tag: "ready", detail });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (state.tag === "loading") return <p className="text-slate-400">loading…</p>;
  if (state.tag === "error") return <p className="text-rose-400">{state.message}</p>;

  const { run, turns, events } = state.detail;
  const errorEvent = events.find((e) => e.eventType === "error");

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold font-mono">{run.issueIdentifier}</h2>
          <StatusBadge status={run.status} />
        </div>
        {run.issueTitle && <p className="mt-1 text-slate-300">{run.issueTitle}</p>}
        <p className="mt-1 text-xs text-slate-500">
          Started <span title={formatRunTsTitle(run.startedAt)}>{formatRunTs(run.startedAt)}</span>
          {run.finishedAt && (
            <>
              {" "}
              · finished{" "}
              <span title={formatRunTsTitle(run.finishedAt)}>{formatRunTs(run.finishedAt)}</span>
            </>
          )}
          {run.scenario && <> · scenario {run.scenario}</>}
        </p>
      </section>

      {(run.status === "failed" || run.status === "cancelled") && (
        <ErrorSurface status={run.status} errorEvent={errorEvent} />
      )}

      <HistoryFacts run={run} />

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
              {t.renderedPrompt && (
                <details className="mt-2 text-xs text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-200">
                    prompt the model saw
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap text-slate-500 border-l border-slate-800 pl-3">
                    {t.renderedPrompt}
                  </pre>
                </details>
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
              <span className="text-slate-500" title={formatRunTsTitle(e.ts)}>
                {formatRunTs(e.ts)}
              </span>{" "}
              <span className="text-cyan-400">{e.eventType}</span>
              {e.payload && <span className="text-slate-500"> {e.payload}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ErrorSurface({
  status,
  errorEvent,
}: {
  status: string;
  errorEvent: ApiEvent | undefined;
}) {
  const parsed =
    errorEvent && errorEvent.payload
      ? (safeParse(errorEvent.payload) as { message?: string; name?: string } | null)
      : null;
  return (
    <section className="rounded border border-rose-800 bg-rose-950/40 p-4">
      <h3 className="text-sm font-semibold uppercase text-rose-300">
        {status === "cancelled" ? "Cancelled" : "Error"}
      </h3>
      {parsed?.message ? (
        <p className="mt-2 text-rose-100 font-mono text-sm whitespace-pre-wrap">
          {parsed.name ? `${parsed.name}: ` : ""}
          {parsed.message}
        </p>
      ) : (
        <p className="mt-2 text-rose-200 text-sm">
          {status === "cancelled"
            ? "Run was cancelled before completing."
            : "Run failed. No structured error payload was recorded."}
        </p>
      )}
    </section>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function HistoryFacts({ run }: { run: ApiRun }) {
  const hasUsage =
    run.tokensInput !== null ||
    run.tokensOutput !== null ||
    run.tokensCacheRead !== null ||
    run.tokensCacheCreation !== null ||
    run.totalCostUsd !== null;
  const hasStartContext =
    run.authStatus !== null || run.startFiveHourUtil !== null || run.startSevenDayUtil !== null;
  if (!hasUsage && !hasStartContext) return null;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">Token usage</h3>
        {hasUsage ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono text-slate-300">
            <dt className="text-slate-500">input</dt>
            <dd className="tabular-nums">{formatCount(run.tokensInput)}</dd>
            <dt className="text-slate-500">output</dt>
            <dd className="tabular-nums">{formatCount(run.tokensOutput)}</dd>
            <dt className="text-slate-500">cache read</dt>
            <dd className="tabular-nums">{formatCount(run.tokensCacheRead)}</dd>
            <dt className="text-slate-500">cache create</dt>
            <dd className="tabular-nums">{formatCount(run.tokensCacheCreation)}</dd>
            <dt className="text-slate-500">total cost</dt>
            <dd className="tabular-nums">{formatCostDetailed(run.totalCostUsd)}</dd>
          </dl>
        ) : (
          <p className="text-xs text-slate-500">No token usage recorded for this run.</p>
        )}
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">Start context</h3>
        {hasStartContext ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono text-slate-300">
            <dt className="text-slate-500">auth</dt>
            <dd>{run.authStatus ?? "—"}</dd>
            <dt className="text-slate-500">5h utilization</dt>
            <dd className="tabular-nums">{formatPctOrDash(run.startFiveHourUtil)}</dd>
            <dt className="text-slate-500">7d utilization</dt>
            <dd className="tabular-nums">{formatPctOrDash(run.startSevenDayUtil)}</dd>
          </dl>
        ) : (
          <p className="text-xs text-slate-500">No start-context snapshot recorded.</p>
        )}
      </div>
    </section>
  );
}

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

function formatCostDetailed(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function formatPctOrDash(util: number | null): string {
  if (util === null || !Number.isFinite(util)) return "—";
  const pct = util <= 1 ? util * 100 : util;
  return `${pct.toFixed(0)}%`;
}
