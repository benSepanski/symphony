import { describe, expect, it } from "vitest";
import { WorkflowParseError, parseWorkflowString } from "./workflow.js";

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
