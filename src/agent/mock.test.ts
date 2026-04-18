import { describe, expect, it, vi } from "vitest";
import {
  MockAgent,
  ScenarioLoadError,
  loadScenarioFile,
  loadScenariosDir,
  parseScenario,
  type Scenario,
  type Sleeper,
} from "./mock.js";

const TWO_STEP: Scenario = {
  name: "inline",
  labels: [],
  steps: [
    { role: "assistant", content: "hi", delay_ms: 0 },
    { role: "assistant", content: "done", delay_ms: 0, final_state: "Done" },
  ],
};

describe("parseScenario", () => {
  it("parses a well-formed scenario", () => {
    const s = parseScenario(`name: test\nsteps:\n  - role: assistant\n    content: hi\n`);
    expect(s.name).toBe("test");
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].delay_ms).toBe(0);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseScenario("this: [unclosed")).toThrow(ScenarioLoadError);
  });

  it("rejects schema violations", () => {
    expect(() => parseScenario(`name: x\nsteps: []`)).toThrow(/failed validation/);
  });
});

describe("MockAgent", () => {
  it("walks through scenario steps in order", async () => {
    const sleep: Sleeper = vi.fn(async () => {});
    const agent = new MockAgent({ scenarios: [TWO_STEP], sleep });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });

    const first = await session.runTurn();
    expect(first.content).toBe("hi");
    expect(session.isDone()).toBe(false);

    const second = await session.runTurn();
    expect(second.content).toBe("done");
    expect(second.finalState).toBe("Done");
    expect(session.isDone()).toBe(true);
  });

  it("invokes sleep with the configured delay for each step", async () => {
    const sleep = vi.fn(async () => {});
    const scenario: Scenario = {
      name: "slow",
      labels: [],
      steps: [
        { role: "assistant", content: "a", delay_ms: 50 },
        { role: "assistant", content: "b", delay_ms: 0 },
        { role: "assistant", content: "c", delay_ms: 200 },
      ],
    };
    const agent = new MockAgent({ scenarios: [scenario], sleep });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });
    await session.runTurn();
    await session.runTurn();
    await session.runTurn();
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 50);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("raises when a step is marked throw:true", async () => {
    const scenario: Scenario = {
      name: "crash",
      labels: [],
      steps: [
        { role: "assistant", content: "about to crash", delay_ms: 0 },
        { role: "tool", content: "boom", delay_ms: 0, throw: true },
      ],
    };
    const agent = new MockAgent({ scenarios: [scenario], sleep: async () => {} });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "" });
    await session.runTurn();
    await expect(session.runTurn()).rejects.toThrow(/raised at step/);
  });

  it("refuses to run past the last step", async () => {
    const agent = new MockAgent({
      scenarios: [TWO_STEP],
      sleep: async () => {},
    });
    const session = await agent.startSession({ workdir: "/tmp", prompt: "go" });
    await session.runTurn();
    await session.runTurn();
    await expect(session.runTurn()).rejects.toThrow(/exhausted/);
  });

  it("prefers a scenario whose label matches an issue label", async () => {
    const happy: Scenario = { ...TWO_STEP, name: "happy", labels: ["happy"] };
    const rate: Scenario = {
      name: "rate",
      labels: ["rate-limit"],
      steps: [{ role: "assistant", content: "429", delay_ms: 0 }],
    };
    const agent = new MockAgent({
      scenarios: [happy, rate],
      sleep: async () => {},
    });
    const session = await agent.startSession({
      workdir: "/tmp",
      prompt: "go",
      labels: ["rate-limit"],
    });
    const turn = await session.runTurn();
    expect(turn.content).toBe("429");
  });

  it("round-robins when no label matches", async () => {
    const a: Scenario = { ...TWO_STEP, name: "a" };
    const b: Scenario = { ...TWO_STEP, name: "b" };
    const agent = new MockAgent({ scenarios: [a, b], sleep: async () => {} });
    const s1 = await agent.startSession({ workdir: "/tmp", prompt: "" });
    const s2 = await agent.startSession({ workdir: "/tmp", prompt: "" });
    const s3 = await agent.startSession({ workdir: "/tmp", prompt: "" });
    expect([s1, s2, s3].length).toBe(3);
  });

  it("refuses to construct with an empty scenario list", () => {
    expect(() => new MockAgent({ scenarios: [] })).toThrow(/at least one scenario/);
  });
});

describe("loadScenariosDir", () => {
  it("loads the happy-path fixture", () => {
    const scenarios = loadScenariosDir("fixtures/scenarios");
    expect(scenarios.find((s) => s.name === "happy-path")).toBeDefined();
  });

  it("loads a specific fixture file", () => {
    const s = loadScenarioFile("fixtures/scenarios/happy-path.yaml");
    expect(s.steps.at(-1)?.final_state).toBe("Human Review");
  });
});
