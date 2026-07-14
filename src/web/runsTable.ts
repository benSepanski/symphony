export const RUNS_TABLE_GRID_COLS =
  "grid-cols-[6rem_minmax(10rem,1fr)_5rem_8rem_4rem_5rem_5rem_minmax(8rem,max-content)_minmax(8rem,max-content)]";

export type RunsTableColumn = {
  key: string;
  headerId: string;
  label: string;
};

export const RUNS_TABLE_COLUMNS: readonly RunsTableColumn[] = [
  { key: "issue", headerId: "col-issue", label: "Issue" },
  { key: "title", headerId: "col-title", label: "Title" },
  { key: "status", headerId: "col-status", label: "Status" },
  { key: "scenario", headerId: "col-scenario", label: "Scenario" },
  { key: "turns", headerId: "col-turns", label: "Turns" },
  { key: "tokens", headerId: "col-tokens", label: "Tokens" },
  { key: "cost", headerId: "col-cost", label: "Cost" },
  { key: "started", headerId: "col-started", label: "Started" },
  { key: "finished", headerId: "col-finished", label: "Finished" },
] as const;
