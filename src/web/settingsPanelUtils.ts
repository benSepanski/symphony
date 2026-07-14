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

export interface SettingsDraft {
  pollIntervalMs: string;
  maxConcurrentAgents: string;
  maxTurns: string;
  maxTurnsState: string;
}

export type SettingsField = keyof SettingsDraft;

export interface ValidatedDraft {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxTurnsState: string;
}

export type ValidateDraftResult =
  | { ok: true; values: ValidatedDraft }
  | { ok: false; field: SettingsField; message: string };

export function validateDraft(draft: SettingsDraft): ValidateDraftResult {
  const parsedInterval = Number(draft.pollIntervalMs);
  if (!Number.isFinite(parsedInterval) || parsedInterval < 1000) {
    return {
      ok: false,
      field: "pollIntervalMs",
      message: "poll interval must be ≥ 1000 ms",
    };
  }
  const parsedConcurrency = Number(draft.maxConcurrentAgents);
  if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
    return {
      ok: false,
      field: "maxConcurrentAgents",
      message: "max concurrent agents must be ≥ 1",
    };
  }
  const parsedTurns = Number(draft.maxTurns);
  if (!Number.isInteger(parsedTurns) || parsedTurns < 1) {
    return {
      ok: false,
      field: "maxTurns",
      message: "max turns must be ≥ 1",
    };
  }
  const trimmedMaxTurnsState = draft.maxTurnsState.trim();
  if (trimmedMaxTurnsState.length === 0) {
    return {
      ok: false,
      field: "maxTurnsState",
      message: "max turns state must not be empty",
    };
  }
  return {
    ok: true,
    values: {
      pollIntervalMs: Math.floor(parsedInterval),
      maxConcurrentAgents: parsedConcurrency,
      maxTurns: parsedTurns,
      maxTurnsState: trimmedMaxTurnsState,
    },
  };
}
