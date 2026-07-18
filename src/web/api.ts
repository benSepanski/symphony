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

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new HttpError(res.status, `${path} returned ${res.status}`);
  return (await res.json()) as T;
}

async function readErrorBody(res: Response, context: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `${context} returned ${res.status}`;
}

export function fetchRuns(): Promise<ApiRun[]> {
  return getJson<ApiRun[]>("/api/runs");
}

export function fetchRun(id: string): Promise<ApiRunDetail> {
  return getJson<ApiRunDetail>(`/api/runs/${encodeURIComponent(id)}`);
}

export interface ApiSearchMatch {
  runId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  matchKind: "turn" | "event";
  turnNumber: number | null;
  eventType: string | null;
  eventId: number | null;
  snippet: string;
}

export interface ApiSearchResult {
  query: string;
  matches: ApiSearchMatch[];
}

export function searchRuns(q: string): Promise<ApiSearchResult> {
  return getJson<ApiSearchResult>(`/api/search?q=${encodeURIComponent(q)}`);
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

export function fetchUsage(): Promise<ApiUsage> {
  return getJson<ApiUsage>("/api/usage");
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

export function fetchSettings(): Promise<ApiSettingsResponse> {
  return getJson<ApiSettingsResponse>("/api/settings");
}

export async function patchSettings(
  patch: Partial<ApiOrchestratorSettings>,
): Promise<ApiOrchestratorSettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new HttpError(res.status, await readErrorBody(res, "/api/settings PATCH"));
  }
  const body = (await res.json()) as { settings?: ApiOrchestratorSettings };
  if (!body.settings) {
    throw new HttpError(res.status, "/api/settings PATCH returned no settings");
  }
  return body.settings;
}

export async function requestManualTick(): Promise<void> {
  const res = await fetch("/api/orchestrator/tick", { method: "POST" });
  if (!res.ok) {
    throw new HttpError(res.status, await readErrorBody(res, "/api/orchestrator/tick"));
  }
}

export interface ApiHealth {
  orchestrator: ApiOrchestratorState | null;
  usage: ApiUsage;
}

export function fetchHealth(): Promise<ApiHealth> {
  return getJson<ApiHealth>("/api/health");
}

export interface ApiRecentEventsResponse {
  events: ApiEvent[];
}

export function fetchRecentEvents(types?: string[], limit = 50): Promise<ApiRecentEventsResponse> {
  const params = new URLSearchParams();
  if (types && types.length > 0) params.set("types", types.join(","));
  params.set("limit", String(limit));
  return getJson<ApiRecentEventsResponse>(`/api/events/recent?${params.toString()}`);
}
