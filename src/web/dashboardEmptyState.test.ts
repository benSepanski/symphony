import { describe, expect, it } from "vitest";
import type { ApiWorkflowSummary } from "./api.js";
import { dashboardEmptyStateVariant } from "./dashboardEmptyState.js";

function makeWorkflow(overrides: Partial<ApiWorkflowSummary> = {}): ApiWorkflowSummary {
  return {
    tracker: {
      kind: "linear",
      projectSlug: "symphony",
      activeStates: ["Todo", "In Progress", "Rework"],
      terminalStates: ["Done", "Cancelled"],
    },
    workspaceRoot: "/tmp/ws",
    agentKind: "claude",
    claudeCode: null,
    mock: null,
    promptSource: "prompts/main.md",
    promptVersion: "v1",
    hooks: { afterCreate: false, beforeRemove: false },
    ...overrides,
  };
}

describe("dashboardEmptyStateVariant", () => {
  it("returns 'mock' when workflow.mock is set", () => {
    const workflow = makeWorkflow({
      mock: { scenariosDir: "fixtures/scenarios", assignment: "round-robin" },
    });
    expect(dashboardEmptyStateVariant(workflow)).toEqual({ kind: "mock" });
  });

  it("returns 'production' with tracker.activeStates when workflow.mock is null", () => {
    const workflow = makeWorkflow({ mock: null });
    expect(dashboardEmptyStateVariant(workflow)).toEqual({
      kind: "production",
      activeStates: ["Todo", "In Progress", "Rework"],
    });
  });

  it("defaults to production with an empty activeStates list when workflow is null", () => {
    expect(dashboardEmptyStateVariant(null)).toEqual({
      kind: "production",
      activeStates: [],
    });
  });

  it("passes through a bespoke activeStates list from the workflow config", () => {
    const workflow = makeWorkflow({
      tracker: {
        kind: "linear",
        projectSlug: "symphony",
        activeStates: ["Backlog", "Ready"],
        terminalStates: ["Done"],
      },
    });
    expect(dashboardEmptyStateVariant(workflow)).toEqual({
      kind: "production",
      activeStates: ["Backlog", "Ready"],
    });
  });
});
