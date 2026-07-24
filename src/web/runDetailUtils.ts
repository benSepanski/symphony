import { HttpError, type ApiEvent, type ApiRun } from "./api.js";

export const ASSISTANT_LINE_THRESHOLD = 12;
export const TOOL_LINE_THRESHOLD = 12;

export function turnLineThreshold(role: string): number {
  return role === "tool" ? TOOL_LINE_THRESHOLD : ASSISTANT_LINE_THRESHOLD;
}

export function turnLineCount(content: string): number {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

export function shouldCollapseTurn(content: string, threshold: number): boolean {
  return turnLineCount(content) > threshold;
}

export function collapsedSummary(
  content: string,
  threshold: number,
): { head: string; remaining: number } {
  const lines = content.split("\n");
  if (lines.length <= threshold) return { head: content, remaining: 0 };
  return { head: lines.slice(0, threshold).join("\n"), remaining: lines.length - threshold };
}

const ERROR_EVENT_RE = /error/i;

export function findErrorEvents(events: ReadonlyArray<ApiEvent>): ApiEvent[] {
  return events.filter((e) => ERROR_EVENT_RE.test(e.eventType));
}

export type TurnsEmptyState = {
  text: string;
  live: boolean;
};

// Copy for the "no turns yet" empty state, branched on run.status so a
// running-but-pre-first-turn run reads as "waiting" and a failed pre-turn
// run points the reader's eye up to the ErrorSurface instead of leaving a
// mystery gap under the Turns heading. `live` marks the running case so the
// caller can wire aria-live for screen-reader announcements.
export function turnsEmptyState(status: string): TurnsEmptyState {
  if (status === "running") {
    return { text: "Waiting for the first turn…", live: true };
  }
  if (status === "failed" || status === "cancelled") {
    return { text: "No turns were recorded before the run ended.", live: false };
  }
  return { text: "No turns recorded for this run.", live: false };
}

export function stepCursor(total: number, current: number, dir: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : total - 1;
  return (current + dir + total) % total;
}

export type ErrorNavState = {
  label: string;
  ariaLabel: string;
  canGoPrev: boolean;
  canGoNext: boolean;
};

export function errorNavState(total: number, cursor: number): ErrorNavState {
  if (total <= 0) {
    return { label: "", ariaLabel: "No errors", canGoPrev: false, canGoNext: false };
  }
  if (cursor < 0) {
    const noun = total === 1 ? "error" : "errors";
    const label = `${total} ${noun}`;
    return { label, ariaLabel: label, canGoPrev: true, canGoNext: true };
  }
  const bounded = Math.min(Math.max(cursor, 0), total - 1);
  return {
    label: `${bounded + 1} / ${total}`,
    ariaLabel: `Error ${bounded + 1} of ${total}`,
    canGoPrev: bounded !== 0,
    canGoNext: bounded !== total - 1,
  };
}

export function eventDomId(eventId: number): string {
  return `event-${eventId}`;
}

export function turnDomId(turnNumber: number): string {
  return `turn-${turnNumber}`;
}

export type RenderedPromptView =
  | { kind: "none" }
  | { kind: "same" }
  | { kind: "distinct"; prompt: string };

export function renderedPromptView(
  current: string | null,
  previous: string | null,
): RenderedPromptView {
  if (!current) return { kind: "none" };
  if (previous !== null && previous === current) return { kind: "same" };
  return { kind: "distinct", prompt: current };
}

export function hasTokenUsage(run: ApiRun): boolean {
  return (
    run.tokensInput !== null ||
    run.tokensOutput !== null ||
    run.tokensCacheRead !== null ||
    run.tokensCacheCreation !== null ||
    run.totalCostUsd !== null
  );
}

export function hasStartContextSnapshot(run: ApiRun): boolean {
  const authKnown = run.authStatus !== null && run.authStatus !== "unknown";
  return authKnown || run.startFiveHourUtil !== null || run.startSevenDayUtil !== null;
}

export type RunLoadError = { kind: "not-found" } | { kind: "generic"; message: string };

export function classifyRunLoadError(err: unknown): RunLoadError {
  if (err instanceof HttpError && err.status === 404) return { kind: "not-found" };
  const message = err instanceof Error ? err.message : String(err);
  return { kind: "generic", message };
}

// sr-only text spoken while the RunDetail loading card is visible. Threading
// the runId through gives screen-reader users the same context that sighted
// users get from the URL bar / breadcrumb.
export function runLoadingSrText(runId: string): string {
  const trimmed = runId.trim();
  if (!trimmed) return "Fetching run turns and events.";
  return `Fetching turns and events for run ${trimmed}.`;
}

// Per-role card affordances for `TurnCard`. Reuses the StatusBadge palette so
// cyan / slate / amber vocabulary carries in from other views. Tool turns get
// emerald — they're always the tail of an assistant thought, so tinting them
// like a "completed" event reads naturally.
export type TurnRoleStyle = {
  cardBorder: string;
  chip: string;
};

const ROLE_STYLES: Record<string, TurnRoleStyle> = {
  assistant: {
    cardBorder: "border-l-cyan-500/60",
    chip: "bg-cyan-500/10 text-cyan-300",
  },
  user: {
    cardBorder: "border-l-slate-500/40",
    chip: "bg-slate-500/10 text-slate-300",
  },
  system: {
    cardBorder: "border-l-amber-500/60",
    chip: "bg-amber-500/10 text-amber-300",
  },
  tool: {
    cardBorder: "border-l-emerald-500/60",
    chip: "bg-emerald-500/10 text-emerald-300",
  },
};

const FALLBACK_ROLE_STYLE: TurnRoleStyle = {
  cardBorder: "border-l-slate-500/40",
  chip: "bg-slate-500/10 text-slate-300",
};

export function turnRoleStyle(role: string): TurnRoleStyle {
  return ROLE_STYLES[role] ?? FALLBACK_ROLE_STYLE;
}

export type AutoFollowUiState =
  | { kind: "toggle"; autoFollow: boolean }
  | { kind: "finishedPill" }
  | { kind: "hidden" };

// The Auto-follow toggle is only meaningful for a live run. When a run finishes
// mid-view we want the transition to be *visible* — dropping the toggle to a
// bare header would leave the user wondering "did the toggle just move?". If
// auto-follow was ever on during the live phase, replace the toggle with a
// short pill so the section header still carries the run-finished signal.
export function autoFollowUiState({
  isLive,
  autoFollow,
  wasAutoFollowing,
}: {
  isLive: boolean;
  autoFollow: boolean;
  wasAutoFollowing: boolean;
}): AutoFollowUiState {
  if (isLive) return { kind: "toggle", autoFollow };
  if (wasAutoFollowing) return { kind: "finishedPill" };
  return { kind: "hidden" };
}
