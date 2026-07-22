import type { ApiWorkflowSummary } from "./api.js";

export type DashboardEmptyStateVariant =
  | { kind: "mock" }
  | { kind: "production"; activeStates: string[] };

export function dashboardEmptyStateVariant(
  workflow: ApiWorkflowSummary | null,
): DashboardEmptyStateVariant {
  if (workflow?.mock) return { kind: "mock" };
  return { kind: "production", activeStates: workflow?.tracker.activeStates ?? [] };
}
