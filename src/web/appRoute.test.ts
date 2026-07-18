import { describe, expect, it } from "vitest";
import { parseHash } from "./appRoute.js";

describe("parseHash", () => {
  it("maps an empty hash to the dashboard", () => {
    expect(parseHash("")).toEqual({ view: "dashboard" });
  });

  it("maps #/ to the dashboard", () => {
    expect(parseHash("#/")).toEqual({ view: "dashboard" });
  });

  it("maps #/runs/<id> to the run view", () => {
    expect(parseHash("#/runs/deb3bc1b-1234")).toEqual({
      view: "run",
      runId: "deb3bc1b-1234",
      fragment: null,
    });
  });

  it("extracts a sub-fragment from #/runs/<id>#turn-N", () => {
    expect(parseHash("#/runs/deb3bc1b-1234#turn-7")).toEqual({
      view: "run",
      runId: "deb3bc1b-1234",
      fragment: "turn-7",
    });
  });

  it("extracts a sub-fragment from #/runs/<id>#event-N", () => {
    expect(parseHash("#/runs/deb3bc1b-1234#event-42")).toEqual({
      view: "run",
      runId: "deb3bc1b-1234",
      fragment: "event-42",
    });
  });

  it("treats an empty sub-fragment (#/runs/<id>#) as no fragment", () => {
    expect(parseHash("#/runs/deb3bc1b-1234#")).toEqual({
      view: "run",
      runId: "deb3bc1b-1234",
      fragment: null,
    });
  });

  it("maps #/search to the search view with an empty query", () => {
    expect(parseHash("#/search")).toEqual({ view: "search", query: "" });
  });

  it("extracts the ?q= parameter from #/search?q=…", () => {
    expect(parseHash("#/search?q=hello%20world")).toEqual({
      view: "search",
      query: "hello world",
    });
  });

  it("routes an unknown top-level hash to notFound with the offending hash", () => {
    expect(parseHash("#/nope")).toEqual({ view: "notFound", hash: "#/nope" });
  });

  it("routes bare #/runs (no id) to notFound instead of an empty-id run", () => {
    expect(parseHash("#/runs")).toEqual({ view: "notFound", hash: "#/runs" });
  });

  it("routes #/runs/ (trailing slash, no id) to notFound", () => {
    expect(parseHash("#/runs/")).toEqual({ view: "notFound", hash: "#/runs/" });
  });

  it("routes #/searchx (near-miss of search) to notFound", () => {
    expect(parseHash("#/searchx")).toEqual({
      view: "notFound",
      hash: "#/searchx",
    });
  });

  it("routes deep unknown paths to notFound and preserves the hash", () => {
    expect(parseHash("#/foo/bar")).toEqual({
      view: "notFound",
      hash: "#/foo/bar",
    });
  });
});
