import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, type Scenario } from "./agent/mock.js";
import type { ParsedWorkflow } from "./config/workflow.js";
import { Orchestrator } from "./orchestrator.js";
import { SymphonyLogger } from "./persistence/logger.js";
import { MemoryTracker } from "./tracker/memory.js";
import type { Issue } from "./tracker/types.js";
import { WorkspaceManager } from "./workspace/manager.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "i-1",
    identifier: "BEN-1",
    title: "Fix bug",
    description: "It broke",
    state: "Todo",
    labels: [],
    url: "https://example.com/BEN-1",
    ...overrides,
  };
}

function workflow(overrides: Partial<ParsedWorkflow["config"]> = {}): ParsedWorkflow {
  return {
    config: {
      tracker: {
        kind: "memory",
        project_slug: "test",
        active_states: ["Todo", "In Progress"],
        terminal_states: ["Done"],
      },
      polling: { interval_ms: 1_000 },
      workspace: { root: "/unused" },
      agent: {
        kind: "mock",
        max_concurrent_agents: 1,
        max_turns: 5,
        max_turns_state: "Blocked",
      },
      ...overrides,
    },
    promptTemplate: "Ticket {{ issue.identifier }}: {{ issue.title }}",
    promptVersion: "inline",
    promptSource: "inline",
  };
}

const HAPPY: Scenario = {
  name: "happy",
  labels: [],
  steps: [
    { role: "assistant", content: "plan", delay_ms: 0 },
    { role: "tool", content: "ran tests", delay_ms: 0 },
    { role: "assistant", content: "done", delay_ms: 0, final_state: "Done" },
  ],
};

const ONE_STEP_NO_TRANSITION: Scenario = {
  name: "noop",
  labels: [],
  steps: [{ role: "assistant", content: "hi", delay_ms: 0 }],
};

const NEVER_ENDING: Scenario = {
  name: "forever",
  labels: [],
  steps: Array.from({ length: 20 }, (_, i) => ({
    role: "assistant" as const,
    content: `step ${i}`,
    delay_ms: 0,
  })),
};

describe("Orchestrator", () => {
  let dir: string;
  let logger: SymphonyLogger;
  let workspace: WorkspaceManager;
  let tracker: MemoryTracker;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "symphony-orch-"));
    logger = new SymphonyLogger({
      dbPath: join(dir, "symphony.db"),
      logsDir: join(dir, "logs"),
    });
    workspace = new WorkspaceManager({ root: join(dir, "worktrees") });
    tracker = new MemoryTracker({
      activeStates: ["Todo", "In Progress"],
      issues: [makeIssue()],
    });
  });

  afterEach(() => {
    logger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs an issue end to end through the mock agent", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
    });

    const events: string[] = [];
    orch.on("runStarted", () => events.push("started"));
    orch.on("turn", () => events.push("turn"));
    orch.on("runFinished", (e) => events.push(`finished:${e.status}`));

    await orch.tick();

    expect(events).toEqual(["started", "turn", "turn", "turn", "finished:completed"]);
    expect(tracker.getIssue("i-1")?.state).toBe("Done");

    const runs = logger.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    const turns = logger.listTurns(runs[0].id);
    expect(turns.map((t) => t.content)).toEqual(["plan", "ran tests", "done"]);
    expect(turns.at(-1)?.finalState).toBe("Done");
    const events2 = logger.listEvents(runs[0].id);
    expect(events2.map((e) => e.eventType)).toContain("state_transition");
    expect(events2.map((e) => e.eventType)).toContain("workspace_destroyed");

    expect(existsSync(join(dir, "worktrees", "BEN-1"))).toBe(false);
  });

  it("leaves issue state alone when no turn sets final_state", async () => {
    const agent = new MockAgent({
      scenarios: [ONE_STEP_NO_TRANSITION],
      sleep: async () => {},
    });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });
    await orch.tick();
    expect(tracker.getIssue("i-1")?.state).toBe("Todo");
  });

  it("honors max_turns and transitions to max_turns_state", async () => {
    const agent = new MockAgent({
      scenarios: [NEVER_ENDING],
      sleep: async () => {},
    });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 3,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    await orch.tick();
    expect(tracker.getIssue("i-1")?.state).toBe("Blocked");
    const runs = logger.listRuns();
    expect(runs[0].status).toBe("max_turns");
    expect(logger.listTurns(runs[0].id)).toHaveLength(3);
  });

  it("respects max_concurrent_agents", async () => {
    tracker = new MemoryTracker({
      activeStates: ["Todo"],
      issues: [
        makeIssue({ id: "i-1", identifier: "BEN-1" }),
        makeIssue({ id: "i-2", identifier: "BEN-2" }),
        makeIssue({ id: "i-3", identifier: "BEN-3" }),
      ],
    });
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 2,
          max_turns: 10,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });
    await orch.tick();
    expect(logger.listRuns()).toHaveLength(2);
  });

  it("persists the workflow's prompt version + source on the run row", async () => {
    const wf = workflow();
    wf.promptVersion = "v7";
    wf.promptSource = "prompts/default-v7.md";
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: wf, tracker, agent, workspace, logger });
    await orch.tick();
    const run = logger.listRuns()[0];
    expect(run.promptVersion).toBe("v7");
    expect(run.promptSource).toBe("prompts/default-v7.md");
  });

  it("cancels in-flight runs when stop() is called mid-scenario", async () => {
    const long: Scenario = {
      name: "long",
      labels: [],
      steps: Array.from({ length: 20 }, (_, i) => ({
        role: "assistant" as const,
        content: `step ${i}`,
        delay_ms: 0,
      })),
    };
    const agent = new MockAgent({ scenarios: [long], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 100,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    let stopped = false;
    orch.on("turn", () => {
      if (!stopped) {
        stopped = true;
        void orch.stop();
      }
    });

    await orch.tick();
    await orch.stop();

    const run = logger.listRuns()[0];
    expect(run.status).toBe("cancelled");
    expect(tracker.getIssue("i-1")?.state).toBe("Blocked");
    expect(existsSync(join(dir, "worktrees", "BEN-1"))).toBe(false);
  });

  it("cleans up the workspace and transitions the issue after a crash", async () => {
    const crashing: Scenario = {
      name: "crash-in-test",
      labels: [],
      steps: [
        { role: "assistant", content: "about to crash", delay_ms: 0 },
        { role: "tool", content: "boom", delay_ms: 0, throw: true },
      ],
    };
    const agent = new MockAgent({ scenarios: [crashing], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 10,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });
    await orch.tick();

    const run = logger.listRuns()[0];
    expect(run.status).toBe("failed");
    expect(existsSync(join(dir, "worktrees", "BEN-1"))).toBe(false);
    expect(tracker.getIssue("i-1")?.state).toBe("Blocked");

    await orch.tick();
    expect(logger.listRuns()).toHaveLength(1);
  });

  it("posts a breakdown-nudge comment when a run hits max_turns", async () => {
    const agent = new MockAgent({
      scenarios: [NEVER_ENDING],
      sleep: async () => {},
    });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 3,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    await orch.tick();

    const comments = tracker.getComments("i-1");
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatch(/^## Symphony auto-pause/);
    expect(comments[0]).toMatch(/3-turn limit/);
    expect(comments[0]).toMatch(/break it into smaller sub-issues/);

    const run = logger.listRuns()[0];
    const eventTypes = logger.listEvents(run.id).map((e) => e.eventType);
    expect(eventTypes).toContain("breakdown_comment_posted");
  });

  it("posts a breakdown-nudge comment when a run fails mid-scenario", async () => {
    const crashing: Scenario = {
      name: "boom",
      labels: [],
      steps: [
        { role: "assistant", content: "about to crash", delay_ms: 0 },
        { role: "tool", content: "kaboom", delay_ms: 0, throw: true },
      ],
    };
    const agent = new MockAgent({ scenarios: [crashing], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });

    await orch.tick();

    const comments = tracker.getComments("i-1");
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatch(/\*\*failed\*\*/);
    expect(comments[0]).toMatch(/kaboom/);
  });

  it("does not post a breakdown comment for cancelled or rate_limited runs", async () => {
    const long: Scenario = {
      name: "long",
      labels: [],
      steps: Array.from({ length: 20 }, (_, i) => ({
        role: "assistant" as const,
        content: `step ${i}`,
        delay_ms: 0,
      })),
    };
    const agent = new MockAgent({ scenarios: [long], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 100,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    let stopped = false;
    orch.on("turn", () => {
      if (!stopped) {
        stopped = true;
        void orch.stop();
      }
    });
    await orch.tick();
    await orch.stop();

    const run = logger.listRuns()[0];
    expect(run.status).toBe("cancelled");
    expect(tracker.getComments("i-1")).toEqual([]);
  });

  it("logs a breakdown_comment_error when the tracker addComment throws", async () => {
    class FailingCommentTracker extends MemoryTracker {
      override async addComment(): Promise<void> {
        throw new Error("linear 503");
      }
    }
    const failing = new FailingCommentTracker({
      activeStates: ["Todo", "In Progress"],
      issues: [makeIssue()],
    });
    const agent = new MockAgent({
      scenarios: [NEVER_ENDING],
      sleep: async () => {},
    });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 2,
          max_turns_state: "Blocked",
        },
      }),
      tracker: failing,
      agent,
      workspace,
      logger,
    });
    await orch.tick();

    const run = logger.listRuns()[0];
    expect(run.status).toBe("max_turns");
    const eventTypes = logger.listEvents(run.id).map((e) => e.eventType);
    expect(eventTypes).toContain("breakdown_comment_error");
    expect(eventTypes).not.toContain("breakdown_comment_posted");
  });

  it("captures the rendered prompt on each turn with a growing attempt number", async () => {
    const wf = workflow();
    wf.promptTemplate = "Ticket {{ issue.identifier }} attempt {{ attempt }}";
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: wf, tracker, agent, workspace, logger });
    await orch.tick();
    const run = logger.listRuns()[0];
    const turns = logger.listTurns(run.id);
    expect(turns.map((t) => t.renderedPrompt)).toEqual([
      "Ticket BEN-1 attempt 1",
      "Ticket BEN-1 attempt 2",
      "Ticket BEN-1 attempt 3",
    ]);
  });

  it("skips spawning when the usage checker reports a capped window", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const checker = {
      check: async () => ({
        fetchedAt: new Date().toISOString(),
        fiveHour: { utilization: 1.0, resetsAt: "2099-01-01T00:00:00Z" },
        sevenDay: { utilization: 0.2, resetsAt: "2099-01-07T00:00:00Z" },
      }),
    };
    const events: Array<{ window: string | null }> = [];
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    orch.on("usageUpdated", (e: { rateLimitedWindow: string | null }) =>
      events.push({ window: e.rateLimitedWindow }),
    );
    await orch.tick();
    expect(logger.listRuns()).toHaveLength(0);
    expect(events.at(-1)?.window).toBe("fiveHour");
    expect(orch.getUsage().rateLimitedWindow).toBe("fiveHour");
  });

  it("resumes spawning once the usage checker clears", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    let util = 1.0;
    const checker = {
      check: async () => ({
        fetchedAt: new Date().toISOString(),
        fiveHour: { utilization: util, resetsAt: "2099-01-01T00:00:00Z" },
        sevenDay: { utilization: 0, resetsAt: "2099-01-07T00:00:00Z" },
      }),
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    await orch.tick();
    expect(logger.listRuns()).toHaveLength(0);
    util = 0.2;
    await orch.tick();
    expect(logger.listRuns()).toHaveLength(1);
  });

  it("marks a crashed run as rate_limited when usage is capped after the failure", async () => {
    const crashing: Scenario = {
      name: "crash-on-tool",
      labels: [],
      steps: [
        { role: "assistant", content: "about to crash", delay_ms: 0 },
        { role: "tool", content: "boom", delay_ms: 0, throw: true },
      ],
    };
    const agent = new MockAgent({ scenarios: [crashing], sleep: async () => {} });
    let calls = 0;
    const checker = {
      check: async () => {
        calls += 1;
        // Stay under the cap for the tick-level + pre-spawn checks; trip on the
        // post-failure force-refresh so the catch block flags the run as rate_limited.
        const utilization = calls >= 3 ? 1.0 : 0;
        return {
          fetchedAt: new Date().toISOString(),
          fiveHour: { utilization, resetsAt: "2099-01-01T00:00:00Z" },
          sevenDay: { utilization: 0, resetsAt: "2099-01-07T00:00:00Z" },
        };
      },
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    await orch.tick();
    const run = logger.listRuns()[0];
    expect(run.status).toBe("rate_limited");
    const eventTypes = logger.listEvents(run.id).map((e) => e.eventType);
    expect(eventTypes).toContain("rate_limited");
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("aborts the spawn (no run row) when rate-limit appears between tick and launch", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    let calls = 0;
    const checker = {
      check: async () => {
        calls += 1;
        // tick-level refresh sees clean usage; the pre-spawn force-refresh trips.
        // A "test launch" that would only fail on first contact must not persist
        // a run row or count against turn metrics.
        const utilization = calls >= 2 ? 1.0 : 0;
        return {
          fetchedAt: new Date().toISOString(),
          fiveHour: { utilization, resetsAt: "2099-01-01T00:00:00Z" },
          sevenDay: { utilization: 0, resetsAt: "2099-01-07T00:00:00Z" },
        };
      },
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    await orch.tick();
    expect(logger.listRuns()).toHaveLength(0);
    expect(orch.getUsage().rateLimitedWindow).toBe("fiveHour");
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(dir, "worktrees", "BEN-1"))).toBe(false);
  });

  it("reports orchestrator state: poll interval, queue depth, concurrency, lastTickAt", async () => {
    tracker = new MemoryTracker({
      activeStates: ["Todo"],
      issues: [
        makeIssue({ id: "i-1", identifier: "BEN-1" }),
        makeIssue({ id: "i-2", identifier: "BEN-2" }),
        makeIssue({ id: "i-3", identifier: "BEN-3" }),
      ],
    });
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 2,
          max_turns: 10,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    const initial = orch.getState();
    expect(initial.polling).toBe(false);
    expect(initial.pollIntervalMs).toBe(1_000);
    expect(initial.lastTickAt).toBeNull();
    expect(initial.concurrency).toEqual({ current: 0, max: 2 });
    expect(initial.queueDepth).toBe(0);

    const ticks: number[] = [];
    orch.on("tick", (s: { concurrency: { current: number }; queueDepth: number }) =>
      ticks.push(s.concurrency.current * 100 + s.queueDepth),
    );

    await orch.tick();

    expect(ticks.length).toBeGreaterThan(0);
    const after = orch.getState();
    expect(after.lastTickAt).not.toBeNull();
    expect(after.queueDepth).toBe(1);
    expect(after.concurrency.current).toBe(0);
  });

  it("sets queueDepth to 0 when rate-limited", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const checker = {
      check: async () => ({
        fetchedAt: new Date().toISOString(),
        fiveHour: { utilization: 1.0, resetsAt: "2099-01-01T00:00:00Z" },
        sevenDay: { utilization: 0, resetsAt: "2099-01-07T00:00:00Z" },
      }),
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    await orch.tick();
    const s = orch.getState();
    expect(s.queueDepth).toBe(0);
    expect(s.lastTickAt).not.toBeNull();
  });

  it("exposes editable runtime settings + emits settingsUpdated", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });

    const updates: Array<Record<string, unknown>> = [];
    orch.on("settingsUpdated", (s) => updates.push(s as Record<string, unknown>));

    expect(orch.getSettings()).toEqual({
      pollIntervalMs: 1_000,
      maxConcurrentAgents: 1,
      maxTurns: 5,
      maxTurnsState: "Blocked",
      pollingMode: "auto",
    });

    const next = orch.updateSettings({
      pollIntervalMs: 2_000,
      maxConcurrentAgents: 2,
      maxTurns: 7,
      maxTurnsState: "Rework",
    });
    expect(next).toEqual({
      pollIntervalMs: 2_000,
      maxConcurrentAgents: 2,
      maxTurns: 7,
      maxTurnsState: "Rework",
      pollingMode: "auto",
    });
    expect(updates).toHaveLength(1);
    expect(orch.getState().pollIntervalMs).toBe(2_000);
    expect(orch.getState().concurrency.max).toBe(2);

    expect(() => orch.updateSettings({ pollIntervalMs: 10 })).toThrow(/>= 1000/);
    expect(() => orch.updateSettings({ maxConcurrentAgents: 0 })).toThrow(/>= 1/);
    expect(() => orch.updateSettings({ maxTurns: 0 })).toThrow(/>= 1/);
  });

  it("honors runtime-updated maxTurns + maxTurnsState on the next run", async () => {
    const agent = new MockAgent({ scenarios: [NEVER_ENDING], sleep: async () => {} });
    const orch = new Orchestrator({
      workflow: workflow({
        agent: {
          kind: "mock",
          max_concurrent_agents: 1,
          max_turns: 10,
          max_turns_state: "Blocked",
        },
      }),
      tracker,
      agent,
      workspace,
      logger,
    });

    orch.updateSettings({ maxTurns: 2, maxTurnsState: "Rework" });
    await orch.tick();

    expect(tracker.getIssue("i-1")?.state).toBe("Rework");
    const run = logger.listRuns()[0];
    expect(run.status).toBe("max_turns");
    expect(logger.listTurns(run.id)).toHaveLength(2);
  });

  it("manual polling mode pauses the timer but leaves explicit tick() working", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });

    orch.setPollingMode("manual");
    expect(orch.getState().pollingMode).toBe("manual");
    expect(orch.getState().polling).toBe(false);

    orch.start();
    expect(orch.getState().polling).toBe(false);

    // start() still runs an immediate tick. Wait for it to complete.
    await new Promise((r) => setTimeout(r, 50));
    const afterStart = logger.listRuns();
    expect(afterStart).toHaveLength(1);

    orch.setPollingMode("auto");
    expect(orch.getState().polling).toBe(true);
    await orch.stop();
  });

  it("renders the Liquid prompt with the issue context", async () => {
    const rendered: string[] = [];
    class CapturingAgent extends MockAgent {
      override async startSession(ctx: {
        workdir: string;
        prompt: string;
        issueIdentifier?: string;
      }) {
        rendered.push(ctx.prompt);
        return super.startSession(ctx);
      }
    }
    const agent = new CapturingAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });
    await orch.tick();
    expect(rendered[0]).toBe("Ticket BEN-1: Fix bug");
  });

  it("invokes the self updater at tick start and emits selfUpdated", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const result = {
      repoPath: "/repo",
      branch: "main",
      headBefore: "a",
      headAfter: "b",
      changed: true,
      fetchedAt: "2026-04-20T00:00:00.000Z",
    };
    let calls = 0;
    const selfUpdater = {
      maybeFetch: async () => {
        calls += 1;
        return result;
      },
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      selfUpdater,
    });
    const events: Array<{ changed: boolean }> = [];
    orch.on("selfUpdated", (e: { result: { changed: boolean } }) =>
      events.push({ changed: e.result.changed }),
    );
    await orch.tick();
    expect(calls).toBe(1);
    expect(events).toEqual([{ changed: true }]);
    expect(orch.getLastSelfUpdate()).toEqual(result);
  });

  it("emits selfUpdateError when the updater throws and continues the tick", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const selfUpdater = {
      maybeFetch: async () => {
        throw new Error("git unavailable");
      },
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      selfUpdater,
    });
    const errors: Error[] = [];
    orch.on("selfUpdateError", (e: { error: Error }) => errors.push(e.error));
    await orch.tick();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("git unavailable");
    expect(logger.listRuns()).toHaveLength(1);
  });

  it("skips the self updater when the orchestrator is rate-limited", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    let selfUpdateCalls = 0;
    const selfUpdater = {
      maybeFetch: async () => {
        selfUpdateCalls += 1;
        return null;
      },
    };
    const checker = {
      check: async () => ({
        fetchedAt: new Date().toISOString(),
        fiveHour: { utilization: 1.0, resetsAt: "2099-01-01T00:00:00Z" },
        sevenDay: { utilization: 0, resetsAt: "2099-01-07T00:00:00Z" },
      }),
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
      selfUpdater,
    });
    await orch.tick();
    expect(selfUpdateCalls).toBe(0);
  });

  it("records the starting usage snapshot + auth status on the run row", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const checker = {
      check: async () => ({
        fetchedAt: new Date().toISOString(),
        fiveHour: { utilization: 0.4, resetsAt: "2099-01-01T00:00:00Z" },
        sevenDay: { utilization: 0.1, resetsAt: "2099-01-07T00:00:00Z" },
      }),
    };
    const orch = new Orchestrator({
      workflow: workflow(),
      tracker,
      agent,
      workspace,
      logger,
      usageChecker: checker,
      usageMinIntervalMs: 0,
    });
    await orch.tick();
    const run = logger.listRuns()[0];
    expect(run.authStatus).toBe("authenticated");
    expect(run.startFiveHourUtil).toBeCloseTo(0.4);
    expect(run.startSevenDayUtil).toBeCloseTo(0.1);
  });

  it("falls back to auth_status=unknown when no usage checker is configured", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });
    await orch.tick();
    const run = logger.listRuns()[0];
    expect(run.authStatus).toBe("unknown");
    expect(run.startFiveHourUtil).toBeNull();
    expect(run.startSevenDayUtil).toBeNull();
  });

  it("persists agent token usage on the run row when the session exposes it", async () => {
    const agent = new MockAgent({ scenarios: [HAPPY], sleep: async () => {} });
    const originalStart = agent.startSession.bind(agent);
    agent.startSession = async (ctx) => {
      const session = await originalStart(ctx);
      (session as { getTokenUsage?: () => unknown }).getTokenUsage = () => ({
        inputTokens: 200,
        outputTokens: 80,
        cacheReadInputTokens: 40,
        cacheCreationInputTokens: 10,
        totalCostUsd: 0.05,
      });
      return session;
    };
    const orch = new Orchestrator({ workflow: workflow(), tracker, agent, workspace, logger });
    await orch.tick();
    const run = logger.listRuns()[0];
    expect(run.tokensInput).toBe(200);
    expect(run.tokensOutput).toBe(80);
    expect(run.tokensCacheRead).toBe(40);
    expect(run.tokensCacheCreation).toBe(10);
    expect(run.totalCostUsd).toBeCloseTo(0.05);
  });
});
