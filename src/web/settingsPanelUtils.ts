import type { ApiOrchestratorSettings } from "./api.js";
import { formatInterval } from "./shared.js";

export type SettingsSaveStateTag = "idle" | "saving" | "saved" | "error";

export function settingsPanelInitialOpen(
  dirty: boolean,
  saveStateTag: SettingsSaveStateTag,
): boolean {
  return dirty || saveStateTag === "error";
}

export function formatSettingsSnapshot(s: ApiOrchestratorSettings): string {
  return [
    `poll ${formatInterval(s.pollIntervalMs)}`,
    `max turns ${s.maxTurns}`,
    `concurrency ${s.maxConcurrentAgents}`,
    s.pollingMode === "auto" ? "auto refresh" : "manual refresh",
  ].join(" · ");
}
