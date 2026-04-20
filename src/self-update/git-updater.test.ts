import { describe, expect, it } from "vitest";
import { GitSelfUpdater, type ExecFn } from "./git-updater.js";

interface Call {
  args: readonly string[];
}

function fakeExec(responses: Array<{ stdout?: string; stderr?: string; throws?: Error }>) {
  const calls: Call[] = [];
  let i = 0;
  const exec: ExecFn = async (_file, args) => {
    calls.push({ args });
    const next = responses[i++];
    if (!next) throw new Error(`unexpected exec call #${i}: ${args.join(" ")}`);
    if (next.throws) throw next.throws;
    return { stdout: next.stdout ?? "", stderr: next.stderr ?? "" };
  };
  return { exec, calls };
}

describe("GitSelfUpdater", () => {
  it("rev-parses before, fetches, and rev-parses after", async () => {
    const { exec, calls } = fakeExec([
      { stdout: "abc123\n" },
      { stdout: "" },
      { stdout: "def456\n" },
    ]);
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 1_000,
      exec,
      now: () => 1_000,
    });
    const result = await updater.maybeFetch();
    expect(calls).toHaveLength(3);
    expect(calls[0].args).toEqual(["rev-parse", "origin/main"]);
    expect(calls[1].args).toEqual(["fetch", "origin", "main"]);
    expect(calls[2].args).toEqual(["rev-parse", "origin/main"]);
    expect(result).toMatchObject({
      repoPath: "/repo",
      branch: "main",
      headBefore: "abc123",
      headAfter: "def456",
      changed: true,
    });
  });

  it("reports changed=false when remote pointer is unchanged", async () => {
    const { exec } = fakeExec([{ stdout: "abc\n" }, {}, { stdout: "abc\n" }]);
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 1_000,
      exec,
      now: () => 0,
    });
    const result = await updater.maybeFetch();
    expect(result?.changed).toBe(false);
  });

  it("throttles subsequent calls under the min interval", async () => {
    const { exec, calls } = fakeExec([{ stdout: "a\n" }, {}, { stdout: "a\n" }]);
    let time = 1_000;
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 10_000,
      exec,
      now: () => time,
    });
    const first = await updater.maybeFetch();
    expect(first).not.toBeNull();
    time = 5_000;
    const second = await updater.maybeFetch();
    expect(second).toBeNull();
    expect(calls).toHaveLength(3);
  });

  it("fetches again once the throttle window elapses", async () => {
    const { exec, calls } = fakeExec([
      { stdout: "a\n" },
      {},
      { stdout: "a\n" },
      { stdout: "a\n" },
      {},
      { stdout: "b\n" },
    ]);
    let time = 1_000;
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 10_000,
      exec,
      now: () => time,
    });
    await updater.maybeFetch();
    time = 20_000;
    const second = await updater.maybeFetch();
    expect(second?.headAfter).toBe("b");
    expect(calls).toHaveLength(6);
  });

  it("treats an unknown remote ref as empty headBefore", async () => {
    const { exec } = fakeExec([
      { throws: new Error("fatal: unknown revision") },
      {},
      { stdout: "abc\n" },
    ]);
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 1_000,
      exec,
      now: () => 1,
    });
    const result = await updater.maybeFetch();
    expect(result).toMatchObject({ headBefore: "", headAfter: "abc", changed: true });
  });

  it("propagates a fetch failure to the caller", async () => {
    const { exec } = fakeExec([{ stdout: "abc\n" }, { throws: new Error("network down") }]);
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 1_000,
      exec,
      now: () => 0,
    });
    await expect(updater.maybeFetch()).rejects.toThrow("network down");
  });

  it("deduplicates concurrent callers into one fetch", async () => {
    const { exec, calls } = fakeExec([{ stdout: "a\n" }, {}, { stdout: "a\n" }]);
    const updater = new GitSelfUpdater({
      repoPath: "/repo",
      branch: "main",
      minIntervalMs: 10_000,
      exec,
      now: () => 1,
    });
    const [a, b] = await Promise.all([updater.maybeFetch(), updater.maybeFetch()]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(3);
  });
});
