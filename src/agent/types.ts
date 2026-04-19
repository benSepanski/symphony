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
   * Totals parsed from the agent's final `result` messages. Returns `null` when
   * the agent did not surface any usage data (e.g. the mock agent).
   */
  getTokenUsage?(): TokenUsage | null;
}

export interface Agent {
  startSession(context: AgentStartContext): Promise<AgentSession>;
}
