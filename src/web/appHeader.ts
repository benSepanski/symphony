import type { Route } from "./appRoute.js";

export interface RunHeader {
  runId: string;
  issueIdentifier: string;
}

export type RunHeaderLabel =
  | { kind: "identifier"; identifier: string }
  | { kind: "fallback"; slice: string };

export function runHeaderLabel(routeRunId: string, header: RunHeader | null): RunHeaderLabel {
  if (header && header.runId === routeRunId) {
    return { kind: "identifier", identifier: header.issueIdentifier };
  }
  return { kind: "fallback", slice: routeRunId.slice(0, 8) };
}

export function documentTitleForRoute(route: Route, header: RunHeader | null): string {
  if (route.view === "run" && header && header.runId === route.runId) {
    return `Symphony · ${header.issueIdentifier}`;
  }
  return "Symphony";
}
