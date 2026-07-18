import { describe, expect, it } from "vitest";
import type { ApiSearchMatch } from "./api.js";
import {
  EMPTY_FILTERS,
  SUGGESTED_QUERIES,
  availableStatuses,
  filterMatches,
  matchHref,
  summarizeMatches,
  toggleSetMember,
} from "./searchUtils.js";

function match(overrides: Partial<ApiSearchMatch> = {}): ApiSearchMatch {
  return {
    runId: "run-1",
    issueIdentifier: "BEN-1",
    issueTitle: "demo",
    status: "completed",
    matchKind: "turn",
    turnNumber: 1,
    eventType: null,
    eventId: null,
    snippet: "hello",
    ...overrides,
  };
}

describe("summarizeMatches", () => {
  it("returns zeroes for an empty list", () => {
    expect(summarizeMatches([])).toEqual({ total: 0, runs: 0, turns: 0, events: 0 });
  });

  it("counts unique runs and per-kind matches", () => {
    const matches = [
      match({ runId: "a", matchKind: "turn", turnNumber: 1 }),
      match({ runId: "a", matchKind: "turn", turnNumber: 2 }),
      match({ runId: "a", matchKind: "event", turnNumber: null, eventType: "error" }),
      match({ runId: "b", matchKind: "event", turnNumber: null, eventType: "error" }),
    ];
    expect(summarizeMatches(matches)).toEqual({ total: 4, runs: 2, turns: 2, events: 2 });
  });
});

describe("availableStatuses", () => {
  it("dedupes and sorts statuses", () => {
    const matches = [
      match({ status: "running" }),
      match({ status: "completed" }),
      match({ status: "running" }),
      match({ status: "failed" }),
    ];
    expect(availableStatuses(matches)).toEqual(["completed", "failed", "running"]);
  });

  it("returns [] when there are no matches", () => {
    expect(availableStatuses([])).toEqual([]);
  });
});

describe("filterMatches", () => {
  const matches = [
    match({ runId: "a", matchKind: "turn", status: "completed" }),
    match({ runId: "b", matchKind: "event", status: "running", eventType: "tool" }),
    match({ runId: "c", matchKind: "turn", status: "failed" }),
  ];

  it("returns a copy when no filters are active", () => {
    const out = filterMatches(matches, EMPTY_FILTERS);
    expect(out).toEqual(matches);
    expect(out).not.toBe(matches);
  });

  it("narrows by match kind", () => {
    const out = filterMatches(matches, {
      kinds: new Set(["turn"]),
      statuses: new Set(),
    });
    expect(out.map((m) => m.runId)).toEqual(["a", "c"]);
  });

  it("narrows by status", () => {
    const out = filterMatches(matches, {
      kinds: new Set(),
      statuses: new Set(["running", "failed"]),
    });
    expect(out.map((m) => m.runId)).toEqual(["b", "c"]);
  });

  it("combines kind and status filters with AND semantics", () => {
    const out = filterMatches(matches, {
      kinds: new Set(["turn"]),
      statuses: new Set(["failed"]),
    });
    expect(out.map((m) => m.runId)).toEqual(["c"]);
  });

  it("returns an empty list when filters exclude everything", () => {
    const out = filterMatches(matches, {
      kinds: new Set(["event"]),
      statuses: new Set(["failed"]),
    });
    expect(out).toEqual([]);
  });
});

describe("SUGGESTED_QUERIES", () => {
  it("exposes 4-6 non-empty example queries", () => {
    expect(SUGGESTED_QUERIES.length).toBeGreaterThanOrEqual(4);
    expect(SUGGESTED_QUERIES.length).toBeLessThanOrEqual(6);
    for (const q of SUGGESTED_QUERIES) {
      expect(typeof q).toBe("string");
      expect(q.trim()).toBe(q);
      expect(q.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(SUGGESTED_QUERIES).size).toBe(SUGGESTED_QUERIES.length);
  });
});

describe("matchHref", () => {
  it("appends a #turn-N fragment for turn matches with a turn number", () => {
    expect(matchHref(match({ runId: "abc", matchKind: "turn", turnNumber: 7 }))).toBe(
      "#/runs/abc#turn-7",
    );
  });

  it("appends a #event-N fragment for event matches with an event id", () => {
    expect(
      matchHref(
        match({
          runId: "abc",
          matchKind: "event",
          turnNumber: null,
          eventType: "runFinished",
          eventId: 42,
        }),
      ),
    ).toBe("#/runs/abc#event-42");
  });

  it("falls back to the bare run link when the anchor id is missing", () => {
    expect(matchHref(match({ runId: "abc", matchKind: "turn", turnNumber: null }))).toBe(
      "#/runs/abc",
    );
    expect(
      matchHref(
        match({
          runId: "abc",
          matchKind: "event",
          turnNumber: null,
          eventType: "runFinished",
          eventId: null,
        }),
      ),
    ).toBe("#/runs/abc");
  });
});

describe("toggleSetMember", () => {
  it("adds a missing value", () => {
    const next = toggleSetMember(new Set(["a"]), "b");
    expect([...next].sort()).toEqual(["a", "b"]);
  });

  it("removes an existing value", () => {
    const next = toggleSetMember(new Set(["a", "b"]), "a");
    expect([...next]).toEqual(["b"]);
  });

  it("does not mutate the input", () => {
    const input = new Set(["a"]);
    toggleSetMember(input, "b");
    expect([...input]).toEqual(["a"]);
  });
});
