export interface DashboardLoadFailure {
  url: string;
  message: string;
}

export interface DashboardLoadEntry<T> {
  url: string;
  result: PromiseSettledResult<T>;
}

export function collectDashboardFailures(
  entries: ReadonlyArray<DashboardLoadEntry<unknown>>,
): DashboardLoadFailure[] {
  const out: DashboardLoadFailure[] = [];
  for (const { url, result } of entries) {
    if (result.status === "rejected") {
      const reason = result.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      out.push({ url, message });
    }
  }
  return out;
}
