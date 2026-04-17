export interface AgentTurn {
  role: string;
  content: string;
  toolCalls?: unknown[];
}

export interface AgentSession {
  runTurn(): Promise<AgentTurn>;
  stop(): Promise<void>;
}

export interface Agent {
  startSession(workdir: string, prompt: string): Promise<AgentSession>;
}
