import { describe, expect, it } from "vitest";
import type { ApiEvent, ApiRun } from "./api.js";
import {
  ASSISTANT_LINE_THRESHOLD,
  TOOL_LINE_THRESHOLD,
  collapsedSummary,
  findErrorEvents,
  hasStartContextSnapshot,
  hasTokenUsage,
  shouldCollapseTurn,
  stepCursor,
  turnLineCount,
  turnLineThreshold,
} from "./runDetailUtils.js";

function ev(id: number, eventType: string): ApiEvent {
  return {
    id,
    runId: "r",
    turnId: null,
    eventType,
    issueId: null,
    payload: null,
    ts: "2026-05-03T00:00:00.000Z",
  };
}

describe("turnLineCount", () => {
  it("returns 0 for empty content", () => {
    expect(turnLineCount("")).toBe(0);
  });
  it("counts a single line as 1", () => {
    expect(turnLineCount("hello")).toBe(1);
  });
  it("counts trailing newlines", () => {
    expect(turnLineCount("a\nb\n")).toBe(3);
  });
});

describe("turnLineThreshold", () => {
  it("uses the tool threshold for tool turns", () => {
    expect(turnLineThreshold("tool")).toBe(TOOL_LINE_THRESHOLD);
  });
  it("uses the assistant threshold for assistant turns", () => {
    expect(turnLineThreshold("assistant")).toBe(ASSISTANT_LINE_THRESHOLD);
  });
  it("falls back to the assistant threshold for unknown roles", () => {
    expect(turnLineThreshold("user")).toBe(ASSISTANT_LINE_THRESHOLD);
  });
});

describe("shouldCollapseTurn", () => {
  it("does not collapse short content", () => {
    expect(shouldCollapseTurn("a\nb\nc", ASSISTANT_LINE_THRESHOLD)).toBe(false);
  });
  it("collapses content above the threshold", () => {
    const long = Array.from({ length: ASSISTANT_LINE_THRESHOLD + 1 }, (_, i) => `line ${i}`).join(
      "\n",
    );
    expect(shouldCollapseTurn(long, ASSISTANT_LINE_THRESHOLD)).toBe(true);
  });
  it("does not collapse exactly at the threshold", () => {
    const exact = Array.from({ length: ASSISTANT_LINE_THRESHOLD }, (_, i) => `line ${i}`).join(
      "\n",
    );
    expect(shouldCollapseTurn(exact, ASSISTANT_LINE_THRESHOLD)).toBe(false);
  });
  it("collapses any multi-line tool content above the tool threshold", () => {
    expect(shouldCollapseTurn("a\nb", TOOL_LINE_THRESHOLD)).toBe(true);
  });
});

describe("collapsedSummary", () => {
  it("returns the full content when under the threshold", () => {
    const out = collapsedSummary("a\nb", ASSISTANT_LINE_THRESHOLD);
    expect(out).toEqual({ head: "a\nb", remaining: 0 });
  });
  it("returns the first N lines and the remaining count", () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const out = collapsedSummary(long, 5);
    expect(out.head.split("\n")).toHaveLength(5);
    expect(out.head).toBe("line 0\nline 1\nline 2\nline 3\nline 4");
    expect(out.remaining).toBe(15);
  });
  it("collapses tool output to the first line when threshold is 1", () => {
    const out = collapsedSummary("first\nsecond\nthird", TOOL_LINE_THRESHOLD);
    expect(out).toEqual({ head: "first", remaining: 2 });
  });
});

describe("findErrorEvents", () => {
  it("matches eventType containing 'error' case-insensitively", () => {
    const events = [
      ev(1, "runStarted"),
      ev(2, "error"),
      ev(3, "rate_limit_error"),
      ev(4, "TURN_ERROR"),
      ev(5, "runFinished"),
    ];
    expect(findErrorEvents(events).map((e) => e.id)).toEqual([2, 3, 4]);
  });
  it("returns empty when none match", () => {
    expect(findErrorEvents([ev(1, "tick")])).toEqual([]);
  });
});

function makeRun(overrides: Partial<ApiRun> = {}): ApiRun {
  return {
    id: "r1",
    issueId: "BEN-1",
    issueIdentifier: "BEN-1",
    issueTitle: null,
    status: "done",
    startedAt: "2026-06-01T00:00:00.000Z",
    finishedAt: null,
    scenario: null,
    turnCount: 0,
    tokensInput: null,
    tokensOutput: null,
    tokensCacheRead: null,
    tokensCacheCreation: null,
    totalCostUsd: null,
    authStatus: null,
    startFiveHourUtil: null,
    startSevenDayUtil: null,
    ...overrides,
  };
}

describe("hasTokenUsage", () => {
  it("is false when every token/cost field is null", () => {
    expect(hasTokenUsage(makeRun())).toBe(false);
  });
  it("is true when any single token/cost field is populated", () => {
    expect(hasTokenUsage(makeRun({ tokensInput: 0 }))).toBe(true);
    expect(hasTokenUsage(makeRun({ tokensOutput: 42 }))).toBe(true);
    expect(hasTokenUsage(makeRun({ tokensCacheRead: 7 }))).toBe(true);
    expect(hasTokenUsage(makeRun({ tokensCacheCreation: 3 }))).toBe(true);
    expect(hasTokenUsage(makeRun({ totalCostUsd: 0.01 }))).toBe(true);
  });
});

describe("hasStartContextSnapshot", () => {
  it("is false when auth is unknown and utilization is missing", () => {
    expect(hasStartContextSnapshot(makeRun({ authStatus: "unknown" }))).toBe(false);
  });
  it("is false when every field is null", () => {
    expect(hasStartContextSnapshot(makeRun())).toBe(false);
  });
  it("is true for a real auth status", () => {
    expect(hasStartContextSnapshot(makeRun({ authStatus: "authenticated" }))).toBe(true);
    expect(hasStartContextSnapshot(makeRun({ authStatus: "unauthenticated" }))).toBe(true);
  });
  it("is true when either utilization is populated even if auth is unknown", () => {
    expect(
      hasStartContextSnapshot(makeRun({ authStatus: "unknown", startFiveHourUtil: 0.2 })),
    ).toBe(true);
    expect(hasStartContextSnapshot(makeRun({ startSevenDayUtil: 0.5 }))).toBe(true);
  });
});

describe("stepCursor", () => {
  it("returns -1 when there are no items", () => {
    expect(stepCursor(0, -1, 1)).toBe(-1);
    expect(stepCursor(0, 5, -1)).toBe(-1);
  });
  it("seeds forward to 0 from the unset cursor", () => {
    expect(stepCursor(3, -1, 1)).toBe(0);
  });
  it("seeds backward to the last index from the unset cursor", () => {
    expect(stepCursor(3, -1, -1)).toBe(2);
  });
  it("wraps forward at the end", () => {
    expect(stepCursor(3, 2, 1)).toBe(0);
  });
  it("wraps backward at the start", () => {
    expect(stepCursor(3, 0, -1)).toBe(2);
  });
});
