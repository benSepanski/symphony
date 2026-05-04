import type { ApiRun } from "./api.js";

export interface ApplyResult {
  next: ApiRun[];
  matched: boolean;
}

export function applyTurnEvent(runs: ApiRun[], runId: string): ApplyResult {
  let matched = false;
  const next = runs.map((r) => {
    if (r.id !== runId) return r;
    matched = true;
    return { ...r, turnCount: r.turnCount + 1 };
  });
  return matched ? { next, matched } : { next: runs, matched };
}

export function applyRunFinishedEvent(
  runs: ApiRun[],
  runId: string,
  status: string,
  finishedAtIso: string,
): ApplyResult {
  let matched = false;
  const next = runs.map((r) => {
    if (r.id !== runId) return r;
    matched = true;
    return { ...r, status, finishedAt: r.finishedAt ?? finishedAtIso };
  });
  return matched ? { next, matched } : { next: runs, matched };
}

export function replaceRun(runs: ApiRun[], updated: ApiRun): ApiRun[] {
  let matched = false;
  const next = runs.map((r) => {
    if (r.id !== updated.id) return r;
    matched = true;
    return updated;
  });
  return matched ? next : runs;
}

export function hasRun(runs: ApiRun[], runId: string): boolean {
  return runs.some((r) => r.id === runId);
}
