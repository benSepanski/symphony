import type { ApiSearchMatch } from "./api.js";

export type MatchKind = "turn" | "event";

export interface SearchFilters {
  kinds: ReadonlySet<MatchKind>;
  statuses: ReadonlySet<string>;
}

export interface SearchSummary {
  total: number;
  runs: number;
  turns: number;
  events: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  kinds: new Set<MatchKind>(),
  statuses: new Set<string>(),
};

export function summarizeMatches(matches: ReadonlyArray<ApiSearchMatch>): SearchSummary {
  const runs = new Set<string>();
  let turns = 0;
  let events = 0;
  for (const m of matches) {
    runs.add(m.runId);
    if (m.matchKind === "turn") turns++;
    else if (m.matchKind === "event") events++;
  }
  return { total: matches.length, runs: runs.size, turns, events };
}

export function availableStatuses(matches: ReadonlyArray<ApiSearchMatch>): string[] {
  const set = new Set<string>();
  for (const m of matches) set.add(m.status);
  return [...set].sort();
}

export function filterMatches(
  matches: ReadonlyArray<ApiSearchMatch>,
  filters: SearchFilters,
): ApiSearchMatch[] {
  const allKinds = filters.kinds.size === 0;
  const allStatuses = filters.statuses.size === 0;
  if (allKinds && allStatuses) return [...matches];
  return matches.filter((m) => {
    if (!allKinds && !filters.kinds.has(m.matchKind)) return false;
    if (!allStatuses && !filters.statuses.has(m.status)) return false;
    return true;
  });
}

export function toggleSetMember<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
