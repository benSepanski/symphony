import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SymphonyLogger } from "./logger.js";

describe("SymphonyLogger — concurrent writers under WAL", () => {
  let dir: string;
  let dbPath: string;
  let logsDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "symphony-wal-"));
    dbPath = join(dir, "symphony.db");
    logsDir = join(dir, "logs");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not lose or duplicate rows when two loggers share a DB", async () => {
    const writerA = new SymphonyLogger({ dbPath, logsDir });
    const writerB = new SymphonyLogger({ dbPath, logsDir });
    const runA = writerA.startRun({ issueId: "a", issueIdentifier: "A-1" });
    const runB = writerB.startRun({ issueId: "b", issueIdentifier: "B-1" });

    const turnsPerWriter = 50;
    const emitTurns = (logger: SymphonyLogger, runId: string, tag: string) =>
      Array.from({ length: turnsPerWriter }, (_, i) =>
        logger.recordTurn({
          runId,
          role: "assistant",
          content: `${tag}:${i}`,
        }),
      );

    await Promise.all([
      Promise.resolve().then(() => emitTurns(writerA, runA, "A")),
      Promise.resolve().then(() => emitTurns(writerB, runB, "B")),
    ]);

    writerA.finishRun(runA, "completed");
    writerB.finishRun(runB, "completed");

    const reader = new SymphonyLogger({ dbPath, logsDir });
    try {
      const runs = reader.listRuns();
      expect(runs.map((r) => r.id).sort()).toEqual([runA, runB].sort());

      const turnsA = reader.listTurns(runA);
      const turnsB = reader.listTurns(runB);
      expect(turnsA).toHaveLength(turnsPerWriter);
      expect(turnsB).toHaveLength(turnsPerWriter);

      const seq = (turns: typeof turnsA) => turns.map((t) => t.content);
      expect(seq(turnsA)).toEqual(Array.from({ length: turnsPerWriter }, (_, i) => `A:${i}`));
      expect(seq(turnsB)).toEqual(Array.from({ length: turnsPerWriter }, (_, i) => `B:${i}`));

      const uniqueTurnIds = new Set([...turnsA, ...turnsB].map((t) => t.id));
      expect(uniqueTurnIds.size).toBe(turnsPerWriter * 2);
    } finally {
      reader.close();
      writerA.close();
      writerB.close();
    }
  });
});
