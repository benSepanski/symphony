import { describe, expect, it } from "vitest";
import { formatInterval } from "./shared.js";

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
