import { describe, expect, it, vi } from "vitest";
import { writeToClipboard } from "./copyButtonUtils.js";

describe("writeToClipboard", () => {
  it("returns true and forwards the value to the writer", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);
    const ok = await writeToClipboard("BEN-41", writer);
    expect(ok).toBe(true);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith("BEN-41");
  });

  it("returns false when no writer is available (clipboard API absent)", async () => {
    const ok = await writeToClipboard("BEN-41", undefined);
    expect(ok).toBe(false);
  });

  it("returns false when the writer rejects (permission denied / insecure context)", async () => {
    const writer = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const ok = await writeToClipboard("BEN-41", writer);
    expect(ok).toBe(false);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith("BEN-41");
  });
});
