export interface ApiRun {
  id: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  scenario: string | null;
  turnCount: number;
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

export interface ApiOrchestratorState {
  polling: boolean;
  pollIntervalMs: number;
  lastTickAt: number | null;
  concurrency: { current: number; max: number };
  queueDepth: number;
}

export interface ApiHealth {
  orchestrator: ApiOrchestratorState | null;
  usage: ApiUsage;
}

export async function fetchHealth(): Promise<ApiHealth> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`/api/health returned ${res.status}`);
  return (await res.json()) as ApiHealth;
}

export interface ApiRecentEventsResponse {
  events: ApiEvent[];
}

export async function fetchRecentEvents(
  types?: string[],
  limit = 50,
): Promise<ApiRecentEventsResponse> {
  const params = new URLSearchParams();
  if (types && types.length > 0) params.set("types", types.join(","));
  params.set("limit", String(limit));
  const res = await fetch(`/api/events/recent?${params.toString()}`);
  if (!res.ok) throw new Error(`/api/events/recent returned ${res.status}`);
  return (await res.json()) as ApiRecentEventsResponse;
}
