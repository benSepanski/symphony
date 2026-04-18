export interface UsageWindow {
  utilization: number;
  resetsAt: string;
}

export interface UsageSnapshot {
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  fetchedAt: string;
}

export interface UsageChecker {
  check(): Promise<UsageSnapshot | null>;
}

export const RATE_LIMIT_THRESHOLD = 1.0;

export function rateLimitedWindow(snapshot: UsageSnapshot): "fiveHour" | "sevenDay" | null {
  if (snapshot.fiveHour.utilization >= RATE_LIMIT_THRESHOLD) return "fiveHour";
  if (snapshot.sevenDay.utilization >= RATE_LIMIT_THRESHOLD) return "sevenDay";
  return null;
}
