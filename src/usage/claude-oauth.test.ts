import { describe, expect, it } from "vitest";
import { ClaudeOAuthUsageChecker, parseUsageResponse } from "./claude-oauth.js";

describe("parseUsageResponse", () => {
  it("maps snake_case fields to the snapshot shape", () => {
    const snap = parseUsageResponse(
      {
        five_hour: { utilization: 0.42, resets_at: "2099-01-01T00:00:00Z" },
        seven_day: { utilization: 0.1, resets_at: "2099-01-07T00:00:00Z" },
      },
      "2026-04-18T12:00:00Z",
    );
    expect(snap).toEqual({
      fetchedAt: "2026-04-18T12:00:00Z",
      fiveHour: { utilization: 0.42, resetsAt: "2099-01-01T00:00:00Z" },
      sevenDay: { utilization: 0.1, resetsAt: "2099-01-07T00:00:00Z" },
    });
  });

  it("returns null for malformed bodies", () => {
    expect(parseUsageResponse(null, "t")).toBeNull();
    expect(parseUsageResponse({ five_hour: { utilization: 0.1 } }, "t")).toBeNull();
    expect(parseUsageResponse({ five_hour: {}, seven_day: {} }, "t")).toBeNull();
  });
});

describe("ClaudeOAuthUsageChecker", () => {
  it("returns null when no token is available", async () => {
    const checker = new ClaudeOAuthUsageChecker({
      readToken: () => null,
    });
    expect(await checker.check()).toBeNull();
  });

  it("returns a snapshot when the endpoint responds with valid JSON", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          five_hour: { utilization: 0.9, resets_at: "2099-01-01T00:00:00Z" },
          seven_day: { utilization: 0.1, resets_at: "2099-01-07T00:00:00Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const checker = new ClaudeOAuthUsageChecker({
      readToken: () => "token",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-04-18T12:00:00Z"),
    });
    const snap = await checker.check();
    expect(snap?.fiveHour.utilization).toBe(0.9);
    expect(snap?.sevenDay.resetsAt).toBe("2099-01-07T00:00:00Z");
    expect(snap?.fetchedAt).toBe("2026-04-18T12:00:00.000Z");
  });

  it("returns null and surfaces errors on non-2xx responses", async () => {
    const errs: Error[] = [];
    const fetchImpl = async () => new Response("nope", { status: 401 });
    const checker = new ClaudeOAuthUsageChecker({
      readToken: () => "token",
      fetchImpl: fetchImpl as typeof fetch,
      onError: (e) => errs.push(e),
    });
    expect(await checker.check()).toBeNull();
    expect(errs[0]?.message).toContain("401");
  });
});
