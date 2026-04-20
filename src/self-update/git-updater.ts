import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SelfUpdateResult, SelfUpdater } from "./types.js";

const execFileAsync = promisify(execFile);

export type ExecFn = (
  file: string,
  args: readonly string[],
  opts: { cwd: string; timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

export interface GitSelfUpdaterOptions {
  repoPath: string;
  branch: string;
  minIntervalMs: number;
  remote?: string;
  fetchTimeoutMs?: number;
  exec?: ExecFn;
  now?: () => number;
}

export class GitSelfUpdater implements SelfUpdater {
  private readonly repoPath: string;
  private readonly branch: string;
  private readonly minIntervalMs: number;
  private readonly remote: string;
  private readonly fetchTimeoutMs: number;
  private readonly exec: ExecFn;
  private readonly now: () => number;
  private lastFetchMs = 0;
  private inFlight: Promise<SelfUpdateResult | null> | null = null;

  constructor(options: GitSelfUpdaterOptions) {
    this.repoPath = options.repoPath;
    this.branch = options.branch;
    this.minIntervalMs = options.minIntervalMs;
    this.remote = options.remote ?? "origin";
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 120_000;
    this.exec = options.exec ?? defaultExec;
    this.now = options.now ?? Date.now;
  }

  async maybeFetch(): Promise<SelfUpdateResult | null> {
    if (this.inFlight) return this.inFlight;
    const nowMs = this.now();
    if (this.lastFetchMs !== 0 && nowMs - this.lastFetchMs < this.minIntervalMs) return null;
    this.lastFetchMs = nowMs;
    const run = this.fetchOnce();
    this.inFlight = run;
    try {
      return await run;
    } finally {
      this.inFlight = null;
    }
  }

  private async fetchOnce(): Promise<SelfUpdateResult> {
    const remoteRef = `${this.remote}/${this.branch}`;
    const headBefore = await this.revParse(remoteRef);
    await this.git(["fetch", this.remote, this.branch]);
    const headAfter = await this.revParse(remoteRef);
    return {
      repoPath: this.repoPath,
      branch: this.branch,
      headBefore,
      headAfter,
      changed: headBefore !== headAfter,
      fetchedAt: new Date(this.now()).toISOString(),
    };
  }

  private async revParse(ref: string): Promise<string> {
    try {
      const { stdout } = await this.git(["rev-parse", ref]);
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private git(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return this.exec("git", args, {
      cwd: this.repoPath,
      timeout: this.fetchTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}

const defaultExec: ExecFn = async (file, args, opts) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    ...opts,
    encoding: "utf8",
  });
  return { stdout, stderr };
};
