import { describe, expect, it } from "vitest";
import { loadFixtureScenario, runScenario } from "./harness.js";

describe("scenario: happy-path", () => {
  it("completes the run and transitions to Human Review", async () => {
    const scenario = loadFixtureScenario("happy-path");
    const result = await runScenario({ scenario });
    expect(result.runStatus).toBe("completed");
    expect(result.finalTrackerState).toBe("Human Review");
    expect(result.turnCount).toBe(scenario.steps.length);
  });
});

describe("scenario: rate-limit", () => {
  it("completes the run and parks the issue in Blocked", async () => {
    const scenario = loadFixtureScenario("rate-limit");
    const result = await runScenario({ scenario });
    expect(result.runStatus).toBe("completed");
    expect(result.finalTrackerState).toBe("Blocked");
  });
});

describe("scenario: turn-limit", () => {
  it("hits max_turns and parks the issue in max_turns_state", async () => {
    const scenario = loadFixtureScenario("turn-limit");
    const result = await runScenario({ scenario });
    expect(result.runStatus).toBe("max_turns");
    expect(result.finalTrackerState).toBe("Blocked");
    expect(result.turnCount).toBe(10);
  });
});

describe("scenario: crash", () => {
  it("records a failed run when the scenario throws", async () => {
    const scenario = loadFixtureScenario("crash");
    const result = await runScenario({ scenario });
    expect(result.runStatus).toBe("failed");
    expect(result.events.map((e) => e.eventType)).toContain("error");
  });
});

describe("scenario: long-running", () => {
  it("completes every turn and transitions to Human Review", async () => {
    const scenario = loadFixtureScenario("long-running");
    const result = await runScenario({ scenario });
    expect(result.runStatus).toBe("completed");
    expect(result.finalTrackerState).toBe("Human Review");
    expect(result.turnCount).toBe(scenario.steps.length);
  });
});
