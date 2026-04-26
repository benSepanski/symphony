export interface AgentTurn {
  role: string;
  content: string;
  toolCalls?: unknown[];
  finalState?: string;
}

export interface AgentStartContext {
  workdir: string;
  prompt: string;
  issueIdentifier?: string;
  labels?: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
}

export interface AgentSession {
  runTurn(): Promise<AgentTurn>;
  isDone(): boolean;
  stop(): Promise<void>;
  /**
   * Cumulative token usage for the session. Prefers the CLI's `result.usage`
   * (cumulative + cost), and falls back to summed per-call usage from
   * `assistant` messages when the CLI was killed before emitting `result`
   * (e.g. max_turns). Cost is `0` in the fallback path. Returns `null` when no
   * usage data was surfaced at all (e.g. the mock agent).
   */
  getTokenUsage?(): TokenUsage | null;
}

export interface Agent {
  startSession(context: AgentStartContext): Promise<AgentSession>;
}
