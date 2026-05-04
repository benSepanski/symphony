import { describe, expect, it } from "vitest";
import type { ApiRun } from "./api.js";
import {
  APP_NAME,
  buildFaviconHref,
  countRunning,
  dashboardFaviconColor,
  dashboardTitle,
  findMostRecentFailure,
  isRecentFailure,
  runDetailTitle,
  runFaviconColor,
  RECENT_FAILURE_WINDOW_MS,
} from "./documentTitle.js";

const NOW = Date.parse("2026-05-04T12:00:00.000Z");

function makeRun(overrides: Partial<ApiRun> = {}): ApiRun {
  return {
    id: "run-1",
    issueId: "issue-1",
    issueIdentifier: "BEN-99",
    issueTitle: null,
    status: "running",
    startedAt: new Date(NOW - 60_000).toISOString(),
    finishedAt: null,
    scenario: null,
    turnCount: 0,
    tokensInput: null,
    tokensOutput: null,
    tokensCacheRead: null,
    tokensCacheCreation: null,
    totalCostUsd: null,
    authStatus: null,
    startFiveHourUtil: null,
    startSevenDayUtil: null,
    ...overrides,
  };
}

describe("dashboardTitle", () => {
  it("falls back to the app name when nothing notable is happening", () => {
    expect(dashboardTitle([], NOW)).toBe(APP_NAME);
    expect(
      dashboardTitle(
        [makeRun({ status: "completed", finishedAt: new Date(NOW).toISOString() })],
        NOW,
      ),
    ).toBe(APP_NAME);
  });

  it("shows the running count when at least one run is in flight", () => {
    const runs = [
      makeRun({ id: "a", status: "running" }),
      makeRun({ id: "b", status: "running" }),
      makeRun({
        id: "c",
        status: "completed",
        finishedAt: new Date(NOW - 10 * 60_000).toISOString(),
      }),
    ];
    expect(dashboardTitle(runs, NOW)).toBe(`● 2 running · ${APP_NAME}`);
  });

  it("escalates to the most recent failure within the window", () => {
    const runs = [
      makeRun({ id: "a", status: "running" }),
      makeRun({
        id: "b",
        issueIdentifier: "BEN-30",
        status: "failed",
        finishedAt: new Date(NOW - 60_000).toISOString(),
      }),
      makeRun({
        id: "c",
        issueIdentifier: "BEN-31",
        status: "rate_limited",
        finishedAt: new Date(NOW - 30_000).toISOString(),
      }),
    ];
    expect(dashboardTitle(runs, NOW)).toBe(`✖ BEN-31 rate_limited · ${APP_NAME}`);
  });

  it("ignores stale failures past the window", () => {
    const runs = [
      makeRun({
        id: "b",
        issueIdentifier: "BEN-30",
        status: "failed",
        finishedAt: new Date(NOW - RECENT_FAILURE_WINDOW_MS - 1_000).toISOString(),
      }),
    ];
    expect(dashboardTitle(runs, NOW)).toBe(APP_NAME);
  });

  it("ignores failures with no finishedAt", () => {
    const runs = [
      makeRun({
        id: "b",
        issueIdentifier: "BEN-30",
        status: "failed",
        finishedAt: null,
      }),
    ];
    expect(dashboardTitle(runs, NOW)).toBe(APP_NAME);
  });
});

describe("runDetailTitle", () => {
  it("reads issue id · status · app", () => {
    expect(runDetailTitle({ issueIdentifier: "BEN-30", status: "running" })).toBe(
      `BEN-30 · running · ${APP_NAME}`,
    );
  });

  it("does not coerce identifiers", () => {
    expect(runDetailTitle({ issueIdentifier: "ABC-1", status: "completed" })).toBe(
      `ABC-1 · completed · ${APP_NAME}`,
    );
  });
});

describe("favicon color helpers", () => {
  it("dashboardFaviconColor flips to fail on a recent failure", () => {
    const recent = [
      makeRun({
        status: "failed",
        finishedAt: new Date(NOW - 60_000).toISOString(),
      }),
    ];
    expect(dashboardFaviconColor(recent, NOW)).toBe("fail");
    expect(dashboardFaviconColor([], NOW)).toBe("neutral");
  });

  it("runFaviconColor reflects the current run status", () => {
    expect(runFaviconColor({ status: "running" })).toBe("neutral");
    expect(runFaviconColor({ status: "failed" })).toBe("fail");
    expect(runFaviconColor({ status: "rate_limited" })).toBe("fail");
    expect(runFaviconColor({ status: "completed" })).toBe("neutral");
  });
});

describe("buildFaviconHref", () => {
  it("encodes a self-contained svg data URL", () => {
    const href = buildFaviconHref("neutral");
    expect(href.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    const decoded = decodeURIComponent(href.slice("data:image/svg+xml;utf8,".length));
    expect(decoded).toMatch(/<svg /);
    expect(decoded).toContain("#cbd5f5");
  });

  it("uses a distinct color for the fail state", () => {
    const decoded = decodeURIComponent(
      buildFaviconHref("fail").slice("data:image/svg+xml;utf8,".length),
    );
    expect(decoded).toContain("#fb7185");
  });
});

describe("low-level helpers", () => {
  it("countRunning ignores non-running statuses", () => {
    expect(
      countRunning([
        makeRun({ status: "running" }),
        makeRun({ status: "failed" }),
        makeRun({ status: "completed" }),
        makeRun({ status: "running" }),
      ]),
    ).toBe(2);
  });

  it("findMostRecentFailure picks the latest failure within the window", () => {
    const oldest = makeRun({
      id: "a",
      issueIdentifier: "BEN-1",
      status: "failed",
      finishedAt: new Date(NOW - 4 * 60_000).toISOString(),
    });
    const newest = makeRun({
      id: "b",
      issueIdentifier: "BEN-2",
      status: "rate_limited",
      finishedAt: new Date(NOW - 30_000).toISOString(),
    });
    expect(findMostRecentFailure([oldest, newest], NOW)?.issueIdentifier).toBe("BEN-2");
    expect(findMostRecentFailure([oldest, newest], NOW + RECENT_FAILURE_WINDOW_MS)).toBeNull();
  });

  it("isRecentFailure rejects future-dated finishedAt (clock skew)", () => {
    const future = makeRun({
      status: "failed",
      finishedAt: new Date(NOW + 60_000).toISOString(),
    });
    expect(isRecentFailure(future, NOW)).toBe(false);
  });
});
