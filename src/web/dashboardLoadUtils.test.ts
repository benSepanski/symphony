import { describe, expect, it } from "vitest";
import { collectDashboardFailures } from "./dashboardLoadUtils.js";

function fulfilled<T>(value: T): PromiseSettledResult<T> {
  return { status: "fulfilled", value };
}

function rejected(reason: unknown): PromiseSettledResult<never> {
  return { status: "rejected", reason };
}

describe("collectDashboardFailures", () => {
  it("returns an empty list when every fetch fulfilled", () => {
    expect(
      collectDashboardFailures([
        { url: "/api/runs", result: fulfilled([]) },
        { url: "/api/health", result: fulfilled({}) },
      ]),
    ).toEqual([]);
  });

  it("captures rejected entries with their url and Error.message", () => {
    expect(
      collectDashboardFailures([
        { url: "/api/runs", result: rejected(new Error("network down")) },
        { url: "/api/health", result: fulfilled({}) },
      ]),
    ).toEqual([{ url: "/api/runs", message: "network down" }]);
  });

  it("stringifies non-Error rejection reasons", () => {
    expect(
      collectDashboardFailures([
        { url: "/api/health", result: rejected("boom") },
        { url: "/api/settings", result: rejected(42) },
      ]),
    ).toEqual([
      { url: "/api/health", message: "boom" },
      { url: "/api/settings", message: "42" },
    ]);
  });

  it("preserves entry order when multiple fetches fail", () => {
    const failures = collectDashboardFailures([
      { url: "/api/runs", result: rejected(new Error("a")) },
      { url: "/api/health", result: fulfilled({}) },
      { url: "/api/events/recent", result: rejected(new Error("b")) },
      { url: "/api/settings", result: rejected(new Error("c")) },
    ]);
    expect(failures.map((f) => f.url)).toEqual([
      "/api/runs",
      "/api/events/recent",
      "/api/settings",
    ]);
    expect(failures.map((f) => f.message)).toEqual(["a", "b", "c"]);
  });
});
