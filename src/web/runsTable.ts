import type { ApiRun } from "./api.js";

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

export function hasUsage(r: ApiRun): boolean {
  return (
    r.tokensInput !== null ||
    r.tokensOutput !== null ||
    r.tokensCacheRead !== null ||
    r.tokensCacheCreation !== null ||
    r.totalCostUsd !== null
  );
}

export function sumTokens(r: ApiRun): number {
  return (
    (r.tokensInput ?? 0) +
    (r.tokensOutput ?? 0) +
    (r.tokensCacheRead ?? 0) +
    (r.tokensCacheCreation ?? 0)
  );
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatTokenTotal(r: ApiRun): string {
  if (!hasUsage(r)) return "—";
  return formatTokenCount(sumTokens(r));
}

export function formatTokenBreakdown(r: ApiRun): string {
  if (!hasUsage(r)) return "no token usage recorded";
  return [
    `input ${formatTokenCount(r.tokensInput ?? 0)}`,
    `output ${formatTokenCount(r.tokensOutput ?? 0)}`,
    `cache read ${formatTokenCount(r.tokensCacheRead ?? 0)}`,
    `cache create ${formatTokenCount(r.tokensCacheCreation ?? 0)}`,
  ].join(" · ");
}

export function formatCost(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

// Mobile card meta line — matches desktop table's "skip when no usage" behavior.
// Returns null when hasUsage is false so the caller can omit the entire row.
export function formatRunMetaLine(r: ApiRun): string | null {
  if (!hasUsage(r)) return null;
  return `${r.turnCount} turns · ${formatTokenTotal(r)} · ${formatCost(r.totalCostUsd)}`;
}

export function runCardAriaLabel(r: ApiRun): string {
  const title = r.issueTitle ? `: ${r.issueTitle}` : "";
  return `Open run ${r.issueIdentifier}${title} · ${r.status}`;
}

// Decides whether a mouse click on a Dashboard run row/card should navigate.
// Split out so the row can stay text-selectable and right-clickable while
// still giving mouse users a row-wide click affordance (BEN-141).
export type RowClickIntent = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  hasNonCollapsedSelection: boolean;
  targetIsInteractive: boolean;
};

export function shouldNavigateOnRowClick(intent: RowClickIntent): boolean {
  if (intent.button !== 0) return false;
  if (intent.metaKey || intent.ctrlKey || intent.shiftKey || intent.altKey) return false;
  if (intent.hasNonCollapsedSelection) return false;
  if (intent.targetIsInteractive) return false;
  return true;
}
