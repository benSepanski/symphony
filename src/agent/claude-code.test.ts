import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { ClaudeCodeAgent, toAgentTurn } from "./claude-code.js";

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
