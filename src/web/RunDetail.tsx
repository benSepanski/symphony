import { useEffect, useMemo, useRef, useState } from "react";
import type { RunHeader } from "./appHeader.js";
import { fetchRun, type ApiEvent, type ApiRun, type ApiRunDetail, type ApiTurn } from "./api.js";
import { StatusBadge, formatPct, formatRunTimestamp, formatTs } from "./shared.js";
import { useEventStream } from "./useEventStream.js";
import {
  ASSISTANT_LINE_THRESHOLD,
  classifyRunLoadError,
  collapsedSummary,
  errorNavState,
  eventDomId,
  findErrorEvents,
  hasStartContextSnapshot,
  hasTokenUsage,
  renderedPromptView,
  shouldCollapseTurn,
  stepCursor,
  turnDomId,
  turnLineCount,
  turnLineThreshold,
  turnRoleStyle,
  type RenderedPromptView,
  type RunLoadError,
} from "./runDetailUtils.js";

type LoadState =
  | { tag: "loading" }
  | { tag: "ready"; detail: ApiRunDetail }
  | { tag: "error"; error: RunLoadError };

export function RunDetail({
  runId,
  fragment,
  onHeaderResolved,
}: {
  runId: string;
  fragment: string | null;
  onHeaderResolved?: (header: RunHeader) => void;
}) {
  const [state, setState] = useState<LoadState>({ tag: "loading" });

  useEventStream(["turn", "runFinished"], async () => {
    try {
      const detail = await fetchRun(runId);
      setState({ tag: "ready", detail });
      onHeaderResolved?.({ runId, issueIdentifier: detail.run.issueIdentifier });
    } catch (err) {
      setState({ tag: "error", error: classifyRunLoadError(err) });
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchRun(runId);
        if (cancelled) return;
        setState({ tag: "ready", detail });
        onHeaderResolved?.({ runId, issueIdentifier: detail.run.issueIdentifier });
      } catch (err) {
        if (!cancelled) setState({ tag: "error", error: classifyRunLoadError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, onHeaderResolved]);

  useScrollToFragment(fragment, state.tag === "ready");

  if (state.tag === "loading") return <p className="text-slate-400">loading…</p>;
  if (state.tag === "error") return <RunLoadErrorCard runId={runId} error={state.error} />;

  const { run, turns, events } = state.detail;
  const errorEvent = events.find((e) => e.eventType === "error");
  const isLive = run.status === "running";
  const now = new Date();

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold font-mono">{run.issueIdentifier}</h2>
          <StatusBadge status={run.status} />
        </div>
        {run.issueTitle && <p className="mt-1 text-slate-300">{run.issueTitle}</p>}
        <p className="mt-1 text-xs text-slate-500">
          Started <time dateTime={run.startedAt}>{formatRunTimestamp(run.startedAt, now)}</time>
          {run.finishedAt && (
            <>
              {" · Finished "}
              <time dateTime={run.finishedAt}>{formatRunTimestamp(run.finishedAt, now)}</time>
            </>
          )}
          {run.scenario && <> · Scenario {run.scenario}</>}
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

  const errorNav = errorNavState(errorEvents.length, errorCursor);

  const jumpError = (dir: 1 | -1) => {
    if (dir === 1 ? !errorNav.canGoNext : !errorNav.canGoPrev) return;
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
              <button
                type="button"
                onClick={() => jumpError(-1)}
                disabled={!errorNav.canGoPrev}
                className="rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Jump to previous error event"
              >
                ↑ prev
              </button>
              <span
                className="min-w-[3.5rem] px-1 text-center tabular-nums text-slate-400"
                aria-live="polite"
                aria-atomic="true"
                aria-label={errorNav.ariaLabel}
              >
                {errorNav.label}
              </span>
              <button
                type="button"
                onClick={() => jumpError(1)}
                disabled={!errorNav.canGoNext}
                className="rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
        {turns.map((t, i) => (
          <TurnCard
            key={t.id}
            turn={t}
            promptView={renderedPromptView(t.renderedPrompt, turns[i - 1]?.renderedPrompt ?? null)}
          />
        ))}
      </ul>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </section>
  );
}

function TurnCard({ turn, promptView }: { turn: ApiTurn; promptView: RenderedPromptView }) {
  const threshold = turnLineThreshold(turn.role);
  const collapsible = shouldCollapseTurn(turn.content, threshold);
  const [expanded, setExpanded] = useState(false);
  const showCollapsed = collapsible && !expanded;
  const summary = showCollapsed ? collapsedSummary(turn.content, threshold) : null;
  const roleStyle = turnRoleStyle(turn.role);

  return (
    <li
      id={turnDomId(turn.turnNumber)}
      className={`rounded border border-l-2 border-slate-800 bg-slate-900/60 p-3 ${roleStyle.cardBorder}`}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="font-mono text-cyan-400">#{turn.turnNumber}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${roleStyle.chip}`}
          >
            {turn.role}
          </span>
        </span>
        {turn.finalState && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
            → {turn.finalState}
          </span>
        )}
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">
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
      <RenderedPromptBlock view={promptView} />
    </li>
  );
}

function RenderedPromptBlock({ view }: { view: RenderedPromptView }) {
  if (view.kind === "none") return null;
  if (view.kind === "same") {
    return (
      <p className="mt-3 text-xs text-slate-500 italic">Same rendered prompt as previous turn</p>
    );
  }
  return (
    <details className="mt-3 rounded border border-slate-800/80 bg-slate-950/40 p-2 text-xs text-slate-400">
      <summary className="cursor-pointer rounded font-medium text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
        <span aria-hidden="true" className="mr-1 text-slate-500">
          ⓘ
        </span>
        Rendered prompt the model saw
      </summary>
      <pre className="mt-2 whitespace-pre-wrap break-words text-slate-500 border-l border-slate-800 pl-3">
        {view.prompt}
      </pre>
    </details>
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
              <span className="text-slate-500">{formatTs(e.ts)}</span>{" "}
              <span className={isError ? "text-rose-300" : "text-cyan-400"}>{e.eventType}</span>
              {e.payload && <span className="text-slate-500"> {e.payload}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RunLoadErrorCard({ runId, error }: { runId: string; error: RunLoadError }) {
  const heading = error.kind === "not-found" ? "Run not found" : "Couldn't load run";
  return (
    <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-medium mb-2">{heading}</h2>
      <p className="text-slate-400 text-sm">
        {error.kind === "not-found" ? (
          <>
            No run matches <code className="font-mono text-slate-300">{runId}</code>. It may have
            been pruned from the log, or the link may point to a run that never existed.
          </>
        ) : (
          <>
            Symphony couldn't load <code className="font-mono text-slate-300">{runId}</code>:{" "}
            <span className="font-mono">{error.message}</span>
          </>
        )}
      </p>
      <a
        href="#/"
        className="mt-4 inline-block rounded text-sm text-cyan-400 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        ← Back to runs
      </a>
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
  const showUsage = hasTokenUsage(run);
  const showStartContext = hasStartContextSnapshot(run);
  if (!showUsage && !showStartContext) return null;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {showUsage && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">Token usage</h3>
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
        </div>
      )}
      {showStartContext && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 mb-2">Start context</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono text-slate-300">
            <dt className="text-slate-500">auth</dt>
            <dd>{run.authStatus ?? "—"}</dd>
            <dt className="text-slate-500">5h utilization</dt>
            <dd className="tabular-nums">{formatPct(run.startFiveHourUtil)}</dd>
            <dt className="text-slate-500">7d utilization</dt>
            <dd className="tabular-nums">{formatPct(run.startSevenDayUtil)}</dd>
          </dl>
        </div>
      )}
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
  return `$${usd.toFixed(4)}`;
}

const FRAGMENT_HIGHLIGHT_CLASSES = [
  "ring-2",
  "ring-cyan-500",
  "ring-offset-2",
  "ring-offset-slate-950",
];
const FRAGMENT_HIGHLIGHT_MS = 1800;

function useScrollToFragment(fragment: string | null, ready: boolean) {
  useEffect(() => {
    if (!ready || !fragment) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(fragment);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add(...FRAGMENT_HIGHLIGHT_CLASSES);
      window.setTimeout(() => {
        el.classList.remove(...FRAGMENT_HIGHLIGHT_CLASSES);
      }, FRAGMENT_HIGHLIGHT_MS);
    });
    return () => cancelAnimationFrame(raf);
  }, [fragment, ready]);
}
