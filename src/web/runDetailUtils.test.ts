import { describe, expect, it } from "vitest";
import { HttpError, type ApiEvent, type ApiRun } from "./api.js";
import {
  ASSISTANT_LINE_THRESHOLD,
  TOOL_LINE_THRESHOLD,
  autoFollowUiState,
  classifyRunLoadError,
  collapsedSummary,
  errorNavState,
  eventDomId,
  findErrorEvents,
  hasStartContextSnapshot,
  hasTokenUsage,
  renderedPromptView,
  runLoadingSrText,
  shouldCollapseTurn,
  stepCursor,
  turnDomId,
  turnLineCount,
  turnLineThreshold,
  turnRoleStyle,
  turnsEmptyState,
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
  it("keeps short tool output (<= threshold) inline", () => {
    const short = Array.from({ length: TOOL_LINE_THRESHOLD }, (_, i) => `line ${i}`).join("\n");
    expect(shouldCollapseTurn(short, TOOL_LINE_THRESHOLD)).toBe(false);
  });
  it("collapses tool content above the tool threshold", () => {
    const long = Array.from({ length: TOOL_LINE_THRESHOLD + 1 }, (_, i) => `line ${i}`).join("\n");
    expect(shouldCollapseTurn(long, TOOL_LINE_THRESHOLD)).toBe(true);
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
  it("collapses tool output to the first TOOL_LINE_THRESHOLD lines", () => {
    const total = TOOL_LINE_THRESHOLD + 3;
    const lines = Array.from({ length: total }, (_, i) => `line ${i}`);
    const out = collapsedSummary(lines.join("\n"), TOOL_LINE_THRESHOLD);
    expect(out.head.split("\n")).toHaveLength(TOOL_LINE_THRESHOLD);
    expect(out.head).toBe(lines.slice(0, TOOL_LINE_THRESHOLD).join("\n"));
    expect(out.remaining).toBe(3);
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

describe("classifyRunLoadError", () => {
  it("returns not-found for a 404 HttpError", () => {
    expect(classifyRunLoadError(new HttpError(404, "/api/runs/x returned 404"))).toEqual({
      kind: "not-found",
    });
  });
  it("returns generic for a non-404 HttpError, preserving the message", () => {
    expect(classifyRunLoadError(new HttpError(500, "/api/runs/x returned 500"))).toEqual({
      kind: "generic",
      message: "/api/runs/x returned 500",
    });
  });
  it("returns generic for a plain Error (transport failure, no status)", () => {
    expect(classifyRunLoadError(new Error("network down"))).toEqual({
      kind: "generic",
      message: "network down",
    });
  });
  it("stringifies non-Error thrown values", () => {
    expect(classifyRunLoadError("boom")).toEqual({ kind: "generic", message: "boom" });
  });
});

describe("runLoadingSrText", () => {
  it("includes the runId so screen readers know which run is being fetched", () => {
    expect(runLoadingSrText("r-42")).toBe("Fetching turns and events for run r-42.");
  });
  it("falls back to a generic sentence when the runId is empty or whitespace", () => {
    expect(runLoadingSrText("")).toBe("Fetching run turns and events.");
    expect(runLoadingSrText("   ")).toBe("Fetching run turns and events.");
  });
  it("trims surrounding whitespace on the runId", () => {
    expect(runLoadingSrText("  BEN-1  ")).toBe("Fetching turns and events for run BEN-1.");
  });
});

describe("renderedPromptView", () => {
  it("is 'none' when the current prompt is null or empty", () => {
    expect(renderedPromptView(null, null)).toEqual({ kind: "none" });
    expect(renderedPromptView(null, "prev")).toEqual({ kind: "none" });
    expect(renderedPromptView("", "prev")).toEqual({ kind: "none" });
  });
  it("is 'distinct' for the first turn (no previous)", () => {
    expect(renderedPromptView("prompt-a", null)).toEqual({
      kind: "distinct",
      prompt: "prompt-a",
    });
  });
  it("is 'distinct' when the previous prompt differs", () => {
    expect(renderedPromptView("prompt-b", "prompt-a")).toEqual({
      kind: "distinct",
      prompt: "prompt-b",
    });
  });
  it("is 'same' when the previous prompt matches exactly", () => {
    expect(renderedPromptView("prompt-a", "prompt-a")).toEqual({ kind: "same" });
  });
  it("treats trailing whitespace as a distinct prompt (no fuzzy match)", () => {
    expect(renderedPromptView("prompt-a\n", "prompt-a")).toEqual({
      kind: "distinct",
      prompt: "prompt-a\n",
    });
  });
});

describe("turnDomId / eventDomId", () => {
  it("returns turn-<n> anchors for turn cards", () => {
    expect(turnDomId(0)).toBe("turn-0");
    expect(turnDomId(42)).toBe("turn-42");
  });
  it("returns event-<n> anchors for event rows", () => {
    expect(eventDomId(1)).toBe("event-1");
    expect(eventDomId(9999)).toBe("event-9999");
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

describe("turnRoleStyle", () => {
  it("returns a distinct border color per known role", () => {
    const roles = ["assistant", "user", "system", "tool"];
    const borders = roles.map((r) => turnRoleStyle(r).cardBorder);
    expect(new Set(borders).size).toBe(roles.length);
  });
  it("returns a distinct chip color per known role", () => {
    const roles = ["assistant", "user", "system", "tool"];
    const chips = roles.map((r) => turnRoleStyle(r).chip);
    expect(new Set(chips).size).toBe(roles.length);
  });
  it("falls back to slate for unknown roles", () => {
    expect(turnRoleStyle("mystery")).toEqual(turnRoleStyle("user"));
    expect(turnRoleStyle("")).toEqual(turnRoleStyle("user"));
  });
  it("uses the StatusBadge cyan / amber vocabulary for assistant and system", () => {
    expect(turnRoleStyle("assistant").chip).toContain("cyan");
    expect(turnRoleStyle("system").chip).toContain("amber");
  });
});

describe("autoFollowUiState", () => {
  it("renders the toggle while the run is live regardless of history", () => {
    expect(autoFollowUiState({ isLive: true, autoFollow: false, wasAutoFollowing: false })).toEqual(
      { kind: "toggle", autoFollow: false },
    );
    expect(autoFollowUiState({ isLive: true, autoFollow: true, wasAutoFollowing: false })).toEqual({
      kind: "toggle",
      autoFollow: true,
    });
    expect(autoFollowUiState({ isLive: true, autoFollow: false, wasAutoFollowing: true })).toEqual({
      kind: "toggle",
      autoFollow: false,
    });
  });
  it("hides the affordance for a finished run that was never followed", () => {
    expect(
      autoFollowUiState({ isLive: false, autoFollow: false, wasAutoFollowing: false }),
    ).toEqual({ kind: "hidden" });
  });
  it("swaps in the finished pill when the user had turned auto-follow on", () => {
    expect(autoFollowUiState({ isLive: false, autoFollow: false, wasAutoFollowing: true })).toEqual(
      { kind: "finishedPill" },
    );
  });
  it("still shows the pill during the reset frame where autoFollow is briefly true post-finish", () => {
    expect(autoFollowUiState({ isLive: false, autoFollow: true, wasAutoFollowing: true })).toEqual({
      kind: "finishedPill",
    });
  });
});

describe("turnsEmptyState", () => {
  it("prompts screen readers that we're waiting for the first turn on a live run", () => {
    expect(turnsEmptyState("running")).toEqual({
      text: "Waiting for the first turn…",
      live: true,
    });
  });
  it("points the reader up to the ErrorSurface when the run failed before any turns", () => {
    expect(turnsEmptyState("failed")).toEqual({
      text: "No turns were recorded before the run ended.",
      live: false,
    });
  });
  it("uses the same 'ended before any turns' copy for a cancelled run", () => {
    expect(turnsEmptyState("cancelled")).toEqual({
      text: "No turns were recorded before the run ended.",
      live: false,
    });
  });
  it("falls back to a neutral 'no turns recorded' message for other terminal statuses", () => {
    expect(turnsEmptyState("completed")).toEqual({
      text: "No turns recorded for this run.",
      live: false,
    });
    expect(turnsEmptyState("max_turns")).toEqual({
      text: "No turns recorded for this run.",
      live: false,
    });
    expect(turnsEmptyState("rate_limited")).toEqual({
      text: "No turns recorded for this run.",
      live: false,
    });
  });
  it("does not mark unknown statuses as live to avoid noisy screen-reader announcements", () => {
    expect(turnsEmptyState("some_new_status").live).toBe(false);
  });
});

describe("errorNavState", () => {
  it("returns an empty, fully-disabled state when total is 0", () => {
    expect(errorNavState(0, -1)).toEqual({
      label: "",
      ariaLabel: "No errors",
      canGoPrev: false,
      canGoNext: false,
    });
  });
  it("shows the count and enables both buttons before the user seeds the cursor", () => {
    expect(errorNavState(3, -1)).toEqual({
      label: "3 errors",
      ariaLabel: "3 errors",
      canGoPrev: true,
      canGoNext: true,
    });
  });
  it("uses singular 'error' when only one is present", () => {
    expect(errorNavState(1, -1)).toEqual({
      label: "1 error",
      ariaLabel: "1 error",
      canGoPrev: true,
      canGoNext: true,
    });
  });
  it("shows N / total once the cursor is seeded", () => {
    expect(errorNavState(3, 1)).toEqual({
      label: "2 / 3",
      ariaLabel: "Error 2 of 3",
      canGoPrev: true,
      canGoNext: true,
    });
  });
  it("disables prev at the first position and keeps next enabled", () => {
    const s = errorNavState(3, 0);
    expect(s.label).toBe("1 / 3");
    expect(s.canGoPrev).toBe(false);
    expect(s.canGoNext).toBe(true);
  });
  it("disables next at the last position and keeps prev enabled", () => {
    const s = errorNavState(3, 2);
    expect(s.label).toBe("3 / 3");
    expect(s.canGoPrev).toBe(true);
    expect(s.canGoNext).toBe(false);
  });
  it("disables both when the only error is selected", () => {
    const s = errorNavState(1, 0);
    expect(s.label).toBe("1 / 1");
    expect(s.canGoPrev).toBe(false);
    expect(s.canGoNext).toBe(false);
  });
  it("clamps a stale cursor past the end without going out of bounds", () => {
    expect(errorNavState(2, 5)).toEqual({
      label: "2 / 2",
      ariaLabel: "Error 2 of 2",
      canGoPrev: true,
      canGoNext: false,
    });
  });
});
