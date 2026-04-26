import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkflowParseError, parseWorkflow, parseWorkflowString } from "./workflow.js";

const VALID_FRONT_MATTER = `---
tracker:
  kind: linear
  project_slug: "symphony"
  active_states: [Todo, In Progress]
  terminal_states: [Done, Cancelled]
polling:
  interval_ms: 1800000
workspace:
  root: /tmp/worktrees
agent:
  kind: mock
  max_concurrent_agents: 2
  max_turns: 5
---

Hello {{ issue.identifier }}
`;

describe("parseWorkflowString", () => {
  it("parses the front matter and returns the template body", () => {
    const result = parseWorkflowString(VALID_FRONT_MATTER);
    expect(result.config.tracker.kind).toBe("linear");
    expect(result.config.agent.kind).toBe("mock");
    expect(result.config.agent.max_concurrent_agents).toBe(2);
    expect(result.promptTemplate).toBe("Hello {{ issue.identifier }}\n");
  });

  it("applies defaults for optional fields", () => {
    const minimal = `---
tracker:
  kind: memory
  project_slug: "test"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
---

body
`;
    const { config } = parseWorkflowString(minimal);
    expect(config.agent.max_concurrent_agents).toBe(1);
    expect(config.agent.max_turns).toBe(10);
    expect(config.agent.max_turns_state).toBe("Blocked");
  });

  it("rejects content without front matter delimiters", () => {
    expect(() => parseWorkflowString("no front matter here")).toThrowError(WorkflowParseError);
  });

  it("rejects malformed YAML", () => {
    const bad = `---
tracker: [this is not: valid
---

body
`;
    expect(() => parseWorkflowString(bad)).toThrowError(/Invalid YAML/);
  });

  it("marks an inline template as promptVersion=inline", () => {
    const result = parseWorkflowString(VALID_FRONT_MATTER);
    expect(result.promptVersion).toBe("inline");
    expect(result.promptSource).toBe("inline");
  });

  it("rejects schema violations with a readable message", () => {
    const missingAgent = `---
tracker:
  kind: linear
  project_slug: "s"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
---

body
`;
    expect(() => parseWorkflowString(missingAgent)).toThrowError(/failed validation/);
  });
});

describe("parseWorkflowString with prompt: reference", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "symphony-prompt-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads an external prompt file with its own version header", () => {
    const promptPath = join(dir, "my-prompt.md");
    writeFileSync(promptPath, `---\nversion: v7\n---\n\nHello {{ issue.identifier }}\n`);
    const source = `---
tracker:
  kind: memory
  project_slug: "t"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
prompt: my-prompt.md
---
`;
    const result = parseWorkflowString(source, { baseDir: dir });
    expect(result.promptTemplate).toBe("Hello {{ issue.identifier }}\n");
    expect(result.promptVersion).toBe("v7");
    expect(result.promptSource).toBe("my-prompt.md");
  });

  it("reports unversioned when the prompt file has no front matter", () => {
    const promptPath = join(dir, "raw.md");
    writeFileSync(promptPath, "Hi");
    const source = `---
tracker:
  kind: memory
  project_slug: "t"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
prompt: raw.md
---
`;
    const result = parseWorkflowString(source, { baseDir: dir });
    expect(result.promptTemplate).toBe("Hi");
    expect(result.promptVersion).toBe("unversioned");
  });

  it("wraps a missing prompt file in WorkflowParseError", () => {
    const source = `---
tracker:
  kind: memory
  project_slug: "t"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
prompt: does-not-exist.md
---
`;
    expect(() => parseWorkflowString(source, { baseDir: dir })).toThrow(WorkflowParseError);
  });

  it("accepts a self_update block with defaults", () => {
    const src = `---
tracker:
  kind: memory
  project_slug: "test"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
self_update:
  enabled: true
---

body
`;
    const { config } = parseWorkflowString(src);
    expect(config.self_update).toEqual({
      enabled: true,
      branch: "main",
      min_interval_ms: 600_000,
    });
  });

  it("loads prompts/harness-v2.md from the project's WORKFLOW.md", async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const result = parseWorkflow(join(repoRoot, "WORKFLOW.md"));
    expect(result.promptVersion).toBe("harness-v2");
    expect(result.promptSource).toBe("prompts/harness-v2.md");

    const liquid = new Liquid();
    const rendered = await liquid.parseAndRender(result.promptTemplate, {
      issue: {
        identifier: "BEN-99",
        title: "Demo issue",
        state: "Todo",
        labels: [],
        url: "https://linear.app/x/BEN-99",
        description: "Add a button.",
      },
      attempt: 1,
    });
    // Spec-check guidance must reach the model on every render — under-spec
    // detection is the entire point of harness-v2 (see design-docs/spec-check.md).
    expect(rendered).toContain("Spec check");
    expect(rendered).toContain("Transition the ticket to `Blocked`");
  });

  it("accepts a self_update block with explicit overrides", () => {
    const src = `---
tracker:
  kind: memory
  project_slug: "test"
  active_states: [Todo]
  terminal_states: [Done]
polling:
  interval_ms: 1000
workspace:
  root: /tmp
agent:
  kind: mock
self_update:
  enabled: true
  repo_path: ~/code/symphony
  branch: develop
  min_interval_ms: 60000
---

body
`;
    const { config } = parseWorkflowString(src);
    expect(config.self_update).toEqual({
      enabled: true,
      repo_path: "~/code/symphony",
      branch: "develop",
      min_interval_ms: 60_000,
    });
  });
});
