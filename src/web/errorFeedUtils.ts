import type { ApiEvent } from "./api.js";

export const SUMMARY_EXPAND_THRESHOLD = 120;

export function summarize(e: ApiEvent): string {
  if (!e.payload) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(e.payload);
  } catch {
    return e.payload;
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.window === "string") {
      const win = o.window === "fiveHour" ? "5-hour" : o.window === "sevenDay" ? "7-day" : o.window;
      return `${win} window${o.resetsAt ? ` · resets ${new Date(String(o.resetsAt)).toLocaleString()}` : ""}`;
    }
  }
  return JSON.stringify(parsed);
}

export function fullPayload(e: ApiEvent): string {
  if (!e.payload) return "";
  try {
    const parsed = JSON.parse(e.payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return e.payload;
  }
}

export function shouldExpand(summary: string): boolean {
  return summary.length > SUMMARY_EXPAND_THRESHOLD;
}
