import { beforeEach, describe, expect, it } from "vitest";
import { MemoryTracker } from "./memory.js";
import type { Issue } from "./types.js";

function makeIssue(overrides: Partial<Issue>): Issue {
  return {
    id: overrides.id ?? "id",
    identifier: overrides.identifier ?? "BEN-1",
    title: overrides.title ?? "a ticket",
    description: overrides.description ?? null,
    state: overrides.state ?? "Todo",
    labels: overrides.labels ?? [],
    url: overrides.url ?? "https://example.com/BEN-1",
  };
}

describe("MemoryTracker", () => {
  let tracker: MemoryTracker;

  beforeEach(() => {
    tracker = new MemoryTracker({
      activeStates: ["Todo", "In Progress"],
      issues: [
        makeIssue({ id: "3", identifier: "BEN-3", state: "Todo" }),
        makeIssue({ id: "1", identifier: "BEN-1", state: "Todo" }),
        makeIssue({ id: "2", identifier: "BEN-2", state: "Done" }),
        makeIssue({ id: "4", identifier: "BEN-4", state: "In Progress" }),
      ],
    });
  });

  it("returns only active issues, sorted by identifier", async () => {
    const issues = await tracker.fetchCandidateIssues();
    expect(issues.map((i) => i.identifier)).toEqual(["BEN-1", "BEN-3", "BEN-4"]);
  });

  it("transitions an issue out of an active state", async () => {
    await tracker.updateIssueState("1", "Done");
    const active = await tracker.fetchCandidateIssues();
    expect(active.map((i) => i.identifier)).toEqual(["BEN-3", "BEN-4"]);
  });

  it("records comments per issue", async () => {
    await tracker.addComment("1", "hello");
    await tracker.addComment("1", "world");
    expect(tracker.getComments("1")).toEqual(["hello", "world"]);
    expect(tracker.getComments("3")).toEqual([]);
  });

  it("throws on unknown issue ids", async () => {
    await expect(tracker.updateIssueState("nope", "Done")).rejects.toThrow(/unknown issue/);
    await expect(tracker.addComment("nope", "x")).rejects.toThrow(/unknown issue/);
  });

  it("returns defensive copies from fetchCandidateIssues", async () => {
    const [issue] = await tracker.fetchCandidateIssues();
    issue.state = "Mutated";
    const refetched = tracker.getIssue(issue.id);
    expect(refetched?.state).toBe("Todo");
  });
});
