import { describe, expect, it } from "vitest";
import { RUNS_TABLE_GRID_COLS } from "./runsTable.js";

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
