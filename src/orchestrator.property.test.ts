import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { Agent, AgentSession, AgentStartContext, AgentTurn } from "./agent/types.js";
import type { ParsedWorkflow } from "./config/workflow.js";
import { Orchestrator } from "./orchestrator.js";
import { SymphonyLogger } from "./persistence/logger.js";
import { MemoryTracker } from "./tracker/memory.js";
import type { Issue } from "./tracker/types.js";
import { WorkspaceManager } from "./workspace/manager.js";

class CountingAgent implements Agent {
  inflight = 0;
  maxInflight = 0;
  starts = 0;
  constructor(
    private readonly stepsPerRun: number,
    private readonly crashIssueIdentifier: string | null,
  ) {}
  async startSession(ctx: AgentStartContext): Promise<AgentSession> {
    this.starts += 1;
    this.inflight += 1;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    const steps = this.stepsPerRun;
    const onStop = () => {
      this.inflight -= 1;
    };
    const shouldCrash = this.crashIssueIdentifier === ctx.issueIdentifier;
    let turnsRun = 0;
    return {
      async runTurn(): Promise<AgentTurn> {
        await Promise.resolve();
        turnsRun += 1;
        if (shouldCrash && turnsRun === 1) {
          throw new Error(`crash on ${ctx.issueIdentifier}`);
        }
        const isLast = turnsRun >= steps;
        return {
          role: "assistant",
          content: `step ${turnsRun}`,
          finalState: isLast ? "Done" : undefined,
        };
      },
      isDone() {
        return turnsRun >= steps;
      },
      async stop() {
        onStop();
      },
    };
  }
}

function workflow(maxConcurrent: number): ParsedWorkflow {
  return {
    config: {
      tracker: {
        kind: "memory",
        project_slug: "prop",
        active_states: ["Todo"],
        terminal_states: ["Done"],
      },
      polling: { interval_ms: 60_000 },
      workspace: { root: "/unused" },
      agent: {
        kind: "mock",
        max_concurrent_agents: maxConcurrent,
        max_turns: 50,
        max_turns_state: "Blocked",
      },
    },
    promptTemplate: "{{ issue.identifier }}",
    promptVersion: "inline",
    promptSource: "inline",
  };
}

function makeIssues(count: number): Issue[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    identifier: `PROP-${i}`,
    title: `issue ${i}`,
    description: null,
    state: "Todo",
    labels: [],
    url: `https://example.com/PROP-${i}`,
  }));
}

describe("Orchestrator property tests", () => {
  it("never exceeds max_concurrent_agents and dispatches each issue exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          issueCount: fc.integer({ min: 1, max: 8 }),
          maxConcurrent: fc.integer({ min: 1, max: 4 }),
          stepsPerRun: fc.integer({ min: 1, max: 3 }),
          crashIndex: fc.option(fc.integer({ min: 0, max: 7 })),
        }),
        async ({ issueCount, maxConcurrent, stepsPerRun, crashIndex }) => {
          const dir = mkdtempSync(join(tmpdir(), "symphony-prop-"));
          const logger = new SymphonyLogger({
            dbPath: join(dir, "symphony.db"),
            logsDir: join(dir, "logs"),
          });
          const workspace = new WorkspaceManager({ root: join(dir, "wt") });
          const issues = makeIssues(issueCount);
          const tracker = new MemoryTracker({ activeStates: ["Todo"], issues });
          const crashIdentifier =
            crashIndex !== null && crashIndex < issueCount ? `PROP-${crashIndex}` : null;
          const agent = new CountingAgent(stepsPerRun, crashIdentifier);
          const orch = new Orchestrator({
            workflow: workflow(maxConcurrent),
            tracker,
            agent,
            workspace,
            logger,
          });

          try {
            let safety = 0;
            while (safety < 50) {
              const remaining = await tracker.fetchCandidateIssues();
              if (remaining.length === 0) break;
              await orch.tick();
              safety += 1;
            }

            expect(agent.maxInflight).toBeLessThanOrEqual(maxConcurrent);
            expect(agent.starts).toBe(issueCount);
            const runs = logger.listRuns();
            const uniqueIssueIds = new Set(runs.map((r) => r.issueId));
            expect(uniqueIssueIds.size).toBe(issueCount);
            expect(runs.length).toBe(issueCount);
            const expectedFailed = crashIdentifier ? 1 : 0;
            expect(runs.filter((r) => r.status === "failed").length).toBe(expectedFailed);
          } finally {
            logger.close();
            rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
