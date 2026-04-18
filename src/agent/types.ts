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

export interface AgentSession {
  runTurn(): Promise<AgentTurn>;
  isDone(): boolean;
  stop(): Promise<void>;
}

export interface Agent {
  startSession(context: AgentStartContext): Promise<AgentSession>;
}
