import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SymphonyLogger } from "./persistence/logger.js";
import { ReplayNotFound, createReplayEmitter } from "./replay.js";

describe("createReplayEmitter", () => {
  let dir: string;
  let logger: SymphonyLogger;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "symphony-replay-"));
    logger = new SymphonyLogger({
      dbPath: join(dir, "symphony.db"),
      logsDir: join(dir, "logs"),
    });
  });

  afterEach(() => {
    logger.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("re-emits a recorded run's events in order", async () => {
    const runId = logger.startRun({ issueId: "i", issueIdentifier: "BEN-1" });
    logger.recordTurn({ runId, role: "assistant", content: "a" });
    logger.recordTurn({ runId, role: "assistant", content: "b", finalState: "Done" });
    logger.finishRun(runId, "completed");

    const sleep = vi.fn(async () => {});
    const { events, run } = createReplayEmitter({ runId, logger, sleep, speed: 1000 });
    const captured: Array<{ name: string; payload: unknown }> = [];
    events.on("runStarted", (p) => captured.push({ name: "runStarted", payload: p }));
    events.on("turn", (p) => captured.push({ name: "turn", payload: p }));
    events.on("runFinished", (p) => captured.push({ name: "runFinished", payload: p }));
    await run();
    expect(captured.map((c) => c.name)).toEqual(["runStarted", "turn", "turn", "runFinished"]);
  });

  it("throws ReplayNotFound when the runId is unknown", async () => {
    const { run } = createReplayEmitter({ runId: "nope", logger, sleep: async () => {} });
    await expect(run()).rejects.toBeInstanceOf(ReplayNotFound);
  });
});
