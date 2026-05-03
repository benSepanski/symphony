import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRun, type ApiEvent, type ApiRun, type ApiRunDetail, type ApiTurn } from "./api.js";
import { StatusBadge } from "./Dashboard.js";
import { useEventStream } from "./useEventStream.js";
import {
  ASSISTANT_LINE_THRESHOLD,
  collapsedSummary,
  eventDomId,
  findErrorEvents,
  shouldCollapseTurn,
  stepCursor,
  turnLineCount,
  turnLineThreshold,
} from "./runDetailUtils.js";

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
  const isLive = run.status === "running";

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold font-mono">{run.issueIdentifier}</h2>
          <StatusBadge status={run.status} />
        </div>
        {run.issueTitle && <p className="mt-1 text-slate-300">{run.issueTitle}</p>}
        <p className="mt-1 text-xs text-slate-500">
          Started {new Date(run.startedAt).toLocaleTimeString()}
          {run.finishedAt && <> · finished {new Date(run.finishedAt).toLocaleTimeString()}</>}
          {run.scenario && <> · scenario {run.scenario}</>}
        </p>
      </section>

      {(run.status === "failed" || run.status === "cancelled") && (
        <ErrorSurface status={run.status} errorEvent={errorEvent} />
      )}

      <HistoryFacts run={run} />

      <TurnsSection turns={turns} events={events} isLive={isLive} />

      <EventsSection events={events} />
    </div>
  );
}

function TurnsSection({
  turns,
  events,
  isLive,
}: {
  turns: ApiTurn[];
  events: ApiEvent[];
  isLive: boolean;
}) {
  const errorEvents = useMemo(() => findErrorEvents(events), [events]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const programmaticUntil = useRef<number>(0);
  const lastY = useRef<number>(typeof window !== "undefined" ? window.scrollY : 0);
  const [autoFollow, setAutoFollow] = useState(false);
  const [errorCursor, setErrorCursor] = useState(-1);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (Date.now() < programmaticUntil.current) {
        lastY.current = y;
        return;
      }
      if (autoFollow && y < lastY.current - 4) {
        setAutoFollow(false);
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoFollow]);

  useEffect(() => {
    if (!autoFollow) return;
    programmaticUntil.current = Date.now() + 600;
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [autoFollow, turns.length]);

  const jumpError = (dir: 1 | -1) => {
    const next = stepCursor(errorEvents.length, errorCursor, dir);
    if (next < 0) return;
    setErrorCursor(next);
    const id = eventDomId(errorEvents[next].id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase text-slate-400">Turns</h3>
        <div className="flex flex-wrap items-center gap-2">
          {errorEvents.length > 0 && (
            <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs">
              <span className="text-slate-400">
                {errorEvents.length === 1 ? "1 error" : `${errorEvents.length} errors`}
              </span>
              <button
                type="button"
                onClick={() => jumpError(-1)}
                className="rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label="Jump to previous error event"
              >
                ↑ prev
              </button>
              <button
                type="button"
                onClick={() => jumpError(1)}
                className="rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label="Jump to next error event"
              >
                ↓ next
              </button>
            </div>
          )}
          {isLive && (
            <button
              type="button"
              onClick={() => setAutoFollow((on) => !on)}
              aria-pressed={autoFollow}
              className={`rounded border px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                autoFollow
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                  : "border-slate-800 bg-slate-900/60 text-slate-300 hover:text-slate-100"
              }`}
            >
              {autoFollow ? "● Auto-follow on" : "○ Auto-follow"}
            </button>
          )}
        </div>
      </div>
      <ul className="space-y-3">
        {turns.map((t) => (
          <TurnCard key={t.id} turn={t} />
        ))}
      </ul>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </section>
  );
}

function TurnCard({ turn }: { turn: ApiTurn }) {
  const threshold = turnLineThreshold(turn.role);
  const collapsible = shouldCollapseTurn(turn.content, threshold);
  const [expanded, setExpanded] = useState(false);
  const showCollapsed = collapsible && !expanded;
  const summary = showCollapsed ? collapsedSummary(turn.content, threshold) : null;

  return (
    <li className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          <span className="font-mono text-cyan-400">#{turn.turnNumber}</span>{" "}
          <span className="uppercase">{turn.role}</span>
        </span>
        {turn.finalState && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
            → {turn.finalState}
          </span>
        )}
      </div>
      <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
        {showCollapsed && summary ? summary.head : turn.content}
      </pre>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1 text-xs text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          aria-expanded={expanded}
        >
          {expanded
            ? `Collapse turn (${turnLineCount(turn.content)} lines)`
            : `Show full turn (+${summary?.remaining ?? 0} more lines)`}
        </button>
      )}
      {turn.toolCalls && <ToolCalls raw={turn.toolCalls} />}
      {turn.renderedPrompt && (
        <details
          open
          className="mt-3 rounded border border-slate-800/80 bg-slate-950/40 p-2 text-xs text-slate-400"
        >
          <summary className="cursor-pointer rounded font-medium text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
            <span aria-hidden="true" className="mr-1 text-slate-500">
              ⓘ
            </span>
            Rendered prompt the model saw
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-slate-500 border-l border-slate-800 pl-3">
            {turn.renderedPrompt}
          </pre>
        </details>
      )}
    </li>
  );
}

function EventsSection({ events }: { events: ApiEvent[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase text-slate-400 mb-2">Events</h3>
      <ul className="text-xs font-mono text-slate-400 space-y-0.5">
        {events.map((e) => {
          const isError = /error/i.test(e.eventType);
          return (
            <li
              key={e.id}
              id={eventDomId(e.id)}
              className={
                isError ? "rounded bg-rose-500/10 px-1 -mx-1 ring-1 ring-rose-500/20" : undefined
              }
            >
              <span className="text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
              <span className={isError ? "text-rose-300" : "text-cyan-400"}>{e.eventType}</span>
              {e.payload && <span className="text-slate-500"> {e.payload}</span>}
            </li>
          );
        })}
      </ul>
    </section>
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

function ToolCalls({ raw }: { raw: string }) {
  const parsed = safeParse(raw);
  const pretty = parsed === null ? raw : JSON.stringify(parsed, null, 2);
  const longOutput = shouldCollapseTurn(pretty, ASSISTANT_LINE_THRESHOLD);
  return (
    <details
      open={!longOutput}
      className="mt-3 rounded border border-slate-800/80 bg-slate-950/40 p-2 text-xs text-slate-300"
    >
      <summary className="cursor-pointer rounded font-medium text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
        Tool calls{longOutput ? ` (${turnLineCount(pretty)} lines)` : ""}
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-300">
        {pretty}
      </pre>
    </details>
  );
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
