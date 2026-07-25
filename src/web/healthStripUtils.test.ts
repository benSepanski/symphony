import { describe, expect, it } from "vitest";
import { pollStatusPill } from "./healthStripUtils.js";

describe("pollStatusPill", () => {
  it("returns null when auto polling is healthy", () => {
    expect(pollStatusPill({ pollingMode: "auto", polling: true })).toBeNull();
  });

  it("labels manual mode in amber", () => {
    expect(pollStatusPill({ pollingMode: "manual", polling: false })).toEqual({
      label: "manual",
      className: "text-amber-300",
    });
  });

  it("keeps the manual label even when the auto timer would otherwise be live", () => {
    // Manual is a user choice; polling=true here is nonsensical for manual
    // in practice but the pill should still surface the mode.
    expect(pollStatusPill({ pollingMode: "manual", polling: true })).toEqual({
      label: "manual",
      className: "text-amber-300",
    });
  });

  it("surfaces auto + !polling as 'shutting down' with an explanatory title", () => {
    const pill = pollStatusPill({ pollingMode: "auto", polling: false });
    expect(pill).not.toBeNull();
    expect(pill?.label).toBe("shutting down");
    expect(pill?.className).toBe("text-amber-300");
    expect(pill?.title).toMatch(/stopping/i);
  });

  it("does not use rose (error) colors for the shutting-down state", () => {
    // Regression: BEN-138 flagged that rose implied an error state; the
    // orchestrator winding down cleanly is not an error.
    const pill = pollStatusPill({ pollingMode: "auto", polling: false });
    expect(pill?.className).not.toMatch(/rose/);
  });
});
