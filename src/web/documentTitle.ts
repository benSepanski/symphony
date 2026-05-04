import type { ApiRun } from "./api.js";

export const APP_NAME = "Symphony";
export const RECENT_FAILURE_WINDOW_MS = 5 * 60 * 1000;

const FAILURE_STATUSES = new Set(["failed", "rate_limited"]);

export type FaviconColor = "neutral" | "fail";

export function isRecentFailure(run: ApiRun, nowMs: number): boolean {
  if (!FAILURE_STATUSES.has(run.status)) return false;
  if (!run.finishedAt) return false;
  const finished = Date.parse(run.finishedAt);
  if (!Number.isFinite(finished)) return false;
  const age = nowMs - finished;
  return age >= 0 && age <= RECENT_FAILURE_WINDOW_MS;
}

export function findMostRecentFailure(runs: ApiRun[], nowMs: number): ApiRun | null {
  let best: ApiRun | null = null;
  let bestTs = -Infinity;
  for (const r of runs) {
    if (!isRecentFailure(r, nowMs)) continue;
    const t = Date.parse(r.finishedAt as string);
    if (t > bestTs) {
      best = r;
      bestTs = t;
    }
  }
  return best;
}

export function countRunning(runs: ApiRun[]): number {
  return runs.filter((r) => r.status === "running").length;
}

export function dashboardTitle(runs: ApiRun[], nowMs: number): string {
  const failure = findMostRecentFailure(runs, nowMs);
  if (failure) {
    return `✖ ${failure.issueIdentifier} ${failure.status} · ${APP_NAME}`;
  }
  const running = countRunning(runs);
  if (running > 0) {
    return `● ${running} running · ${APP_NAME}`;
  }
  return APP_NAME;
}

export function runDetailTitle(run: { issueIdentifier: string; status: string }): string {
  return `${run.issueIdentifier} · ${run.status} · ${APP_NAME}`;
}

export function dashboardFaviconColor(runs: ApiRun[], nowMs: number): FaviconColor {
  return findMostRecentFailure(runs, nowMs) ? "fail" : "neutral";
}

export function runFaviconColor(run: { status: string }): FaviconColor {
  return FAILURE_STATUSES.has(run.status) ? "fail" : "neutral";
}

const FAVICON_FOREGROUND: Record<FaviconColor, string> = {
  neutral: "#cbd5f5",
  fail: "#fb7185",
};

export function buildFaviconHref(color: FaviconColor): string {
  const fg = FAVICON_FOREGROUND[color];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="#0f172a"/>` +
    `<text x="32" y="46" text-anchor="middle" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" ` +
    `font-size="44" font-weight="700" fill="${fg}">S</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
