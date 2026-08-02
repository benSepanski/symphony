import { describe, expect, it } from "vitest";
import type { ApiEvent } from "./api.js";
import {
  MAX_VISIBLE_ERRORS,
  SUMMARY_EXPAND_THRESHOLD,
  errorFeedHeader,
  errorFeedToggleLabel,
  errorFeedVisibleCount,
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

describe("errorFeedHeader", () => {
  it("returns the plain header when the total fits under the cap", () => {
    expect(errorFeedHeader(0)).toBe("Recent errors");
    expect(errorFeedHeader(1)).toBe("Recent errors");
    expect(errorFeedHeader(MAX_VISIBLE_ERRORS)).toBe("Recent errors");
  });

  it("exposes shown vs. true total once the total exceeds the cap", () => {
    expect(errorFeedHeader(MAX_VISIBLE_ERRORS + 1)).toBe(
      `Recent errors (${MAX_VISIBLE_ERRORS} of ${MAX_VISIBLE_ERRORS + 1})`,
    );
    expect(errorFeedHeader(47)).toBe(`Recent errors (${MAX_VISIBLE_ERRORS} of 47)`);
  });

  it("shows just the true total when the user has expanded the feed", () => {
    expect(errorFeedHeader(47, true)).toBe("Recent errors (47)");
    expect(errorFeedHeader(MAX_VISIBLE_ERRORS + 1, true)).toBe(
      `Recent errors (${MAX_VISIBLE_ERRORS + 1})`,
    );
  });

  it("ignores the showAll flag when the total is already within the cap", () => {
    expect(errorFeedHeader(3, true)).toBe("Recent errors");
    expect(errorFeedHeader(MAX_VISIBLE_ERRORS, true)).toBe("Recent errors");
  });
});

describe("errorFeedVisibleCount", () => {
  it("returns the total unchanged when it fits under the cap", () => {
    expect(errorFeedVisibleCount(0, false)).toBe(0);
    expect(errorFeedVisibleCount(MAX_VISIBLE_ERRORS, false)).toBe(MAX_VISIBLE_ERRORS);
  });

  it("caps at MAX_VISIBLE_ERRORS by default when the total overflows", () => {
    expect(errorFeedVisibleCount(MAX_VISIBLE_ERRORS + 1, false)).toBe(MAX_VISIBLE_ERRORS);
    expect(errorFeedVisibleCount(47, false)).toBe(MAX_VISIBLE_ERRORS);
  });

  it("returns the total when the user has expanded the feed", () => {
    expect(errorFeedVisibleCount(47, true)).toBe(47);
    expect(errorFeedVisibleCount(MAX_VISIBLE_ERRORS + 1, true)).toBe(MAX_VISIBLE_ERRORS + 1);
  });
});

describe("errorFeedToggleLabel", () => {
  it("names the total when collapsed so the button is scannable", () => {
    expect(errorFeedToggleLabel(47, false)).toBe("Show all 47 errors");
    expect(errorFeedToggleLabel(MAX_VISIBLE_ERRORS + 1, false)).toBe(
      `Show all ${MAX_VISIBLE_ERRORS + 1} errors`,
    );
  });

  it("collapses back to a simple label when expanded", () => {
    expect(errorFeedToggleLabel(47, true)).toBe("Show fewer");
  });
});
