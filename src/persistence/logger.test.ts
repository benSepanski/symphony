import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SymphonyLogger } from "./logger.js";

function readJsonl(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("SymphonyLogger", () => {
  let dir: string;
  let logger: SymphonyLogger;
  let clock: number;
  let nextId: number;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "symphony-logger-"));
    clock = Date.UTC(2026, 0, 1);
    nextId = 0;
    logger = new SymphonyLogger({
      dbPath: join(dir, "symphony.db"),
      logsDir: join(dir, "logs"),
      now: () => new Date(clock++),
      idGenerator: () => `id-${++nextId}`,
    });
  });

  afterEach(() => {
    logger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists a full run to both SQLite and JSONL", () => {
    const runId = logger.startRun({
      issueId: "i-1",
      issueIdentifier: "BEN-1",
      scenario: "happy-path",
      promptVersion: "v1",
      promptSource: "prompts/default-v1.md",
    });
    const turnId = logger.recordTurn({
      runId,
      role: "assistant",
      content: "hi",
      finalState: "Human Review",
      renderedPrompt: "Hello BEN-1",
    });
    logger.logEvent({
      runId,
      turnId,
      eventType: "state_transition",
      issueId: "i-1",
      payload: { to: "Human Review" },
    });
    logger.finishRun(runId, "completed");

    const runs = logger.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].scenario).toBe("happy-path");
    expect(runs[0].promptVersion).toBe("v1");
    expect(runs[0].promptSource).toBe("prompts/default-v1.md");

    const turns = logger.listTurns(runId);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[0].finalState).toBe("Human Review");
    expect(turns[0].renderedPrompt).toBe("Hello BEN-1");

    const events = logger.listEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("state_transition");

    const jsonl = readJsonl(logger.jsonlPath(runId));
    expect(jsonl.map((e) => e.event_type)).toEqual([
      "run_started",
      "turn_recorded",
      "state_transition",
      "run_finished",
    ]);
    for (const entry of jsonl) {
      expect(entry.run_id).toBe(runId);
    }
  });

  it("numbers turns monotonically per run", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    logger.recordTurn({ runId, role: "assistant", content: "a" });
    logger.recordTurn({ runId, role: "assistant", content: "b" });
    logger.recordTurn({ runId, role: "assistant", content: "c" });
    const turns = logger.listTurns(runId);
    expect(turns.map((t) => t.turnNumber)).toEqual([1, 2, 3]);
  });

  it("serializes tool_calls and payload as JSON", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    logger.recordTurn({
      runId,
      role: "tool",
      content: "ran",
      toolCalls: [{ name: "bash", input: { command: "ls" } }],
    });
    logger.logEvent({
      runId,
      eventType: "note",
      payload: { counts: { a: 1 } },
    });
    const turn = logger.listTurns(runId)[0];
    expect(JSON.parse(turn.toolCalls!)).toEqual([{ name: "bash", input: { command: "ls" } }]);
    const event = logger.listEvents(runId)[0];
    expect(JSON.parse(event.payload!)).toEqual({ counts: { a: 1 } });
  });

  it("writes JSONL under .../<runId>.jsonl", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    expect(logger.jsonlPath(runId)).toBe(join(dir, "logs", `${runId}.jsonl`));
  });
});
