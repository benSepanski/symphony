import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecentEvents, fetchRuns, patchSettings, requestManualTick } from "./api.js";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(responder: (input: RequestInfo | URL, init?: RequestInit) => Response) {
  const fn: FetchMock = vi.fn(async (input, init) => responder(input as RequestInfo | URL, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson (via fetchRuns)", () => {
  it("returns parsed JSON on 200", async () => {
    const fn = stubFetch(() => new Response(JSON.stringify([{ id: "r1" }]), { status: 200 }));
    const runs = await fetchRuns();
    expect(runs).toEqual([{ id: "r1" }]);
    expect(fn).toHaveBeenCalledWith("/api/runs", undefined);
  });

  it("throws `<url> returned <status>` on non-2xx for a GET", async () => {
    stubFetch(() => new Response("nope", { status: 503 }));
    await expect(fetchRuns()).rejects.toThrow("/api/runs returned 503");
  });

  it("uses the method-tagged label when init.method is set", async () => {
    // Drive `fetchRecentEvents` to exercise the URLSearchParams branch + the
    // shared error label codepath; the default GET label keeps the bare URL.
    stubFetch(() => new Response("nope", { status: 500 }));
    await expect(fetchRecentEvents(["error"], 10)).rejects.toThrow(
      "/api/events/recent?types=error&limit=10 returned 500",
    );
  });
});

describe("fetchRecentEvents URL building", () => {
  it("omits the types param when none are passed and defaults limit to 50", async () => {
    const fn = stubFetch(() => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    await fetchRecentEvents();
    expect(fn).toHaveBeenCalledWith("/api/events/recent?limit=50", undefined);
  });

  it("joins types with commas and forwards the limit", async () => {
    const fn = stubFetch(() => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    await fetchRecentEvents(["error", "rate_limited"], 7);
    expect(fn).toHaveBeenCalledWith(
      "/api/events/recent?types=error%2Crate_limited&limit=7",
      undefined,
    );
  });
});

describe("patchSettings", () => {
  it("returns settings on success", async () => {
    const settings = {
      pollIntervalMs: 1000,
      maxConcurrentAgents: 2,
      maxTurns: 5,
      maxTurnsState: "Blocked",
      pollingMode: "auto" as const,
    };
    stubFetch(() => new Response(JSON.stringify({ settings }), { status: 200 }));
    await expect(patchSettings({ pollIntervalMs: 1000 })).resolves.toEqual(settings);
  });

  it("surfaces the server's error message verbatim on non-2xx", async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: "manual tick disabled" }), {
          status: 400,
        }),
    );
    await expect(patchSettings({ pollIntervalMs: 1 })).rejects.toThrow("manual tick disabled");
  });

  it("falls back to the method-tagged label when the body has no error field", async () => {
    stubFetch(() => new Response(JSON.stringify({}), { status: 500 }));
    await expect(patchSettings({})).rejects.toThrow("PATCH /api/settings returned 500");
  });
});

describe("requestManualTick", () => {
  it("resolves on 200", async () => {
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(requestManualTick()).resolves.toBeUndefined();
  });

  it("throws the server's error on non-2xx", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "tick not available" }), { status: 400 }));
    await expect(requestManualTick()).rejects.toThrow("tick not available");
  });

  it("falls back to the method-tagged label on a non-JSON failure body", async () => {
    stubFetch(() => new Response("not json", { status: 502 }));
    await expect(requestManualTick()).rejects.toThrow("POST /api/orchestrator/tick returned 502");
  });
});
