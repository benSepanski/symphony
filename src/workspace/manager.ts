import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Issue } from "../tracker/types.js";

const execFileAsync = promisify(execFile);

export interface WorkspaceManagerOptions {
  root: string;
  hooks?: {
    afterCreate?: string;
    beforeRemove?: string;
  };
  hookTimeoutMs?: number;
}

export interface Workspace {
  issueId: string;
  issueIdentifier: string;
  path: string;
}

export class HookError extends Error {
  constructor(
    readonly hook: "after_create" | "before_remove",
    readonly stderr: string,
    readonly exitCode: number | null,
  ) {
    super(`hook ${hook} failed (exit ${exitCode ?? "?"}): ${stderr.trim() || "no stderr"}`);
    this.name = "HookError";
  }
}

export class WorkspaceManager {
  private readonly root: string;
  private readonly afterCreate?: string;
  private readonly beforeRemove?: string;
  private readonly hookTimeoutMs: number;

  constructor(options: WorkspaceManagerOptions) {
    this.root = expandTilde(options.root);
    this.afterCreate = options.hooks?.afterCreate;
    this.beforeRemove = options.hooks?.beforeRemove;
    this.hookTimeoutMs = options.hookTimeoutMs ?? 300_000;
    mkdirSync(this.root, { recursive: true });
  }

  rootPath(): string {
    return this.root;
  }

  workspacePath(issue: Pick<Issue, "identifier">): string {
    return join(this.root, issue.identifier);
  }

  list(): Workspace[] {
    return readdirSync(this.root)
      .filter((name) => {
        try {
          return statSync(join(this.root, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
      .map((name) => ({
        issueId: name,
        issueIdentifier: name,
        path: join(this.root, name),
      }));
  }

  async create(issue: Issue): Promise<Workspace> {
    const path = this.workspacePath(issue);
    mkdirSync(path, { recursive: true });
    if (this.afterCreate) {
      await this.runHook("after_create", this.afterCreate, path, issue);
    }
    return { issueId: issue.id, issueIdentifier: issue.identifier, path };
  }

  async destroy(issue: Issue): Promise<void> {
    const path = this.workspacePath(issue);
    if (this.beforeRemove) {
      await this.runHook("before_remove", this.beforeRemove, path, issue);
    }
    rmSync(path, { recursive: true, force: true });
  }

  private async runHook(
    name: "after_create" | "before_remove",
    script: string,
    cwd: string,
    issue: Issue,
  ): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ISSUE_ID: issue.id,
      ISSUE_IDENTIFIER: issue.identifier,
      ISSUE_TITLE: issue.title,
      ISSUE_STATE: issue.state,
      ISSUE_URL: issue.url,
      ISSUE_LABELS: issue.labels.join(","),
    };
    try {
      await execFileAsync("bash", ["-eu", "-c", script], {
        cwd,
        env,
        timeout: this.hookTimeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        stderr?: string;
        code?: number;
      };
      throw new HookError(name, e.stderr ?? e.message ?? "", e.code ?? null);
    }
  }
}

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return resolve(p);
}
