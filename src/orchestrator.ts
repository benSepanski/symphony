import { EventEmitter } from "node:events";
import { Liquid } from "liquidjs";
import type { ParsedWorkflow } from "./config/workflow.js";
import type { Agent, AgentTurn } from "./agent/types.js";
import type { Issue, Tracker } from "./tracker/types.js";
import type { WorkspaceManager } from "./workspace/manager.js";
import type { SymphonyLogger } from "./persistence/logger.js";
import type { UsageChecker, UsageSnapshot } from "./usage/types.js";
import { rateLimitedWindow } from "./usage/types.js";

export interface OrchestratorOptions {
  workflow: ParsedWorkflow;
  tracker: Tracker;
  agent: Agent;
  workspace: WorkspaceManager;
  logger: SymphonyLogger;
  scenarioFor?: (issue: Issue) => string | undefined;
  usageChecker?: UsageChecker;
  usageMinIntervalMs?: number;
}

export interface UsageUpdatedEvent {
  snapshot: UsageSnapshot | null;
  rateLimitedWindow: "fiveHour" | "sevenDay" | null;
}

export interface RunStartedEvent {
  runId: string;
  issue: Issue;
}

export interface TurnEvent {
  runId: string;
  issue: Issue;
  turn: AgentTurn;
}

export interface RunFinishedEvent {
  runId: string;
  issue: Issue;
  status: "completed" | "max_turns" | "failed" | "cancelled" | "rate_limited";
  error?: Error;
}

export interface OrchestratorState {
  polling: boolean;
  pollIntervalMs: number;
  lastTickAt: number | null;
  concurrency: { current: number; max: number };
  queueDepth: number;
}

export class Orchestrator extends EventEmitter {
  private readonly workflow: ParsedWorkflow;
  private readonly tracker: Tracker;
  private readonly agent: Agent;
  private readonly workspace: WorkspaceManager;
  private readonly logger: SymphonyLogger;
  private readonly liquid: Liquid;
  private readonly scenarioFor?: (issue: Issue) => string | undefined;
  private readonly usageChecker?: UsageChecker;
  private readonly usageMinIntervalMs: number;
  private readonly claimed = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private inflightTicks = new Set<Promise<void>>();
  private lastUsage: UsageSnapshot | null = null;
  private lastUsageAt = 0;
  private lastRateLimitWindow: "fiveHour" | "sevenDay" | null = null;
  private lastTickAt: number | null = null;
  private lastQueueDepth = 0;

  constructor(options: OrchestratorOptions) {
    super();
    this.workflow = options.workflow;
    this.tracker = options.tracker;
    this.agent = options.agent;
    this.workspace = options.workspace;
    this.logger = options.logger;
    this.liquid = new Liquid();
    this.scenarioFor = options.scenarioFor;
    this.usageChecker = options.usageChecker;
    this.usageMinIntervalMs = options.usageMinIntervalMs ?? 30_000;
  }

  getUsage(): UsageUpdatedEvent {
    return { snapshot: this.lastUsage, rateLimitedWindow: this.lastRateLimitWindow };
  }

  getState(): OrchestratorState {
    return {
      polling: this.pollTimer !== null && !this.shuttingDown,
      pollIntervalMs: this.workflow.config.polling.interval_ms,
      lastTickAt: this.lastTickAt,
      concurrency: {
        current: this.claimed.size,
        max: this.workflow.config.agent.max_concurrent_agents,
      },
      queueDepth: this.lastQueueDepth,
    };
  }

  start(): void {
    if (this.pollTimer || this.shuttingDown) return;
    const interval = this.workflow.config.polling.interval_ms;
    const tick = () => {
      const p = this.tick().catch((err) => {
        this.emit("error", err);
      });
      this.inflightTicks.add(p);
      p.finally(() => this.inflightTicks.delete(p));
    };
    tick();
    this.pollTimer = setInterval(tick, interval);
    this.pollTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await Promise.allSettled([...this.inflightTicks]);
  }

  async tick(): Promise<void> {
    if (this.shuttingDown) return;
    await this.refreshUsage();
    if (this.lastRateLimitWindow) {
      this.lastQueueDepth = 0;
      this.lastTickAt = Date.now();
      this.emit("tick", this.getState());
      return;
    }
    const issues = await this.tracker.fetchCandidateIssues();
    const capacity = this.workflow.config.agent.max_concurrent_agents - this.claimed.size;
    const available = issues.filter((i) => !this.claimed.has(i.id));
    const toStart = capacity > 0 ? available.slice(0, capacity) : [];
    this.lastQueueDepth = available.length - toStart.length;
    const started = toStart.map((issue) => this.runIssue(issue));
    this.lastTickAt = Date.now();
    this.emit("tick", this.getState());
    await Promise.all(started);
  }

  private async refreshUsage(force = false): Promise<void> {
    if (!this.usageChecker) return;
    const nowMs = Date.now();
    if (!force && nowMs - this.lastUsageAt < this.usageMinIntervalMs && this.lastUsage) return;
    const snapshot = await this.usageChecker.check();
    this.lastUsageAt = nowMs;
    this.lastUsage = snapshot;
    this.lastRateLimitWindow = snapshot ? rateLimitedWindow(snapshot) : null;
    this.emit("usageUpdated", {
      snapshot,
      rateLimitedWindow: this.lastRateLimitWindow,
    } satisfies UsageUpdatedEvent);
  }

  async runIssue(issue: Issue): Promise<void> {
    if (this.claimed.has(issue.id)) return;
    this.claimed.add(issue.id);
    let runId: string | null = null;
    let workspaceCreated = false;
    let session: import("./agent/types.js").AgentSession | null = null;
    let status: RunFinishedEvent["status"] = "completed";
    let finalState: string | undefined;
    let caughtError: Error | undefined;

    try {
      const initialPrompt = await this.renderPrompt(issue, 1);
      const scenario = this.scenarioFor?.(issue);
      runId = this.logger.startRun({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueTitle: issue.title,
        scenario: scenario ?? null,
        promptVersion: this.workflow.promptVersion,
        promptSource: this.workflow.promptSource,
      });
      this.emit("runStarted", { runId, issue } satisfies RunStartedEvent);

      const ws = await this.workspace.create(issue);
      workspaceCreated = true;
      this.logger.logEvent({
        runId,
        eventType: "workspace_created",
        issueId: issue.id,
        payload: { path: ws.path },
      });

      session = await this.agent.startSession({
        workdir: ws.path,
        prompt: initialPrompt,
        issueIdentifier: issue.identifier,
        labels: issue.labels,
      });

      let turnsTaken = 0;
      const maxTurns = this.workflow.config.agent.max_turns;

      while (!session.isDone()) {
        if (this.shuttingDown) {
          status = "cancelled";
          break;
        }
        if (turnsTaken >= maxTurns) {
          status = "max_turns";
          finalState = this.workflow.config.agent.max_turns_state;
          break;
        }
        const attempt = turnsTaken + 1;
        const renderedPrompt =
          attempt === 1 ? initialPrompt : await this.renderPrompt(issue, attempt);
        const turn = await session.runTurn();
        turnsTaken += 1;
        this.logger.recordTurn({
          runId,
          role: turn.role,
          content: turn.content,
          toolCalls: turn.toolCalls,
          finalState: turn.finalState ?? null,
          renderedPrompt,
        });
        this.emit("turn", { runId, issue, turn } satisfies TurnEvent);
        if (turn.finalState) finalState = turn.finalState;
      }
    } catch (err) {
      caughtError = err as Error;
      status = "failed";
      if (runId) {
        this.logger.logEvent({
          runId,
          eventType: "error",
          issueId: issue.id,
          payload: { message: caughtError.message, name: caughtError.name },
        });
      }
      await this.refreshUsage(true);
      if (this.lastRateLimitWindow) {
        status = "rate_limited";
        if (runId) {
          this.logger.logEvent({
            runId,
            eventType: "rate_limited",
            issueId: issue.id,
            payload: {
              window: this.lastRateLimitWindow,
              resetsAt: this.lastUsage?.[this.lastRateLimitWindow].resetsAt,
            },
          });
        }
      }
    } finally {
      try {
        if (session) await session.stop();
      } catch (err) {
        if (runId) {
          this.logger.logEvent({
            runId,
            eventType: "session_stop_error",
            issueId: issue.id,
            payload: { message: (err as Error).message },
          });
        }
      }

      const transitionState =
        finalState ??
        (status === "failed" || status === "cancelled"
          ? this.workflow.config.agent.max_turns_state
          : undefined);
      if (transitionState) {
        try {
          await this.tracker.updateIssueState(issue.id, transitionState);
          if (runId) {
            this.logger.logEvent({
              runId,
              eventType: "state_transition",
              issueId: issue.id,
              payload: { to: transitionState },
            });
          }
        } catch (err) {
          if (runId) {
            this.logger.logEvent({
              runId,
              eventType: "state_transition_error",
              issueId: issue.id,
              payload: { message: (err as Error).message },
            });
          }
        }
      }

      if (workspaceCreated) {
        try {
          await this.workspace.destroy(issue);
          if (runId) {
            this.logger.logEvent({
              runId,
              eventType: "workspace_destroyed",
              issueId: issue.id,
            });
          }
        } catch (err) {
          if (runId) {
            this.logger.logEvent({
              runId,
              eventType: "workspace_destroy_error",
              issueId: issue.id,
              payload: { message: (err as Error).message },
            });
          }
        }
      }

      if (runId) {
        this.logger.finishRun(runId, status);
        this.emit("runFinished", {
          runId,
          issue,
          status,
          error: caughtError,
        } satisfies RunFinishedEvent);
      } else if (caughtError) {
        this.emit("error", caughtError);
      }
      this.claimed.delete(issue.id);
    }
  }

  private async renderPrompt(issue: Issue, attempt = 1): Promise<string> {
    return this.liquid.parseAndRender(this.workflow.promptTemplate, {
      issue,
      attempt,
    });
  }
}
