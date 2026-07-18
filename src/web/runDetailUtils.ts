import { HttpError, type ApiEvent, type ApiRun } from "./api.js";

export const ASSISTANT_LINE_THRESHOLD = 12;
export const TOOL_LINE_THRESHOLD = 1;

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

export function stepCursor(total: number, current: number, dir: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : total - 1;
  return (current + dir + total) % total;
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
