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

export type PollingMode = "auto" | "manual";

export interface OrchestratorSettings {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxTurnsState: string;
  pollingMode: PollingMode;
}

export interface OrchestratorState {
  polling: boolean;
  pollIntervalMs: number;
  pollingMode: PollingMode;
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
  private pollIntervalMs: number;
  private maxConcurrentAgents: number;
  private maxTurns: number;
  private maxTurnsState: string;
  private pollingMode: PollingMode = "auto";

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
    this.pollIntervalMs = options.workflow.config.polling.interval_ms;
    this.maxConcurrentAgents = options.workflow.config.agent.max_concurrent_agents;
    this.maxTurns = options.workflow.config.agent.max_turns;
    this.maxTurnsState = options.workflow.config.agent.max_turns_state;
  }

  getUsage(): UsageUpdatedEvent {
    return { snapshot: this.lastUsage, rateLimitedWindow: this.lastRateLimitWindow };
  }

  getState(): OrchestratorState {
    return {
      polling: this.pollTimer !== null && !this.shuttingDown,
      pollIntervalMs: this.pollIntervalMs,
      pollingMode: this.pollingMode,
      lastTickAt: this.lastTickAt,
      concurrency: {
        current: this.claimed.size,
        max: this.maxConcurrentAgents,
      },
      queueDepth: this.lastQueueDepth,
    };
  }

  getSettings(): OrchestratorSettings {
    return {
      pollIntervalMs: this.pollIntervalMs,
      maxConcurrentAgents: this.maxConcurrentAgents,
      maxTurns: this.maxTurns,
      maxTurnsState: this.maxTurnsState,
      pollingMode: this.pollingMode,
    };
  }

  updateSettings(patch: Partial<OrchestratorSettings>): OrchestratorSettings {
    if (patch.pollIntervalMs !== undefined) {
      if (!Number.isFinite(patch.pollIntervalMs) || patch.pollIntervalMs < 1_000) {
        throw new Error("pollIntervalMs must be a finite number >= 1000");
      }
      this.pollIntervalMs = Math.floor(patch.pollIntervalMs);
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.scheduleTick(), this.pollIntervalMs);
        this.pollTimer.unref?.();
      }
    }
    if (patch.maxConcurrentAgents !== undefined) {
      if (!Number.isInteger(patch.maxConcurrentAgents) || patch.maxConcurrentAgents < 1) {
        throw new Error("maxConcurrentAgents must be an integer >= 1");
      }
      this.maxConcurrentAgents = patch.maxConcurrentAgents;
    }
    if (patch.maxTurns !== undefined) {
      if (!Number.isInteger(patch.maxTurns) || patch.maxTurns < 1) {
        throw new Error("maxTurns must be an integer >= 1");
      }
      this.maxTurns = patch.maxTurns;
    }
    if (patch.maxTurnsState !== undefined) {
      if (typeof patch.maxTurnsState !== "string" || patch.maxTurnsState.length === 0) {
        throw new Error("maxTurnsState must be a non-empty string");
      }
      this.maxTurnsState = patch.maxTurnsState;
    }
    if (patch.pollingMode !== undefined) {
      this.setPollingMode(patch.pollingMode);
    }
    const settings = this.getSettings();
    this.emit("settingsUpdated", settings);
    this.emit("tick", this.getState());
    return settings;
  }

  setPollingMode(mode: PollingMode): void {
    if (mode !== "auto" && mode !== "manual") {
      throw new Error(`unknown polling mode: ${String(mode)}`);
    }
    if (this.pollingMode === mode) return;
    this.pollingMode = mode;
    if (mode === "manual") {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    } else if (!this.pollTimer && !this.shuttingDown) {
      this.pollTimer = setInterval(() => this.scheduleTick(), this.pollIntervalMs);
      this.pollTimer.unref?.();
    }
  }

  private scheduleTick(): void {
    const p = this.tick().catch((err) => {
      this.emit("error", err);
    });
    this.inflightTicks.add(p);
    p.finally(() => this.inflightTicks.delete(p));
  }

  start(): void {
    if (this.pollTimer || this.shuttingDown) return;
    this.scheduleTick();
    if (this.pollingMode === "auto") {
      this.pollTimer = setInterval(() => this.scheduleTick(), this.pollIntervalMs);
      this.pollTimer.unref?.();
    }
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
    const capacity = this.maxConcurrentAgents - this.claimed.size;
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

      while (!session.isDone()) {
        if (this.shuttingDown) {
          status = "cancelled";
          break;
        }
        if (turnsTaken >= this.maxTurns) {
          status = "max_turns";
          finalState = this.maxTurnsState;
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
        (status === "failed" || status === "cancelled" ? this.maxTurnsState : undefined);
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
