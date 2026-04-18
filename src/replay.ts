import { EventEmitter } from "node:events";
import type { SymphonyLogger, TurnLog } from "./persistence/logger.js";

export interface ReplayOptions {
  runId: string;
  logger: SymphonyLogger;
  sleep?: (ms: number) => Promise<void>;
  speed?: number;
}

export class ReplayNotFound extends Error {
  constructor(runId: string) {
    super(`run ${runId} not found in logger`);
    this.name = "ReplayNotFound";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createReplayEmitter(options: ReplayOptions): {
  events: EventEmitter;
  run: () => Promise<void>;
} {
  const events = new EventEmitter();
  const sleep = options.sleep ?? defaultSleep;
  const speed = options.speed ?? 1;

  const run = async () => {
    const runs = options.logger.listRuns();
    const run = runs.find((r) => r.id === options.runId);
    if (!run) throw new ReplayNotFound(options.runId);

    const turns = options.logger.listTurns(run.id);
    const issue = {
      id: run.issueId,
      identifier: run.issueIdentifier,
      title: "",
      description: null,
      state: "",
      labels: [],
      url: "",
    };

    events.emit("runStarted", { runId: run.id, issue });

    let lastTs = new Date(run.startedAt).getTime();
    for (const turn of turns) {
      const nextTs = new Date(turn.createdAt).getTime();
      const delay = Math.max(0, (nextTs - lastTs) / speed);
      if (delay > 0) await sleep(delay);
      lastTs = nextTs;
      events.emit("turn", {
        runId: run.id,
        issue,
        turn: toAgentTurn(turn),
      });
    }

    if (run.finishedAt) {
      const finalDelay = Math.max(0, (new Date(run.finishedAt).getTime() - lastTs) / speed);
      if (finalDelay > 0) await sleep(finalDelay);
    }

    events.emit("runFinished", {
      runId: run.id,
      issue,
      status: run.status === "running" ? "completed" : run.status,
    });
  };

  return { events, run };
}

function toAgentTurn(turn: TurnLog) {
  return {
    role: turn.role,
    content: turn.content,
    toolCalls: turn.toolCalls ? (JSON.parse(turn.toolCalls) as unknown[]) : undefined,
    finalState: turn.finalState ?? undefined,
  };
}
