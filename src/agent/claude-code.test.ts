import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  ClaudeCodeAgent,
  extractAssistantUsage,
  extractResultUsage,
  mergeTokenUsage,
  toAgentTurn,
} from "./claude-code.js";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  kill(_signal?: NodeJS.Signals): boolean {
    this.killed = true;
    setImmediate(() => this.emit("exit", null, _signal ?? "SIGTERM"));
    return true;
  }
  pushLine(obj: unknown): void {
    this.stdout.write(`${JSON.stringify(obj)}\n`);
  }
  close(code = 0): void {
    this.stdout.end();
    this.emit("exit", code, null);
  }
}

function fakeSpawn() {
  const child = new FakeChild();
  const spawn = vi.fn(
    (_cmd: string, _args: string[], _opts: SpawnOptions) => child as unknown as ChildProcess,
  );
  return { child, spawn };
}

describe("toAgentTurn", () => {
  it("maps an assistant text message", () => {
    const turn = toAgentTurn({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    });
    expect(turn).toEqual({ role: "assistant", content: "hello", toolCalls: undefined });
  });

  it("maps an assistant message with a tool_use block", () => {
    const turn = toAgentTurn({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "running" },
          { type: "tool_use", name: "bash", input: { command: "ls" }, id: "t1" },
        ],
      },
    });
    expect(turn?.role).toBe("assistant");
    expect(turn?.content).toBe("running");
    expect(turn?.toolCalls).toEqual([{ name: "bash", input: { command: "ls" }, id: "t1" }]);
  });

  it("maps a tool_result user message", () => {
    const turn = toAgentTurn({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t1", content: "file1\nfile2" }],
      },
    });
    expect(turn?.role).toBe("tool");
    expect(turn?.content).toContain("file1");
  });

  it("ignores system, init, and result messages", () => {
    expect(toAgentTurn({ type: "system", subtype: "init" })).toBeNull();
    expect(toAgentTurn({ type: "result" })).toBeNull();
  });
});

describe("extractResultUsage", () => {
  it("returns null for non-result messages", () => {
    expect(extractResultUsage({ type: "assistant" })).toBeNull();
    expect(extractResultUsage(null)).toBeNull();
  });

  it("extracts all four token counts and cost from a result message", () => {
    const usage = extractResultUsage({
      type: "result",
      usage: {
        input_tokens: 12,
        output_tokens: 34,
        cache_read_input_tokens: 56,
        cache_creation_input_tokens: 78,
      },
      total_cost_usd: 1.23,
    });
    expect(usage).toEqual({
      inputTokens: 12,
      outputTokens: 34,
      cacheReadInputTokens: 56,
      cacheCreationInputTokens: 78,
      totalCostUsd: 1.23,
    });
  });

  it("treats missing counts as zero rather than rejecting the message", () => {
    const usage = extractResultUsage({
      type: "result",
      total_cost_usd: 0.5,
    });
    expect(usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      totalCostUsd: 0.5,
    });
  });
});

describe("extractAssistantUsage", () => {
  it("returns null for non-assistant messages", () => {
    expect(extractAssistantUsage({ type: "result", usage: { input_tokens: 1 } })).toBeNull();
    expect(extractAssistantUsage({ type: "user" })).toBeNull();
    expect(extractAssistantUsage(null)).toBeNull();
  });

  it("returns null when assistant message has no usage block", () => {
    expect(extractAssistantUsage({ type: "assistant", message: {} })).toBeNull();
  });

  it("extracts per-call token counts and reports zero cost", () => {
    const usage = extractAssistantUsage({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 4,
          output_tokens: 11,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 7,
        },
      },
    });
    expect(usage).toEqual({
      inputTokens: 4,
      outputTokens: 11,
      cacheReadInputTokens: 2,
      cacheCreationInputTokens: 7,
      totalCostUsd: 0,
    });
  });
});

describe("mergeTokenUsage", () => {
  it("sums every token bucket and cost across result messages", () => {
    const merged = mergeTokenUsage(
      {
        inputTokens: 1,
        outputTokens: 2,
        cacheReadInputTokens: 3,
        cacheCreationInputTokens: 4,
        totalCostUsd: 0.1,
      },
      {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadInputTokens: 30,
        cacheCreationInputTokens: 40,
        totalCostUsd: 0.9,
      },
    );
    expect(merged).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadInputTokens: 33,
      cacheCreationInputTokens: 44,
      totalCostUsd: 1.0,
    });
  });
});

describe("ClaudeCodeAgent", () => {
  it("spawns claude with the configured flags and prompt as argv", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({
      model: "sonnet",
      permissionMode: "acceptEdits",
      spawn,
    });
    const session = agent.startSession({ workdir: "/tmp", prompt: "do the thing" });
    child.pushLine({
      type: "assistant",
      message: { content: [{ type: "text", text: "ok" }] },
    });
    child.pushLine({ type: "result", subtype: "success" });
    child.close(0);
    const s = await session;
    const turn = await s.runTurn();
    expect(turn.content).toBe("ok");
    expect(spawn).toHaveBeenCalledOnce();
    const [cmd, args] = spawn.mock.calls[0]!;
    expect(cmd).toBe("claude");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("acceptEdits");
    expect(args[args.length - 1]).toBe("do the thing");
  });

  it("queues turns and marks isDone when the stream closes", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({ spawn });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    const runs: Promise<unknown>[] = [session.runTurn(), session.runTurn()];
    child.pushLine({
      type: "assistant",
      message: { content: [{ type: "text", text: "first" }] },
    });
    child.pushLine({
      type: "assistant",
      message: { content: [{ type: "text", text: "second" }] },
    });
    child.pushLine({ type: "result", subtype: "success" });
    child.close(0);

    const [a, b] = (await Promise.all(runs)) as Array<{ content: string }>;
    expect(a.content).toBe("first");
    expect(b.content).toBe("second");
    expect(session.isDone()).toBe(true);
  });

  it("exposes accumulated token usage from the stream's result messages", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({ spawn });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    child.pushLine({
      type: "assistant",
      message: { content: [{ type: "text", text: "hi" }] },
    });
    child.pushLine({
      type: "result",
      subtype: "success",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 10,
      },
      total_cost_usd: 0.0025,
    });
    child.close(0);
    await session.runTurn();

    expect(session.getTokenUsage?.()).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 30,
      cacheCreationInputTokens: 10,
      totalCostUsd: 0.0025,
    });
  });

  it("falls back to summed assistant usage when the stream closes without a result message", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({ spawn });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    child.pushLine({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "first" }],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 1,
        },
      },
    });
    child.pushLine({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "second" }],
        usage: {
          input_tokens: 200,
          output_tokens: 40,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 2,
        },
      },
    });
    // Close without a `result` message — what happens when the orchestrator
    // SIGTERMs on max_turns.
    child.close(0);

    await session.runTurn();
    await session.runTurn();

    expect(session.getTokenUsage?.()).toEqual({
      inputTokens: 300,
      outputTokens: 60,
      cacheReadInputTokens: 15,
      cacheCreationInputTokens: 3,
      totalCostUsd: 0,
    });
  });

  it("prefers result.usage over accumulated assistant usage when both are present", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({ spawn });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    child.pushLine({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "hi" }],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 1,
        },
      },
    });
    child.pushLine({
      type: "result",
      subtype: "success",
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 1,
      },
      total_cost_usd: 0.0042,
    });
    child.close(0);
    await session.runTurn();

    expect(session.getTokenUsage?.()).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 5,
      cacheCreationInputTokens: 1,
      totalCostUsd: 0.0042,
    });
  });

  it("rejects a pending runTurn if claude exits non-zero", async () => {
    const { child, spawn } = fakeSpawn();
    const agent = new ClaudeCodeAgent({ spawn });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    const pending = session.runTurn();
    child.stderr.write("bad things happened\n");
    child.emit("exit", 2, null);
    child.stdout.end();

    await expect(pending).rejects.toThrow(/exited with code 2/);
  });
});
