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

export type ApiPollingMode = "auto" | "manual";

export interface ApiOrchestratorState {
  polling: boolean;
  pollIntervalMs: number;
  pollingMode: ApiPollingMode;
  lastTickAt: number | null;
  concurrency: { current: number; max: number };
  queueDepth: number;
}

export interface ApiOrchestratorSettings {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxTurnsState: string;
  pollingMode: ApiPollingMode;
}

export interface ApiWorkflowSummary {
  tracker: {
    kind: string;
    projectSlug: string;
    activeStates: string[];
    terminalStates: string[];
  };
  workspaceRoot: string;
  agentKind: string;
  claudeCode: { command?: string; model?: string; permissionMode?: string } | null;
  mock: { scenariosDir: string; assignment: string; defaultScenario?: string } | null;
  promptSource: string;
  promptVersion: string;
  hooks: { afterCreate: boolean; beforeRemove: boolean };
}

export interface ApiSettingsResponse {
  settings: ApiOrchestratorSettings | null;
  workflow: ApiWorkflowSummary | null;
}

export interface ApiHealth {
  orchestrator: ApiOrchestratorState | null;
  usage: ApiUsage;
}

export interface ApiRecentEventsResponse {
  events: ApiEvent[];
}

// Endpoint identifier used in error messages — by default the request URL,
// but PATCH/POST callers pass a method-tagged label like "PATCH /api/settings".
function endpointLabel(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method?.toUpperCase();
  return method && method !== "GET" ? `${method} ${url}` : url;
}

/**
 * Fetch JSON and throw on non-2xx. Internal — do not export. Each public
 * function below is a thin typed wrapper, so the dashboard never calls fetch
 * directly and every error message has the same `<endpoint> returned <status>`
 * shape.
 */
async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`${endpointLabel(input, init)} returned ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchRuns(): Promise<ApiRun[]> {
  return requestJson<ApiRun[]>("/api/runs");
}

export async function fetchRun(id: string): Promise<ApiRunDetail> {
  return requestJson<ApiRunDetail>(`/api/runs/${encodeURIComponent(id)}`);
}

export async function searchRuns(q: string): Promise<ApiSearchResult> {
  return requestJson<ApiSearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
}

export async function fetchUsage(): Promise<ApiUsage> {
  return requestJson<ApiUsage>("/api/usage");
}

export async function fetchSettings(): Promise<ApiSettingsResponse> {
  return requestJson<ApiSettingsResponse>("/api/settings");
}

export async function fetchHealth(): Promise<ApiHealth> {
  return requestJson<ApiHealth>("/api/health");
}

export async function fetchRecentEvents(
  types?: string[],
  limit = 50,
): Promise<ApiRecentEventsResponse> {
  const params = new URLSearchParams();
  if (types && types.length > 0) params.set("types", types.join(","));
  params.set("limit", String(limit));
  return requestJson<ApiRecentEventsResponse>(`/api/events/recent?${params.toString()}`);
}

export async function patchSettings(
  patch: Partial<ApiOrchestratorSettings>,
): Promise<ApiOrchestratorSettings> {
  // PATCH returns either { settings } on success or { error } on failure with
  // a non-2xx status, so we can't share `requestJson` — surface the server's
  // error message verbatim instead of the generic "<endpoint> returned N".
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json()) as {
    settings?: ApiOrchestratorSettings;
    error?: string;
  };
  if (!res.ok || !body.settings) {
    throw new Error(body.error ?? `PATCH /api/settings returned ${res.status}`);
  }
  return body.settings;
}

export async function requestManualTick(): Promise<void> {
  const res = await fetch("/api/orchestrator/tick", { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `POST /api/orchestrator/tick returned ${res.status}`);
  }
}
