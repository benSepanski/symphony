import { describe, expect, it } from "vitest";
import { RUNS_TABLE_COLUMNS, RUNS_TABLE_GRID_COLS } from "./runsTable.js";

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
