import { describe, expect, it } from "vitest";
import type { ApiRun } from "./api.js";
import {
  applyFilters,
  DEFAULT_FILTERS,
  parseFilters,
  serializeFilters,
  toggleSort,
  toggleStatus,
} from "./dashboardFilters.js";

function makeRun(overrides: Partial<ApiRun> = {}): ApiRun {
  const base: ApiRun = {
    id: "run-1",
    issueId: "ISSUE-1",
    issueIdentifier: "BEN-1",
    issueTitle: "first run",
    status: "completed",
    startedAt: "2026-04-01T00:00:00.000Z",
    finishedAt: "2026-04-01T00:01:00.000Z",
    scenario: null,
    turnCount: 1,
    tokensInput: null,
    tokensOutput: null,
    tokensCacheRead: null,
    tokensCacheCreation: null,
    totalCostUsd: null,
    authStatus: null,
    startFiveHourUtil: null,
    startSevenDayUtil: null,
  };
  return { ...base, ...overrides };
}

describe("parseFilters", () => {
  it("returns defaults for an empty string", () => {
    expect(parseFilters("")).toEqual(DEFAULT_FILTERS);
  });

  it("parses statuses, query and sort", () => {
    const filters = parseFilters("?status=failed,running&q=BEN-30&sort=tokens&dir=asc");
    expect(filters).toEqual({
      statuses: ["failed", "running"],
      text: "BEN-30",
      sort: { key: "tokens", dir: "asc" },
    });
  });

  it("ignores unknown statuses and unknown sort keys", () => {
    const filters = parseFilters("?status=failed,bogus&sort=junk&dir=banana");
    expect(filters.statuses).toEqual(["failed"]);
    expect(filters.sort).toEqual({ key: "startedAt", dir: "desc" });
  });

  it("dedupes statuses", () => {
    const filters = parseFilters("?status=failed,failed,completed");
    expect(filters.statuses).toEqual(["failed", "completed"]);
  });
});

describe("serializeFilters", () => {
  it("emits empty string for defaults", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips through parseFilters", () => {
    const filters = {
      statuses: ["failed" as const, "running" as const],
      text: "BEN-30",
      sort: { key: "cost" as const, dir: "asc" as const },
    };
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });
});

describe("applyFilters", () => {
  const runs: ApiRun[] = [
    makeRun({
      id: "a",
      issueIdentifier: "BEN-30",
      issueTitle: "Fix login",
      status: "failed",
      startedAt: "2026-04-01T00:00:00.000Z",
      tokensInput: 1000,
      totalCostUsd: 0.5,
      turnCount: 3,
    }),
    makeRun({
      id: "b",
      issueIdentifier: "BEN-31",
      issueTitle: "Add search",
      status: "completed",
      startedAt: "2026-04-02T00:00:00.000Z",
      tokensInput: 500,
      totalCostUsd: 0.1,
      turnCount: 5,
    }),
    makeRun({
      id: "c",
      issueIdentifier: "BEN-32",
      issueTitle: "Polish dashboard",
      status: "running",
      startedAt: "2026-04-03T00:00:00.000Z",
      finishedAt: null,
      tokensInput: 200,
      totalCostUsd: 0,
      turnCount: 1,
    }),
  ];

  it("defaults to startedAt desc", () => {
    const out = applyFilters(runs, DEFAULT_FILTERS);
    expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("filters by status (multi-select)", () => {
    const out = applyFilters(runs, { ...DEFAULT_FILTERS, statuses: ["failed", "running"] });
    expect(out.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("filters by free text against identifier and title (case-insensitive)", () => {
    const byIdent = applyFilters(runs, { ...DEFAULT_FILTERS, text: "ben-31" });
    expect(byIdent.map((r) => r.id)).toEqual(["b"]);
    const byTitle = applyFilters(runs, { ...DEFAULT_FILTERS, text: "DASH" });
    expect(byTitle.map((r) => r.id)).toEqual(["c"]);
  });

  it("sorts ascending by turns", () => {
    const out = applyFilters(runs, {
      ...DEFAULT_FILTERS,
      sort: { key: "turns", dir: "asc" },
    });
    expect(out.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by cost descending", () => {
    const out = applyFilters(runs, {
      ...DEFAULT_FILTERS,
      sort: { key: "cost", dir: "desc" },
    });
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("places null finishedAt last for desc, first for asc", () => {
    const desc = applyFilters(runs, {
      ...DEFAULT_FILTERS,
      sort: { key: "finishedAt", dir: "desc" },
    });
    expect(desc[desc.length - 1].id).toBe("c");
    const asc = applyFilters(runs, {
      ...DEFAULT_FILTERS,
      sort: { key: "finishedAt", dir: "asc" },
    });
    expect(asc[0].id).toBe("c");
  });
});

describe("toggleStatus", () => {
  it("adds a status and removes it on second toggle", () => {
    const once = toggleStatus(DEFAULT_FILTERS, "failed");
    expect(once.statuses).toEqual(["failed"]);
    const twice = toggleStatus(once, "failed");
    expect(twice.statuses).toEqual([]);
  });
});

describe("toggleSort", () => {
  it("switches key and resets to desc", () => {
    const next = toggleSort(DEFAULT_FILTERS, "cost");
    expect(next.sort).toEqual({ key: "cost", dir: "desc" });
  });

  it("flips direction when the key matches", () => {
    const flipped = toggleSort(DEFAULT_FILTERS, "startedAt");
    expect(flipped.sort).toEqual({ key: "startedAt", dir: "asc" });
    const back = toggleSort(flipped, "startedAt");
    expect(back.sort).toEqual({ key: "startedAt", dir: "desc" });
  });
});
