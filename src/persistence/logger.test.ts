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

  it("listRuns includes turnCount", () => {
    const a = logger.startRun({ issueId: "a", issueIdentifier: "A-1" });
    logger.recordTurn({ runId: a, role: "assistant", content: "one" });
    logger.recordTurn({ runId: a, role: "assistant", content: "two" });
    const b = logger.startRun({ issueId: "b", issueIdentifier: "B-1" });
    logger.recordTurn({ runId: b, role: "assistant", content: "one" });
    logger.startRun({ issueId: "c", issueIdentifier: "C-1" });

    const runs = logger.listRuns();
    const byId = new Map(runs.map((r) => [r.id, r.turnCount]));
    expect(byId.get(a)).toBe(2);
    expect(byId.get(b)).toBe(1);
    expect(runs.find((r) => r.issueIdentifier === "C-1")?.turnCount).toBe(0);
  });

  it("listRecentEvents filters by type, orders newest first, and caps limit", () => {
    const a = logger.startRun({ issueId: "a", issueIdentifier: "A-1" });
    const b = logger.startRun({ issueId: "b", issueIdentifier: "B-1" });
    logger.logEvent({ runId: a, eventType: "workspace_created", issueId: "a", payload: {} });
    logger.logEvent({
      runId: a,
      eventType: "error",
      issueId: "a",
      payload: { message: "boom-1" },
    });
    logger.logEvent({
      runId: b,
      eventType: "rate_limited",
      issueId: "b",
      payload: { window: "fiveHour" },
    });
    logger.logEvent({ runId: b, eventType: "error", issueId: "b", payload: { message: "boom-2" } });

    const all = logger.listRecentEvents(["error", "rate_limited"]);
    expect(all.map((e) => e.eventType)).toEqual(["error", "rate_limited", "error"]);
    expect(all[0].runId).toBe(b);

    const onlyErrors = logger.listRecentEvents(["error"]);
    expect(onlyErrors.map((e) => e.eventType)).toEqual(["error", "error"]);

    const capped = logger.listRecentEvents(["error", "rate_limited"], 2);
    expect(capped).toHaveLength(2);

    expect(logger.listRecentEvents([])).toEqual([]);
  });
});
