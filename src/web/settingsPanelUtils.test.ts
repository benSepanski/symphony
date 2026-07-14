import { describe, expect, it } from "vitest";
import type { ApiOrchestratorSettings } from "./api.js";
import {
  formatSettingsSnapshot,
  settingsPanelInitialOpen,
  validateDraft,
  type SettingsDraft,
} from "./settingsPanelUtils.js";

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

describe("validateDraft", () => {
  function makeDraft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
    return {
      pollIntervalMs: "60000",
      maxConcurrentAgents: "1",
      maxTurns: "5",
      maxTurnsState: "Blocked",
      ...overrides,
    };
  }

  it("accepts a valid draft and returns coerced numeric values with trimmed maxTurnsState", () => {
    const result = validateDraft(makeDraft({ maxTurnsState: "  Blocked  " }));
    expect(result).toEqual({
      ok: true,
      values: {
        pollIntervalMs: 60000,
        maxConcurrentAgents: 1,
        maxTurns: 5,
        maxTurnsState: "Blocked",
      },
    });
  });

  it("floors a fractional poll interval", () => {
    const result = validateDraft(makeDraft({ pollIntervalMs: "1000.9" }));
    expect(result).toEqual({
      ok: true,
      values: {
        pollIntervalMs: 1000,
        maxConcurrentAgents: 1,
        maxTurns: 5,
        maxTurnsState: "Blocked",
      },
    });
  });

  it("rejects a poll interval below 1000 ms with the pollIntervalMs field tag", () => {
    expect(validateDraft(makeDraft({ pollIntervalMs: "500" }))).toEqual({
      ok: false,
      field: "pollIntervalMs",
      message: "poll interval must be ≥ 1000 ms",
    });
  });

  it("rejects a non-numeric poll interval", () => {
    expect(validateDraft(makeDraft({ pollIntervalMs: "abc" }))).toEqual({
      ok: false,
      field: "pollIntervalMs",
      message: "poll interval must be ≥ 1000 ms",
    });
  });

  it("rejects an empty poll interval (Number('') is 0)", () => {
    expect(validateDraft(makeDraft({ pollIntervalMs: "" }))).toEqual({
      ok: false,
      field: "pollIntervalMs",
      message: "poll interval must be ≥ 1000 ms",
    });
  });

  it("rejects non-integer concurrency with the maxConcurrentAgents field tag", () => {
    expect(validateDraft(makeDraft({ maxConcurrentAgents: "1.5" }))).toEqual({
      ok: false,
      field: "maxConcurrentAgents",
      message: "max concurrent agents must be ≥ 1",
    });
  });

  it("rejects concurrency below 1", () => {
    expect(validateDraft(makeDraft({ maxConcurrentAgents: "0" }))).toEqual({
      ok: false,
      field: "maxConcurrentAgents",
      message: "max concurrent agents must be ≥ 1",
    });
  });

  it("rejects non-integer maxTurns with the maxTurns field tag", () => {
    expect(validateDraft(makeDraft({ maxTurns: "3.5" }))).toEqual({
      ok: false,
      field: "maxTurns",
      message: "max turns must be ≥ 1",
    });
  });

  it("rejects maxTurns below 1", () => {
    expect(validateDraft(makeDraft({ maxTurns: "0" }))).toEqual({
      ok: false,
      field: "maxTurns",
      message: "max turns must be ≥ 1",
    });
  });

  it("rejects an empty maxTurnsState with the maxTurnsState field tag", () => {
    expect(validateDraft(makeDraft({ maxTurnsState: "" }))).toEqual({
      ok: false,
      field: "maxTurnsState",
      message: "max turns state must not be empty",
    });
  });

  it("rejects a whitespace-only maxTurnsState", () => {
    expect(validateDraft(makeDraft({ maxTurnsState: "   " }))).toEqual({
      ok: false,
      field: "maxTurnsState",
      message: "max turns state must not be empty",
    });
  });

  it("reports the first failing field when multiple are invalid (poll interval wins)", () => {
    expect(
      validateDraft({
        pollIntervalMs: "500",
        maxConcurrentAgents: "0",
        maxTurns: "0",
        maxTurnsState: "",
      }),
    ).toEqual({
      ok: false,
      field: "pollIntervalMs",
      message: "poll interval must be ≥ 1000 ms",
    });
  });
});
