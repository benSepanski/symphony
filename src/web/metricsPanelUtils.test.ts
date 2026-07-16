import { describe, expect, it } from "vitest";
import { successPctColorClass } from "./metricsPanelUtils.js";

describe("successPctColorClass", () => {
  it("returns emerald at and above the 90% threshold", () => {
    expect(successPctColorClass(100)).toBe("text-emerald-300");
    expect(successPctColorClass(95)).toBe("text-emerald-300");
    expect(successPctColorClass(90)).toBe("text-emerald-300");
  });

  it("returns amber in the 70-89% band", () => {
    expect(successPctColorClass(89)).toBe("text-amber-300");
    expect(successPctColorClass(80)).toBe("text-amber-300");
    expect(successPctColorClass(70)).toBe("text-amber-300");
  });

  it("returns rose below the 70% threshold", () => {
    expect(successPctColorClass(69)).toBe("text-rose-300");
    expect(successPctColorClass(50)).toBe("text-rose-300");
    expect(successPctColorClass(8)).toBe("text-rose-300");
    expect(successPctColorClass(0)).toBe("text-rose-300");
  });
});
