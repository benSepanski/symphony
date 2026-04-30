import { describe, expect, it } from "vitest";
import { formatRunTs, formatRunTsTitle, formatTimezoneLabel } from "./shared.js";

function localIso(d: Date): string {
  return d.toISOString();
}

describe("formatRunTs", () => {
  const now = new Date(2026, 3, 30, 14, 32, 0);

  it("renders only time-of-day for same calendar day", () => {
    const ts = new Date(2026, 3, 30, 9, 5, 0);
    expect(formatRunTs(localIso(ts), now)).toBe("09:05");
  });

  it("renders future / clock-skewed timestamps as time-of-day", () => {
    const ts = new Date(2026, 3, 30, 14, 33, 0);
    expect(formatRunTs(localIso(ts), now)).toBe("14:33");
  });

  it("prefixes 'Yesterday' for the previous calendar day", () => {
    const ts = new Date(2026, 3, 29, 23, 1, 0);
    expect(formatRunTs(localIso(ts), now)).toBe("Yesterday 23:01");
  });

  it("uses a short weekday for runs 2-6 days back", () => {
    const ts = new Date(2026, 3, 27, 9, 5, 0);
    expect(formatRunTs(localIso(ts), now)).toMatch(/^[A-Za-zÀ-ÿ.]+ 09:05$/);
  });

  it("uses ISO date for runs older than a week", () => {
    const ts = new Date(2026, 3, 12, 18, 22, 0);
    expect(formatRunTs(localIso(ts), now)).toBe("2026-04-12 18:22");
  });

  it("returns the input string when the date is unparseable", () => {
    expect(formatRunTs("not-a-date", now)).toBe("not-a-date");
  });
});

describe("formatRunTsTitle", () => {
  it("returns the canonical ISO timestamp for hover", () => {
    const ts = new Date(Date.UTC(2026, 3, 30, 21, 32, 5));
    expect(formatRunTsTitle(ts.toISOString())).toBe("2026-04-30T21:32:05.000Z");
  });

  it("returns the input when the date is unparseable", () => {
    expect(formatRunTsTitle("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTimezoneLabel", () => {
  it("returns a non-empty label for a real Date", () => {
    const label = formatTimezoneLabel(new Date(2026, 3, 30));
    expect(label.length).toBeGreaterThan(0);
  });
});
