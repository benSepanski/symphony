import { describe, expect, it } from "vitest";
import type { ApiRun } from "./api.js";
import { applyRunFinishedEvent, applyTurnEvent, hasRun, replaceRun } from "./dashboardEvents.js";

function makeRun(overrides: Partial<ApiRun> = {}): ApiRun {
  return {
    id: "run-1",
    issueId: "issue-1",
    issueIdentifier: "BEN-1",
    issueTitle: "demo",
    status: "running",
    startedAt: "2026-05-03T00:00:00.000Z",
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

describe("applyTurnEvent", () => {
  it("increments turnCount on the matching run", () => {
    const runs = [makeRun({ id: "a", turnCount: 2 }), makeRun({ id: "b", turnCount: 5 })];
    const { next, matched } = applyTurnEvent(runs, "b");
    expect(matched).toBe(true);
    expect(next.map((r) => [r.id, r.turnCount])).toEqual([
      ["a", 2],
      ["b", 6],
    ]);
  });

  it("returns the same array reference when the run is not present", () => {
    const runs = [makeRun({ id: "a" })];
    const result = applyTurnEvent(runs, "missing");
    expect(result.matched).toBe(false);
    expect(result.next).toBe(runs);
  });

  it("does not mutate the input array or row", () => {
    const row = makeRun({ id: "a", turnCount: 1 });
    const runs = [row];
    applyTurnEvent(runs, "a");
    expect(row.turnCount).toBe(1);
    expect(runs[0]).toBe(row);
  });
});

describe("applyRunFinishedEvent", () => {
  it("updates status and stamps finishedAt when missing", () => {
    const runs = [makeRun({ id: "a", status: "running", finishedAt: null })];
    const finishedAt = "2026-05-03T01:23:45.000Z";
    const { next, matched } = applyRunFinishedEvent(runs, "a", "completed", finishedAt);
    expect(matched).toBe(true);
    expect(next[0].status).toBe("completed");
    expect(next[0].finishedAt).toBe(finishedAt);
  });

  it("preserves an existing finishedAt rather than overwriting it", () => {
    const earlier = "2026-05-02T00:00:00.000Z";
    const runs = [makeRun({ id: "a", status: "running", finishedAt: earlier })];
    const { next } = applyRunFinishedEvent(runs, "a", "failed", "2026-05-03T01:23:45.000Z");
    expect(next[0].finishedAt).toBe(earlier);
    expect(next[0].status).toBe("failed");
  });

  it("returns the original array when no run matches", () => {
    const runs = [makeRun({ id: "a" })];
    const result = applyRunFinishedEvent(runs, "missing", "completed", "2026-05-03T00:00:00.000Z");
    expect(result.matched).toBe(false);
    expect(result.next).toBe(runs);
  });
});

describe("replaceRun", () => {
  it("replaces the matching row by id", () => {
    const runs = [makeRun({ id: "a", turnCount: 1 }), makeRun({ id: "b", turnCount: 2 })];
    const updated = makeRun({
      id: "b",
      turnCount: 9,
      status: "completed",
      finishedAt: "2026-05-03T02:00:00.000Z",
      tokensInput: 100,
    });
    const next = replaceRun(runs, updated);
    expect(next[0]).toBe(runs[0]);
    expect(next[1]).toBe(updated);
  });

  it("returns the input array when the id is unknown", () => {
    const runs = [makeRun({ id: "a" })];
    const updated = makeRun({ id: "missing" });
    expect(replaceRun(runs, updated)).toBe(runs);
  });
});

describe("hasRun", () => {
  it("is true when the id is present", () => {
    expect(hasRun([makeRun({ id: "a" })], "a")).toBe(true);
  });
  it("is false when the id is absent", () => {
    expect(hasRun([makeRun({ id: "a" })], "b")).toBe(false);
  });
  it("is false on an empty list", () => {
    expect(hasRun([], "a")).toBe(false);
  });
});
