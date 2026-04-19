export interface ApiRun {
  id: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  scenario: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheCreation: number | null;
  totalCostUsd: number | null;
  authStatus: string | null;
  startFiveHourUtil: number | null;
  startSevenDayUtil: number | null;
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

export interface ApiSearchMatch {
  runId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  matchKind: "turn" | "event";
  turnNumber: number | null;
  eventType: string | null;
  snippet: string;
}

export interface ApiSearchResult {
  query: string;
  matches: ApiSearchMatch[];
}

export async function searchRuns(q: string): Promise<ApiSearchResult> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`/api/search returned ${res.status}`);
  return (await res.json()) as ApiSearchResult;
}

export interface ApiUsageWindow {
  utilization: number;
  resetsAt: string;
}

export interface ApiUsageSnapshot {
  fiveHour: ApiUsageWindow;
  sevenDay: ApiUsageWindow;
  fetchedAt: string;
}

export interface ApiUsage {
  snapshot: ApiUsageSnapshot | null;
  rateLimitedWindow: "fiveHour" | "sevenDay" | null;
}

export async function fetchUsage(): Promise<ApiUsage> {
  const res = await fetch("/api/usage");
  if (!res.ok) throw new Error(`/api/usage returned ${res.status}`);
  return (await res.json()) as ApiUsage;
}
