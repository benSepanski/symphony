import { describe, expect, it } from "vitest";
import { formatInterval, formatRunTimestamp } from "./shared.js";

describe("formatInterval", () => {
  it("renders sub-second intervals as ms", () => {
    expect(formatInterval(500)).toBe("500ms");
  });

  it("renders sub-minute intervals as seconds", () => {
    expect(formatInterval(1000)).toBe("1s");
    expect(formatInterval(45_000)).toBe("45s");
  });

  it("renders longer intervals rounded to minutes", () => {
    expect(formatInterval(60_000)).toBe("1m");
    expect(formatInterval(30 * 60_000)).toBe("30m");
  });
});

describe("formatRunTimestamp", () => {
  // Compare against toLocale* on the same Date so tests survive locale/timezone
  // shifts (CI vs local). We're asserting the shape and the today/earlier
  // branching, not a fixed locale-formatted string.
  function localTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function localDate(d: Date): string {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  it("shows time-only when the run started earlier today", () => {
    const now = new Date(2026, 6, 17, 15, 30, 0);
    const iso = new Date(2026, 6, 17, 3, 14, 0).toISOString();
    expect(formatRunTimestamp(iso, now)).toBe(localTime(new Date(iso)));
  });

  it("shows time-only for a run in the same day but later than now", () => {
    // Same-calendar-day comparison; wall-clock ordering doesn't matter.
    const now = new Date(2026, 6, 17, 6, 0, 0);
    const iso = new Date(2026, 6, 17, 23, 45, 0).toISOString();
    expect(formatRunTimestamp(iso, now)).toBe(localTime(new Date(iso)));
  });

  it("shows date · time when the run started on an earlier calendar day", () => {
    const now = new Date(2026, 6, 17, 12, 0, 0);
    const then = new Date(2026, 6, 14, 15, 14, 0);
    const iso = then.toISOString();
    expect(formatRunTimestamp(iso, now)).toBe(`${localDate(then)} · ${localTime(then)}`);
  });

  it("shows date · time across a year boundary", () => {
    const now = new Date(2026, 0, 2, 9, 0, 0);
    const then = new Date(2025, 11, 31, 23, 59, 0);
    const iso = then.toISOString();
    expect(formatRunTimestamp(iso, now)).toBe(`${localDate(then)} · ${localTime(then)}`);
  });

  it("shows date · time when only the month differs", () => {
    const now = new Date(2026, 6, 1, 0, 10, 0);
    const then = new Date(2026, 5, 30, 23, 50, 0);
    const iso = then.toISOString();
    expect(formatRunTimestamp(iso, now)).toBe(`${localDate(then)} · ${localTime(then)}`);
  });
});
