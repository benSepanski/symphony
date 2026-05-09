import { describe, expect, it } from "vitest";
import type { ApiEvent } from "./api.js";
import {
  SUMMARY_EXPAND_THRESHOLD,
  fullPayload,
  shouldExpand,
  summarize,
} from "./errorFeedUtils.js";

function ev(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: 1,
    runId: "r",
    turnId: null,
    eventType: "error",
    issueId: null,
    payload: null,
    ts: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarize", () => {
  it("returns empty string when payload is missing", () => {
    expect(summarize(ev({ payload: null }))).toBe("");
  });

  it("returns the raw payload when JSON parse fails", () => {
    const raw = "not json " + "x".repeat(500);
    expect(summarize(ev({ payload: raw }))).toBe(raw);
  });

  it("returns the unbounded message field for object payloads", () => {
    const long = "boom ".repeat(200);
    const payload = JSON.stringify({ message: long, stack: "irrelevant" });
    expect(summarize(ev({ payload }))).toBe(long);
  });

  it("formats fiveHour rate-limit windows", () => {
    const payload = JSON.stringify({ window: "fiveHour" });
    expect(summarize(ev({ payload }))).toBe("5-hour window");
  });

  it("formats sevenDay rate-limit windows with reset time", () => {
    const payload = JSON.stringify({ window: "sevenDay", resetsAt: "2026-05-03T00:00:00.000Z" });
    const out = summarize(ev({ payload }));
    expect(out.startsWith("7-day window · resets ")).toBe(true);
  });

  it("falls back to unbounded JSON.stringify for object payloads without known fields", () => {
    const obj = { foo: "x".repeat(500) };
    expect(summarize(ev({ payload: JSON.stringify(obj) }))).toBe(JSON.stringify(obj));
  });
});

describe("fullPayload", () => {
  it("returns empty string when payload is missing", () => {
    expect(fullPayload(ev({ payload: null }))).toBe("");
  });

  it("returns the raw payload when JSON parse fails", () => {
    expect(fullPayload(ev({ payload: "broken{" }))).toBe("broken{");
  });

  it("pretty-prints JSON object payloads with 2-space indent", () => {
    const obj = { message: "boom", stack: "Error: boom" };
    expect(fullPayload(ev({ payload: JSON.stringify(obj) }))).toBe(JSON.stringify(obj, null, 2));
  });
});

describe("shouldExpand", () => {
  it("is false when summary fits under the threshold", () => {
    expect(shouldExpand("short message")).toBe(false);
  });

  it("is true when summary exceeds the threshold", () => {
    expect(shouldExpand("x".repeat(SUMMARY_EXPAND_THRESHOLD + 1))).toBe(true);
  });

  it("is false at exactly the threshold", () => {
    expect(shouldExpand("x".repeat(SUMMARY_EXPAND_THRESHOLD))).toBe(false);
  });
});
