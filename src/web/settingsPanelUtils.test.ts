import { describe, expect, it } from "vitest";
import type { ApiOrchestratorSettings } from "./api.js";
import { formatSettingsSnapshot, settingsPanelInitialOpen } from "./settingsPanelUtils.js";

describe("settingsPanelInitialOpen", () => {
  it("returns false when the draft is clean and there is no error", () => {
    expect(settingsPanelInitialOpen(false, "idle")).toBe(false);
    expect(settingsPanelInitialOpen(false, "saving")).toBe(false);
    expect(settingsPanelInitialOpen(false, "saved")).toBe(false);
  });

  it("returns true when the draft is dirty", () => {
    expect(settingsPanelInitialOpen(true, "idle")).toBe(true);
    expect(settingsPanelInitialOpen(true, "saving")).toBe(true);
  });

  it("returns true when the last save errored", () => {
    expect(settingsPanelInitialOpen(false, "error")).toBe(true);
  });
});

describe("formatSettingsSnapshot", () => {
  function makeSettings(overrides: Partial<ApiOrchestratorSettings> = {}): ApiOrchestratorSettings {
    return {
      pollIntervalMs: 30 * 60_000,
      maxConcurrentAgents: 1,
      maxTurns: 5,
      maxTurnsState: "Blocked",
      pollingMode: "auto",
      ...overrides,
    };
  }

  it("joins the key knobs with the auto-refresh mode", () => {
    expect(formatSettingsSnapshot(makeSettings())).toBe(
      "poll 30m · max turns 5 · concurrency 1 · auto refresh",
    );
  });

  it("shows manual refresh when polling is manual", () => {
    expect(formatSettingsSnapshot(makeSettings({ pollingMode: "manual" }))).toBe(
      "poll 30m · max turns 5 · concurrency 1 · manual refresh",
    );
  });

  it("uses seconds for sub-minute polls", () => {
    expect(formatSettingsSnapshot(makeSettings({ pollIntervalMs: 5_000 }))).toContain("poll 5s");
  });
});
