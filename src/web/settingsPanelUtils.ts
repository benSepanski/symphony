import type { ApiOrchestratorSettings } from "./api.js";

export type SettingsSaveStateTag = "idle" | "saving" | "saved" | "error";

export function settingsPanelInitialOpen(
  dirty: boolean,
  saveStateTag: SettingsSaveStateTag,
): boolean {
  return dirty || saveStateTag === "error";
}

export function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function formatSettingsSnapshot(s: ApiOrchestratorSettings): string {
  return [
    `poll ${formatInterval(s.pollIntervalMs)}`,
    `max turns ${s.maxTurns}`,
    `concurrency ${s.maxConcurrentAgents}`,
    s.pollingMode === "auto" ? "auto refresh" : "manual refresh",
  ].join(" · ");
}
