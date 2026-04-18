import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { UsageChecker, UsageSnapshot } from "./types.js";

// WARNING: This hits an UNDOCUMENTED internal Claude Code OAuth endpoint.
// It's what the Claude Code CLI itself uses, and has no SLA — Anthropic may
// change the path, headers, response shape, or auth scheme at any time. If
// this stops working, the first thing to suspect is that the endpoint or
// anthropic-beta header moved. Credential locations vary by OS:
//   macOS  — Keychain generic password "Claude Code-credentials"
//   Linux  — ~/.claude/.credentials.json
//   Windows — Credential Manager (not yet implemented here)
const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_BETA = "oauth-2025-04-20";
const USER_AGENT = "claude-code/2.0.31";

export interface ClaudeOAuthCheckerOptions {
  readToken?: () => string | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  onError?: (err: Error) => void;
}

export class ClaudeOAuthUsageChecker implements UsageChecker {
  private readonly readToken: () => string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly onError: (err: Error) => void;

  constructor(options: ClaudeOAuthCheckerOptions = {}) {
    this.readToken = options.readToken ?? defaultReadToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => {});
  }

  async check(): Promise<UsageSnapshot | null> {
    let token: string | null;
    try {
      token = this.readToken();
    } catch (err) {
      this.onError(err as Error);
      return null;
    }
    if (!token) return null;

    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": ANTHROPIC_BETA,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
    } catch (err) {
      this.onError(err as Error);
      return null;
    }

    if (!res.ok) {
      this.onError(new Error(`claude oauth usage endpoint returned ${res.status}`));
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      this.onError(err as Error);
      return null;
    }

    return parseUsageResponse(body, this.now().toISOString());
  }
}

export function parseUsageResponse(raw: unknown, fetchedAt: string): UsageSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const five = r.five_hour;
  const seven = r.seven_day;
  if (!isWindow(five) || !isWindow(seven)) return null;
  return {
    fetchedAt,
    fiveHour: { utilization: five.utilization, resetsAt: five.resets_at },
    sevenDay: { utilization: seven.utilization, resetsAt: seven.resets_at },
  };
}

function isWindow(value: unknown): value is { utilization: number; resets_at: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.utilization === "number" && typeof v.resets_at === "string";
}

export function defaultReadToken(): string | null {
  if (platform() === "darwin") return readTokenFromKeychain();
  return readTokenFromFile();
}

function readTokenFromKeychain(): string | null {
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    return parsed.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

function readTokenFromFile(): string | null {
  const path = join(homedir(), ".claude", ".credentials.json");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } };
    return parsed.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
