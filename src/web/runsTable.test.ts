import { describe, expect, it } from "vitest";
import type { ApiRun } from "./api.js";
import {
  RUNS_TABLE_COLUMNS,
  RUNS_TABLE_GRID_COLS,
  formatCost,
  formatRunMetaLine,
  formatTokenBreakdown,
  formatTokenCount,
  formatTokenTotal,
  hasUsage,
  runCardAriaLabel,
  sumTokens,
} from "./runsTable.js";

describe("RUNS_TABLE_GRID_COLS", () => {
  it("gives the Title column a nonzero min-width so it can't collapse (BEN-95)", () => {
    const match = RUNS_TABLE_GRID_COLS.match(/^grid-cols-\[(.+)\]$/);
    expect(match, "class must be a grid-cols arbitrary value").not.toBeNull();
    const tracks = match![1].split("_");
    expect(tracks).toHaveLength(9);
    const titleTrack = tracks[1];
    const minmax = titleTrack.match(/^minmax\((\d+(?:\.\d+)?)rem,\s*1fr\)$/);
    expect(
      minmax,
      `title track must be minmax(<Nrem>, 1fr) with N >= 1 to survive min-w-[56rem]; got "${titleTrack}"`,
    ).not.toBeNull();
    expect(Number(minmax![1])).toBeGreaterThanOrEqual(1);
  });
});

describe("RUNS_TABLE_COLUMNS (BEN-113)", () => {
  it("declares one column per grid track so the header row matches the layout", () => {
    const tracks = RUNS_TABLE_GRID_COLS.match(/^grid-cols-\[(.+)\]$/)![1].split("_");
    expect(RUNS_TABLE_COLUMNS).toHaveLength(tracks.length);
  });

  it("gives every column a unique headerId anchor for aria-labelledby", () => {
    const ids = RUNS_TABLE_COLUMNS.map((c) => c.headerId);
    expect(new Set(ids).size, "headerId values must be unique").toBe(ids.length);
    for (const id of ids) {
      expect(id, `headerId "${id}" must be col-prefixed`).toMatch(/^col-[a-z]+$/);
    }
  });

  it("gives every column a non-empty visible label", () => {
    for (const col of RUNS_TABLE_COLUMNS) {
      expect(col.label.length, `column "${col.key}" needs a visible label`).toBeGreaterThan(0);
    }
  });

  it("gives every column a unique key", () => {
    const keys = RUNS_TABLE_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

function makeRun(overrides: Partial<ApiRun> = {}): ApiRun {
  return {
    id: "run-1",
    issueId: "issue-1",
    issueIdentifier: "BEN-1",
    issueTitle: "Fix the thing",
    status: "completed",
    startedAt: "2026-07-15T12:00:00.000Z",
    finishedAt: "2026-07-15T12:05:00.000Z",
    scenario: null,
    turnCount: 3,
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

describe("hasUsage", () => {
  it("is false when every usage field is null", () => {
    expect(hasUsage(makeRun())).toBe(false);
  });

  it("is true when any single usage field is set (including zero cost)", () => {
    expect(hasUsage(makeRun({ tokensInput: 10 }))).toBe(true);
    expect(hasUsage(makeRun({ tokensOutput: 5 }))).toBe(true);
    expect(hasUsage(makeRun({ tokensCacheRead: 1 }))).toBe(true);
    expect(hasUsage(makeRun({ tokensCacheCreation: 1 }))).toBe(true);
    expect(hasUsage(makeRun({ totalCostUsd: 0 }))).toBe(true);
  });
});

describe("sumTokens", () => {
  it("adds every token bucket and treats null as zero", () => {
    expect(
      sumTokens(
        makeRun({
          tokensInput: 100,
          tokensOutput: 25,
          tokensCacheRead: 7,
          tokensCacheCreation: 3,
        }),
      ),
    ).toBe(135);
  });

  it("returns 0 for an empty-usage run", () => {
    expect(sumTokens(makeRun())).toBe(0);
  });
});

describe("formatTokenCount", () => {
  it("passes through counts below 1k", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatTokenCount(1_000)).toBe("1.0k");
    expect(formatTokenCount(12_500)).toBe("12.5k");
  });

  it("abbreviates millions with one decimal", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(2_450_000)).toBe("2.5M");
  });
});

describe("formatCost", () => {
  it("returns em-dash for null or non-finite", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
    expect(formatCost(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("renders exact zero as $0 (distinct from missing data)", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("collapses sub-penny costs to <$0.01", () => {
    expect(formatCost(0.001)).toBe("<$0.01");
  });

  it("formats normal costs to two decimals with a leading $", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(0.01)).toBe("$0.01");
  });
});

describe("formatTokenTotal", () => {
  it("returns em-dash when hasUsage is false", () => {
    expect(formatTokenTotal(makeRun())).toBe("—");
  });

  it("returns the abbreviated sum when any usage is present", () => {
    expect(
      formatTokenTotal(makeRun({ tokensInput: 500, tokensOutput: 500, tokensCacheRead: 500 })),
    ).toBe("1.5k");
  });
});

describe("formatTokenBreakdown", () => {
  it("returns a screen-reader-friendly note when there's no usage", () => {
    expect(formatTokenBreakdown(makeRun())).toBe("no token usage recorded");
  });

  it("lists every bucket with a human unit", () => {
    expect(
      formatTokenBreakdown(
        makeRun({
          tokensInput: 1_000,
          tokensOutput: 500,
          tokensCacheRead: 250,
          tokensCacheCreation: 125,
        }),
      ),
    ).toBe("input 1.0k · output 500 · cache read 250 · cache create 125");
  });
});

describe("formatRunMetaLine (BEN-106 mobile card)", () => {
  it("returns null when there's no usage so the caller can omit the whole row", () => {
    expect(formatRunMetaLine(makeRun())).toBeNull();
  });

  it("joins turns, token total, and cost with the same separator as the desktop meta", () => {
    const r = makeRun({
      turnCount: 4,
      tokensInput: 2_000,
      tokensOutput: 500,
      totalCostUsd: 0.42,
    });
    expect(formatRunMetaLine(r)).toBe("4 turns · 2.5k · $0.42");
  });

  it("still renders when only cost is present (dashboard shows the cost column then)", () => {
    const r = makeRun({ turnCount: 2, totalCostUsd: 0 });
    expect(formatRunMetaLine(r)).toBe("2 turns · 0 · $0");
  });
});

describe("runCardAriaLabel", () => {
  it("includes the identifier, title, and status for one-shot screen-reader context", () => {
    const r = makeRun({ issueIdentifier: "BEN-42", issueTitle: "Do the thing", status: "running" });
    expect(runCardAriaLabel(r)).toBe("Open run BEN-42: Do the thing · running");
  });

  it("omits the title suffix when issueTitle is null", () => {
    const r = makeRun({ issueIdentifier: "BEN-42", issueTitle: null, status: "failed" });
    expect(runCardAriaLabel(r)).toBe("Open run BEN-42 · failed");
  });
});
