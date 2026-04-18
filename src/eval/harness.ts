import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent, type Scenario, loadScenarioFile } from "../agent/mock.js";
import type { ParsedWorkflow } from "../config/workflow.js";
import { Orchestrator } from "../orchestrator.js";
import { SymphonyLogger } from "../persistence/logger.js";
import { MemoryTracker } from "../tracker/memory.js";
import type { Issue } from "../tracker/types.js";
import { WorkspaceManager } from "../workspace/manager.js";

export interface EvalRunResult {
  scenario: string;
  runStatus: string;
  finalTrackerState: string;
  turnCount: number;
  events: Array<{ eventType: string; payload: string | null }>;
}

function defaultWorkflow(overrides: Partial<ParsedWorkflow["config"]> = {}): ParsedWorkflow {
  return {
    config: {
      tracker: {
        kind: "memory",
        project_slug: "eval",
        active_states: ["Todo"],
        terminal_states: ["Done"],
      },
      polling: { interval_ms: 60_000 },
      workspace: { root: "/unused" },
      agent: {
        kind: "mock",
        max_concurrent_agents: 1,
        max_turns: 10,
        max_turns_state: "Blocked",
      },
      ...overrides,
    },
    promptTemplate: "{{ issue.identifier }}: {{ issue.title }}",
    promptVersion: "inline",
    promptSource: "inline",
  };
}

export interface RunScenarioOptions {
  workflow?: ParsedWorkflow;
  scenario: Scenario;
  issue?: Issue;
}

export async function runScenario(options: RunScenarioOptions): Promise<EvalRunResult> {
  const dir = mkdtempSync(join(tmpdir(), "symphony-eval-"));
  try {
    const workflow = options.workflow ?? defaultWorkflow();
    const issue = options.issue ?? {
      id: "eval-1",
      identifier: "EVAL-1",
      title: `scenario ${options.scenario.name}`,
      description: null,
      state: "Todo",
      labels: options.scenario.labels,
      url: "https://example.com/EVAL-1",
    };

    const tracker = new MemoryTracker({
      activeStates: workflow.config.tracker.active_states,
      issues: [issue],
    });
    const logger = new SymphonyLogger({
      dbPath: join(dir, "symphony.db"),
      logsDir: join(dir, "logs"),
    });
    const agent = new MockAgent({
      scenarios: [options.scenario],
      sleep: async () => {},
    });
    const workspace = new WorkspaceManager({ root: join(dir, "worktrees") });
    const orch = new Orchestrator({ workflow, tracker, agent, workspace, logger });

    await orch.tick();

    const runs = logger.listRuns();
    const run = runs[0];
    const result: EvalRunResult = {
      scenario: options.scenario.name,
      runStatus: run.status,
      finalTrackerState: tracker.getIssue(issue.id)?.state ?? "",
      turnCount: logger.listTurns(run.id).length,
      events: logger.listEvents(run.id).map((e) => ({
        eventType: e.eventType,
        payload: e.payload,
      })),
    };
    logger.close();
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function scenarioPath(name: string): string {
  return join("fixtures/scenarios", `${name}.yaml`);
}

export function loadFixtureScenario(name: string): Scenario {
  return loadScenarioFile(scenarioPath(name));
}
