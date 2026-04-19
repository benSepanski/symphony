import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("pruneOlderThan removes runs, children, and JSONL files older than the cutoff", () => {
    clock = Date.UTC(2026, 0, 1);
    const oldRun = logger.startRun({ issueId: "a", issueIdentifier: "A-1" });
    logger.recordTurn({ runId: oldRun, role: "assistant", content: "old" });
    logger.finishRun(oldRun, "completed");

    clock = Date.UTC(2026, 0, 10);
    const newRun = logger.startRun({ issueId: "b", issueIdentifier: "B-1" });
    logger.recordTurn({ runId: newRun, role: "assistant", content: "new" });

    expect(existsSync(logger.jsonlPath(oldRun))).toBe(true);
    const result = logger.pruneOlderThan(new Date(Date.UTC(2026, 0, 5)));
    expect(result).toEqual({ runsRemoved: 1, filesRemoved: 1 });
    expect(logger.listRuns().map((r) => r.id)).toEqual([newRun]);
    expect(logger.listTurns(oldRun)).toEqual([]);
    expect(existsSync(logger.jsonlPath(oldRun))).toBe(false);
    expect(existsSync(logger.jsonlPath(newRun))).toBe(true);
  });

  it("pruneOlderThan is a no-op when nothing predates the cutoff", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "X-1" });
    logger.recordTurn({ runId, role: "assistant", content: "hi" });
    const result = logger.pruneOlderThan(new Date(Date.UTC(1970, 0, 1)));
    expect(result).toEqual({ runsRemoved: 0, filesRemoved: 0 });
    expect(logger.listRuns()).toHaveLength(1);
  });

  it("finds turn + event matches via search()", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    logger.recordTurn({ runId, role: "assistant", content: "found the magic needle here" });
    logger.recordTurn({ runId, role: "assistant", content: "boring content" });
    logger.logEvent({ runId, eventType: "note", payload: { message: "magic in payload too" } });

    const matches = logger.search("magic");
    expect(matches.map((m) => m.matchKind).sort()).toEqual(["event", "turn"]);
    const turnMatch = matches.find((m) => m.matchKind === "turn");
    expect(turnMatch?.snippet).toContain("magic needle");
    expect(turnMatch?.turnNumber).toBe(1);
    const eventMatch = matches.find((m) => m.matchKind === "event");
    expect(eventMatch?.eventType).toBe("note");
  });

  it("returns an empty list for an empty query", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    logger.recordTurn({ runId, role: "assistant", content: "anything" });
    expect(logger.search("")).toEqual([]);
    expect(logger.search("   ")).toEqual([]);
  });

  it("escapes LIKE wildcards in the query", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    logger.recordTurn({ runId, role: "assistant", content: "benign plain text" });
    expect(logger.search("%")).toEqual([]);
    expect(logger.search("_")).toEqual([]);
  });

  it("writes JSONL under .../<runId>.jsonl", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    expect(logger.jsonlPath(runId)).toBe(join(dir, "logs", `${runId}.jsonl`));
  });

  it("defaults history columns to null and persists them via updateRunUsage / start context", () => {
    const runId = logger.startRun({ issueId: "x", issueIdentifier: "BEN-X" });
    const before = logger.listRuns()[0];
    expect(before.tokensInput).toBeNull();
    expect(before.tokensOutput).toBeNull();
    expect(before.totalCostUsd).toBeNull();
    expect(before.authStatus).toBeNull();
    expect(before.startFiveHourUtil).toBeNull();

    logger.recordRunStartContext({
      runId,
      authStatus: "authenticated",
      startFiveHourUtil: 0.42,
      startSevenDayUtil: 0.11,
    });
    logger.updateRunUsage({
      runId,
      tokensInput: 1200,
      tokensOutput: 340,
      tokensCacheRead: 500,
      tokensCacheCreation: 60,
      totalCostUsd: 0.0123,
    });

    const after = logger.listRuns()[0];
    expect(after.tokensInput).toBe(1200);
    expect(after.tokensOutput).toBe(340);
    expect(after.tokensCacheRead).toBe(500);
    expect(after.tokensCacheCreation).toBe(60);
    expect(after.totalCostUsd).toBeCloseTo(0.0123);
    expect(after.authStatus).toBe("authenticated");
    expect(after.startFiveHourUtil).toBeCloseTo(0.42);
    expect(after.startSevenDayUtil).toBeCloseTo(0.11);

    const jsonlEvents = readJsonl(logger.jsonlPath(runId)).map((e) => e.event_type);
    expect(jsonlEvents).toContain("run_start_context");
    expect(jsonlEvents).toContain("run_token_usage");
  });
});
