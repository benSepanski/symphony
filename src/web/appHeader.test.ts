import { describe, expect, it } from "vitest";
import { documentTitleForRoute, runHeaderLabel } from "./appHeader.js";

describe("runHeaderLabel", () => {
  it("returns the issue identifier when the header matches the current run", () => {
    expect(
      runHeaderLabel("deb3bc1b-1234-4111-8abc-000000000001", {
        runId: "deb3bc1b-1234-4111-8abc-000000000001",
        issueIdentifier: "DEMO-1",
      }),
    ).toEqual({ kind: "identifier", identifier: "DEMO-1" });
  });

  it("falls back to the 8-char slice when no header is loaded yet", () => {
    expect(runHeaderLabel("deb3bc1b-1234-4111-8abc-000000000001", null)).toEqual({
      kind: "fallback",
      slice: "deb3bc1b",
    });
  });

  it("falls back to the slice when the header is stale from a previous run", () => {
    expect(
      runHeaderLabel("deb3bc1b-1234-4111-8abc-000000000001", {
        runId: "aaaaaaaa-1234-4111-8abc-000000000002",
        issueIdentifier: "DEMO-2",
      }),
    ).toEqual({ kind: "fallback", slice: "deb3bc1b" });
  });

  it("returns a slice shorter than 8 chars when the runId itself is shorter", () => {
    expect(runHeaderLabel("abc", null)).toEqual({ kind: "fallback", slice: "abc" });
  });
});

describe("documentTitleForRoute", () => {
  it("returns 'Symphony · <identifier>' when on a run route with a matching header", () => {
    expect(
      documentTitleForRoute(
        { view: "run", runId: "deb3bc1b-1234-4111-8abc-000000000001", fragment: null },
        {
          runId: "deb3bc1b-1234-4111-8abc-000000000001",
          issueIdentifier: "DEMO-1",
        },
      ),
    ).toBe("Symphony · DEMO-1");
  });

  it("returns 'Symphony' on the run route before the header resolves", () => {
    expect(
      documentTitleForRoute(
        { view: "run", runId: "deb3bc1b-1234-4111-8abc-000000000001", fragment: null },
        null,
      ),
    ).toBe("Symphony");
  });

  it("returns 'Symphony' when the loaded header is for a different run", () => {
    expect(
      documentTitleForRoute(
        { view: "run", runId: "deb3bc1b-1234-4111-8abc-000000000001", fragment: null },
        {
          runId: "aaaaaaaa-1234-4111-8abc-000000000002",
          issueIdentifier: "DEMO-2",
        },
      ),
    ).toBe("Symphony");
  });

  it("returns 'Symphony' on the dashboard route regardless of any stale header", () => {
    expect(
      documentTitleForRoute(
        { view: "dashboard" },
        {
          runId: "deb3bc1b-1234-4111-8abc-000000000001",
          issueIdentifier: "DEMO-1",
        },
      ),
    ).toBe("Symphony");
  });

  it("returns 'Symphony' on the search route regardless of any stale header", () => {
    expect(
      documentTitleForRoute(
        { view: "search", query: "hello" },
        {
          runId: "deb3bc1b-1234-4111-8abc-000000000001",
          issueIdentifier: "DEMO-1",
        },
      ),
    ).toBe("Symphony");
  });
});
