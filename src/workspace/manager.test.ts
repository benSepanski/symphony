import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Issue } from "../tracker/types.js";
import { HookError, UnsafeIdentifierError, WorkspaceManager } from "./manager.js";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "i-1",
    identifier: "BEN-1",
    title: "Fix something",
    description: null,
    state: "Todo",
    labels: ["bug"],
    url: "https://example.com/BEN-1",
    ...overrides,
  };
}

describe("WorkspaceManager", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "symphony-ws-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates a directory named after the issue identifier", async () => {
    const m = new WorkspaceManager({ root });
    const ws = await m.create(issue());
    expect(ws.path).toBe(join(root, "BEN-1"));
    expect(existsSync(ws.path)).toBe(true);
  });

  it("runs the after_create hook with the workspace env vars", async () => {
    const m = new WorkspaceManager({
      root,
      hooks: {
        afterCreate: `printenv ISSUE_IDENTIFIER > hook.log
printenv ISSUE_LABELS >> hook.log
pwd >> hook.log`,
      },
    });
    const ws = await m.create(issue({ identifier: "BEN-7", labels: ["a", "b"] }));
    const log = readFileSync(join(ws.path, "hook.log"), "utf8");
    expect(log).toContain("BEN-7");
    expect(log).toContain("a,b");
    expect(log).toContain(ws.path);
  });

  it("runs before_remove then removes the directory", async () => {
    const flag = join(root, "ran.txt");
    const m = new WorkspaceManager({
      root,
      hooks: {
        beforeRemove: `echo removed > ${flag}`,
      },
    });
    const ws = await m.create(issue());
    await m.destroy(issue());
    expect(existsSync(ws.path)).toBe(false);
    expect(readFileSync(flag, "utf8")).toBe("removed\n");
  });

  it("throws HookError on a failing hook", async () => {
    const m = new WorkspaceManager({
      root,
      hooks: { afterCreate: "echo oops >&2; exit 3" },
    });
    await expect(m.create(issue())).rejects.toBeInstanceOf(HookError);
  });

  it("rejects identifiers that would escape the workspace root", async () => {
    const m = new WorkspaceManager({ root });
    await expect(m.create(issue({ identifier: "../evil" }))).rejects.toBeInstanceOf(
      UnsafeIdentifierError,
    );
    await expect(m.create(issue({ identifier: "ok/../nope" }))).rejects.toBeInstanceOf(
      UnsafeIdentifierError,
    );
    await expect(m.create(issue({ identifier: "space bad" }))).rejects.toBeInstanceOf(
      UnsafeIdentifierError,
    );
  });

  it("exposes ISSUE_* env vars without letting them inject shell code", async () => {
    const captured = join(root, "captured.txt");
    const m = new WorkspaceManager({
      root,
      hooks: {
        afterCreate: `printf '%s' "$ISSUE_TITLE" > ${captured}`,
      },
    });
    const evilTitle = "'; echo pwned > ${captured}; echo '";
    await m.create(issue({ title: evilTitle }));
    expect(readFileSync(captured, "utf8")).toBe(evilTitle);
  });

  it("lists existing workspace directories in sorted order", async () => {
    const m = new WorkspaceManager({ root });
    await m.create(issue({ id: "i-2", identifier: "BEN-2" }));
    await m.create(issue({ id: "i-1", identifier: "BEN-1" }));
    expect(m.list().map((w) => w.issueIdentifier)).toEqual(["BEN-1", "BEN-2"]);
  });
});
