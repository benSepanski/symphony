export interface ApiRun {
  id: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  scenario: string | null;
}

export interface ApiTurn {
  id: string;
  runId: string;
  turnNumber: number;
  role: string;
  content: string;
  toolCalls: string | null;
  finalState: string | null;
  renderedPrompt: string | null;
  createdAt: string;
}

export interface ApiEvent {
  id: number;
  runId: string;
  turnId: string | null;
  eventType: string;
  issueId: string | null;
  payload: string | null;
  ts: string;
}

export interface ApiRunDetail {
  run: ApiRun;
  turns: ApiTurn[];
  events: ApiEvent[];
}

export async function fetchRuns(): Promise<ApiRun[]> {
  const res = await fetch("/api/runs");
  if (!res.ok) throw new Error(`/api/runs returned ${res.status}`);
  return (await res.json()) as ApiRun[];
}

export async function fetchRun(id: string): Promise<ApiRunDetail> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`/api/runs/${id} returned ${res.status}`);
  return (await res.json()) as ApiRunDetail;
}
