import type { ApiRun } from "./api.js";

export const RUN_STATUSES = [
  "running",
  "completed",
  "failed",
  "max_turns",
  "rate_limited",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const SORT_KEYS = ["startedAt", "finishedAt", "turns", "tokens", "cost"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDir = "asc" | "desc";

export interface DashboardFilters {
  statuses: RunStatus[];
  text: string;
  sort: { key: SortKey; dir: SortDir };
}

export const DEFAULT_FILTERS: DashboardFilters = {
  statuses: [],
  text: "",
  sort: { key: "startedAt", dir: "desc" },
};

function isRunStatus(s: string): s is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(s);
}

function isSortKey(s: string): s is SortKey {
  return (SORT_KEYS as readonly string[]).includes(s);
}

export function parseFilters(search: string): DashboardFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const statusesRaw = params.get("status") ?? "";
  const statuses = statusesRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RunStatus => s.length > 0 && isRunStatus(s));
  const uniqueStatuses = Array.from(new Set(statuses));
  const text = params.get("q") ?? "";
  const sortKeyRaw = params.get("sort") ?? "";
  const sortKey: SortKey = isSortKey(sortKeyRaw) ? sortKeyRaw : DEFAULT_FILTERS.sort.key;
  const dirRaw = params.get("dir") ?? "";
  const dir: SortDir = dirRaw === "asc" ? "asc" : "desc";
  return { statuses: uniqueStatuses, text, sort: { key: sortKey, dir } };
}

export function serializeFilters(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
  if (filters.text) params.set("q", filters.text);
  if (filters.sort.key !== DEFAULT_FILTERS.sort.key) params.set("sort", filters.sort.key);
  if (filters.sort.dir !== DEFAULT_FILTERS.sort.dir) params.set("dir", filters.sort.dir);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function tokenSum(r: ApiRun): number {
  return (
    (r.tokensInput ?? 0) +
    (r.tokensOutput ?? 0) +
    (r.tokensCacheRead ?? 0) +
    (r.tokensCacheCreation ?? 0)
  );
}

function sortValue(r: ApiRun, key: SortKey): number {
  switch (key) {
    case "startedAt":
      return Date.parse(r.startedAt);
    case "finishedAt":
      return r.finishedAt ? Date.parse(r.finishedAt) : Number.NEGATIVE_INFINITY;
    case "turns":
      return r.turnCount;
    case "tokens":
      return tokenSum(r);
    case "cost":
      return r.totalCostUsd ?? 0;
  }
}

export function applyFilters(runs: ApiRun[], filters: DashboardFilters): ApiRun[] {
  const text = filters.text.trim().toLowerCase();
  const filtered = runs.filter((r) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status as RunStatus)) {
      return false;
    }
    if (text.length === 0) return true;
    const ident = r.issueIdentifier.toLowerCase();
    const title = (r.issueTitle ?? "").toLowerCase();
    return ident.includes(text) || title.includes(text);
  });
  const sign = filters.sort.dir === "asc" ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, filters.sort.key);
    const bv = sortValue(b, filters.sort.key);
    if (av === bv) return 0;
    return av < bv ? -sign : sign;
  });
  return sorted;
}

export function toggleStatus(filters: DashboardFilters, status: RunStatus): DashboardFilters {
  const has = filters.statuses.includes(status);
  return {
    ...filters,
    statuses: has ? filters.statuses.filter((s) => s !== status) : [...filters.statuses, status],
  };
}

export function toggleSort(filters: DashboardFilters, key: SortKey): DashboardFilters {
  if (filters.sort.key !== key) {
    return { ...filters, sort: { key, dir: "desc" } };
  }
  return {
    ...filters,
    sort: { key, dir: filters.sort.dir === "desc" ? "asc" : "desc" },
  };
}
