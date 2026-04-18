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
    promptVersion: "inline",
    promptSource: "inline",
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

  it("GET /api/search returns matches across turns and events", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/search?q=done");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      query: string;
      matches: Array<{ snippet: string; matchKind: string }>;
    };
    expect(body.query).toBe("done");
    expect(body.matches.some((m) => m.matchKind === "turn" && /done/i.test(m.snippet))).toBe(true);
  });

  it("GET /api/runs/:id returns 404 for unknown ids", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/runs/nope");
    expect(res.status).toBe(404);
  });

  it("GET /api/health returns orchestrator + usage state", async () => {
    const app = createServer({
      events: orchestrator,
      logger,
      getUsage: () => orchestrator.getUsage(),
      getState: () => orchestrator.getState(),
    });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orchestrator: { pollIntervalMs: number; concurrency: { max: number } } | null;
      usage: { snapshot: unknown };
    };
    expect(body.orchestrator?.pollIntervalMs).toBe(10_000);
    expect(body.orchestrator?.concurrency.max).toBe(1);
  });

  it("GET /api/health returns nulls when getters are not wired (replay mode)", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orchestrator: unknown; usage: { snapshot: unknown } };
    expect(body.orchestrator).toBeNull();
    expect(body.usage).toEqual({ snapshot: null, rateLimitedWindow: null });
  });

  it("GET /api/events/recent filters by type and caps limit", async () => {
    const runId = logger.listRuns()[0].id;
    logger.logEvent({ runId, eventType: "error", issueId: "i-1", payload: { message: "x" } });
    logger.logEvent({
      runId,
      eventType: "rate_limited",
      issueId: "i-1",
      payload: { window: "fiveHour" },
    });

    const app = createServer({ events: orchestrator, logger });
    const all = await (await app.request("/api/events/recent")).json();
    expect((all as { events: Array<{ eventType: string }> }).events.length).toBeGreaterThanOrEqual(
      2,
    );

    const onlyErrors = await (await app.request("/api/events/recent?types=error")).json();
    const e = (onlyErrors as { events: Array<{ eventType: string }> }).events;
    expect(e.every((x) => x.eventType === "error")).toBe(true);
    expect(e.length).toBeGreaterThan(0);

    const capped = await (await app.request("/api/events/recent?limit=1")).json();
    expect((capped as { events: unknown[] }).events).toHaveLength(1);
  });

  it("GET /api/settings returns orchestrator settings + workflow summary", async () => {
    const app = createServer({
      events: orchestrator,
      logger,
      getSettings: () => orchestrator.getSettings(),
      getWorkflowSummary: () => ({
        tracker: {
          kind: "memory",
          projectSlug: "t",
          activeStates: ["Todo"],
          terminalStates: ["Done"],
        },
        workspaceRoot: "/unused",
        agentKind: "mock",
        claudeCode: null,
        mock: null,
        promptSource: "inline",
        promptVersion: "inline",
        hooks: { afterCreate: false, beforeRemove: false },
      }),
    });
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: { pollIntervalMs: number; pollingMode: string };
      workflow: { agentKind: string; workspaceRoot: string };
    };
    expect(body.settings.pollIntervalMs).toBe(10_000);
    expect(body.settings.pollingMode).toBe("auto");
    expect(body.workflow.agentKind).toBe("mock");
  });

  it("PATCH /api/settings validates + applies runtime updates", async () => {
    const app = createServer({
      events: orchestrator,
      logger,
      getSettings: () => orchestrator.getSettings(),
      updateSettings: (patch) => orchestrator.updateSettings(patch),
    });

    const bad = await app.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollIntervalMs: 10 }),
    });
    expect(bad.status).toBe(400);

    const rejected = await app.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unknownField: 1 }),
    });
    expect(rejected.status).toBe(400);

    const ok = await app.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollIntervalMs: 15_000, pollingMode: "manual" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      settings: { pollIntervalMs: number; pollingMode: string };
    };
    expect(body.settings.pollIntervalMs).toBe(15_000);
    expect(body.settings.pollingMode).toBe("manual");
    expect(orchestrator.getSettings().pollingMode).toBe("manual");
  });

  it("PATCH /api/settings returns 400 when not wired", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollIntervalMs: 15_000 }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/orchestrator/tick triggers a manual tick", async () => {
    let tickCalls = 0;
    const app = createServer({
      events: orchestrator,
      logger,
      getState: () => orchestrator.getState(),
      requestTick: async () => {
        tickCalls += 1;
      },
    });
    const res = await app.request("/api/orchestrator/tick", { method: "POST" });
    expect(res.status).toBe(200);
    expect(tickCalls).toBe(1);
    const body = (await res.json()) as { ok: boolean; state: unknown };
    expect(body.ok).toBe(true);
    expect(body.state).not.toBeNull();
  });

  it("POST /api/orchestrator/tick returns 400 when not wired", async () => {
    const app = createServer({ events: orchestrator, logger });
    const res = await app.request("/api/orchestrator/tick", { method: "POST" });
    expect(res.status).toBe(400);
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
