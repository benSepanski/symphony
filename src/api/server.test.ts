import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, type Scenario } from "../agent/mock.js";
import type { ParsedWorkflow } from "../config/workflow.js";
import { Orchestrator } from "../orchestrator.js";
import { SymphonyLogger } from "../persistence/logger.js";
import { MemoryTracker } from "../tracker/memory.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { createServer } from "./server.js";

const SCENARIO: Scenario = {
  name: "happy",
  labels: [],
  steps: [{ role: "assistant", content: "done", delay_ms: 0, final_state: "Done" }],
};

function workflow(): ParsedWorkflow {
  return {
    config: {
      tracker: {
        kind: "memory",
        project_slug: "t",
        active_states: ["Todo"],
        terminal_states: ["Done"],
      },
      polling: { interval_ms: 10_000 },
      workspace: { root: "/unused" },
      agent: {
        kind: "mock",
        max_concurrent_agents: 1,
        max_turns: 5,
        max_turns_state: "Blocked",
      },
    },
    promptTemplate: "go",
  };
}

describe("api/server", () => {
  let dir: string;
  let logger: SymphonyLogger;
  let orchestrator: Orchestrator;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "symphony-api-"));
    logger = new SymphonyLogger({
      dbPath: join(dir, "symphony.db"),
      logsDir: join(dir, "logs"),
    });
    const tracker = new MemoryTracker({
      activeStates: ["Todo"],
      issues: [
        {
          id: "i-1",
          identifier: "BEN-1",
          title: "x",
          description: null,
          state: "Todo",
          labels: [],
          url: "https://example.com",
        },
      ],
    });
    const agent = new MockAgent({ scenarios: [SCENARIO], sleep: async () => {} });
    const workspace = new WorkspaceManager({ root: join(dir, "worktrees") });
    orchestrator = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
    });
    await orchestrator.tick();
  });

  afterEach(async () => {
    await orchestrator.stop();
    logger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/runs returns the run list", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/runs");
    expect(res.status).toBe(200);
    const runs = (await res.json()) as Array<{ issueIdentifier: string; status: string }>;
    expect(runs).toHaveLength(1);
    expect(runs[0].issueIdentifier).toBe("BEN-1");
    expect(runs[0].status).toBe("completed");
  });

  it("GET /api/runs/:id returns run details", async () => {
    const app = createServer({ events: orchestrator, logger });
    const runId = logger.listRuns()[0].id;
    const res = await app.request(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: { id: string };
      turns: Array<{ content: string }>;
      events: Array<{ eventType: string }>;
    };
    expect(body.run.id).toBe(runId);
    expect(body.turns.map((t) => t.content)).toEqual(["done"]);
    expect(body.events.map((e) => e.eventType)).toContain("state_transition");
  });

  it("GET /api/runs/:id returns 404 for unknown ids", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/runs/nope");
    expect(res.status).toBe(404);
  });

  it("GET / serves a placeholder HTML page when no web bundle is present", async () => {
    const app = createServer({
      events: orchestrator,
      logger,
      webRoot: join(dir, "web-does-not-exist"),
    });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain("Symphony");
  });
});
