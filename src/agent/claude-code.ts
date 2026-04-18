import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { Agent, AgentSession, AgentStartContext, AgentTurn } from "./types.js";

export type SpawnFn = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;

export interface ClaudeCodeAgentOptions {
  command?: string;
  model?: string;
  permissionMode?: string;
  extraArgs?: string[];
  spawn?: SpawnFn;
}

export class ClaudeCodeAgent implements Agent {
  private readonly command: string;
  private readonly model?: string;
  private readonly permissionMode?: string;
  private readonly extraArgs: string[];
  private readonly spawn: SpawnFn;

  constructor(options: ClaudeCodeAgentOptions = {}) {
    this.command = options.command ?? "claude";
    this.model = options.model;
    this.permissionMode = options.permissionMode;
    this.extraArgs = options.extraArgs ?? [];
    this.spawn = options.spawn ?? (nodeSpawn as SpawnFn);
  }

  async startSession(ctx: AgentStartContext): Promise<AgentSession> {
    const args = ["--output-format", "stream-json", "--print"];
    if (this.model) args.push("--model", this.model);
    if (this.permissionMode) args.push("--permission-mode", this.permissionMode);
    args.push(...this.extraArgs);
    args.push(ctx.prompt);

    const child = this.spawn(this.command, args, {
      cwd: ctx.workdir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new ClaudeCodeAgentSession(child);
  }
}

type PendingResolver = {
  resolve: (turn: AgentTurn) => void;
  reject: (err: Error) => void;
};

class ClaudeCodeAgentSession implements AgentSession {
  private readonly queue: AgentTurn[] = [];
  private readonly pending: PendingResolver[] = [];
  private streamClosed = false;
  private exitError: Error | null = null;
  private stderrBuffer = "";

  constructor(private readonly child: ChildProcess) {
    const stdout = child.stdout as Readable | null;
    if (!stdout) throw new Error("claude child has no stdout");
    const rl = createInterface({ input: stdout, crlfDelay: Infinity });
    rl.on("line", (line) => this.ingest(line));
    rl.on("close", () => this.closeStream());
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
      if (this.stderrBuffer.length > 8192) {
        this.stderrBuffer = this.stderrBuffer.slice(-8192);
      }
    });
    child.on("error", (err) => {
      this.exitError = err;
      this.closeStream();
    });
    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        this.exitError = new Error(
          `claude exited with code ${code}${signal ? ` (signal ${signal})` : ""}: ${this.stderrBuffer.trim().slice(-500)}`,
        );
      }
      this.closeStream();
    });
  }

  async runTurn(): Promise<AgentTurn> {
    const queued = this.queue.shift();
    if (queued) return queued;
    if (this.streamClosed) {
      if (this.exitError) throw this.exitError;
      throw new Error("claude session has no more turns");
    }
    return new Promise<AgentTurn>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  isDone(): boolean {
    return this.streamClosed && this.queue.length === 0;
  }

  async stop(): Promise<void> {
    if (this.streamClosed) return;
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.child.killed) this.child.kill("SIGKILL");
          resolve();
        }, 2000);
        this.child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  writePrompt(text: string): void {
    const stdin = this.child.stdin as Writable | null;
    stdin?.write(`${text}\n`);
  }

  private ingest(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    const turn = toAgentTurn(parsed);
    if (turn) this.deliver(turn);
    if (isResultMessage(parsed)) {
      this.closeStream();
    }
  }

  private deliver(turn: AgentTurn): void {
    const waiter = this.pending.shift();
    if (waiter) {
      waiter.resolve(turn);
      return;
    }
    this.queue.push(turn);
  }

  private closeStream(): void {
    if (this.streamClosed) return;
    this.streamClosed = true;
    while (this.pending.length > 0) {
      const waiter = this.pending.shift()!;
      if (this.exitError) {
        waiter.reject(this.exitError);
      } else {
        waiter.reject(new Error("claude stream closed before a turn was emitted"));
      }
    }
  }
}

interface StreamMessage {
  type?: string;
  message?: {
    role?: string;
    content?: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; name: string; input: unknown; id?: string }
      | { type: "tool_result"; tool_use_id?: string; content: unknown }
    >;
  };
}

function isResultMessage(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && (raw as { type?: string }).type === "result";
}

export function toAgentTurn(raw: unknown): AgentTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as StreamMessage;
  if (msg.type !== "assistant" && msg.type !== "user") return null;
  const content = msg.message?.content ?? [];

  const textParts: string[] = [];
  const toolCalls: Array<{ name: string; input: unknown; id?: string }> = [];
  const toolResults: Array<{ tool_use_id?: string; content: unknown }> = [];

  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else if (part.type === "tool_use") {
      toolCalls.push({ name: part.name, input: part.input, id: part.id });
    } else if (part.type === "tool_result") {
      toolResults.push({ tool_use_id: part.tool_use_id, content: part.content });
    }
  }

  if (msg.type === "assistant") {
    if (textParts.length === 0 && toolCalls.length === 0) return null;
    return {
      role: "assistant",
      content: textParts.join("\n\n"),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // tool result message, only emit if there are tool results
  if (toolResults.length === 0) return null;
  return {
    role: "tool",
    content: toolResults
      .map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content)))
      .join("\n"),
    toolCalls: toolResults,
  };
}
