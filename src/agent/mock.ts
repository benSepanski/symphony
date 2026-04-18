import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Agent, AgentSession, AgentStartContext, AgentTurn } from "./types.js";

export const ScenarioStepSchema = z.object({
  role: z.enum(["assistant", "tool"]),
  content: z.string(),
  delay_ms: z.number().int().nonnegative().default(0),
  tool_calls: z.array(z.unknown()).optional(),
  final_state: z.string().optional(),
  throw: z.boolean().optional(),
});

export const ScenarioSchema = z.object({
  name: z.string(),
  labels: z.array(z.string()).default([]),
  steps: z.array(ScenarioStepSchema).min(1),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

export class ScenarioLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioLoadError";
  }
}

export function parseScenario(source: string, origin = "<inline>"): Scenario {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (err) {
    throw new ScenarioLoadError(`Invalid YAML in ${origin}: ${(err as Error).message}`);
  }
  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioLoadError(
      `Scenario ${origin} failed validation:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n")}`,
    );
  }
  return parsed.data;
}

export function loadScenarioFile(path: string): Scenario {
  const source = readFileSync(path, "utf8");
  return parseScenario(source, path);
}

export function loadScenariosDir(dir: string): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => loadScenarioFile(join(dir, f)));
}

export type Sleeper = (ms: number) => Promise<void>;

export const realSleeper: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type ScenarioSelector = (context: AgentStartContext) => Scenario;

export interface MockAgentOptions {
  scenarios: Scenario[];
  sleep?: Sleeper;
  select?: ScenarioSelector;
}

export class MockAgent implements Agent {
  private readonly scenarios: Scenario[];
  private readonly sleep: Sleeper;
  private readonly select: ScenarioSelector;
  private rotation = 0;

  constructor(options: MockAgentOptions) {
    if (options.scenarios.length === 0) {
      throw new Error("MockAgent requires at least one scenario");
    }
    this.scenarios = options.scenarios;
    this.sleep = options.sleep ?? realSleeper;
    this.select = options.select ?? this.defaultSelect;
  }

  async startSession(context: AgentStartContext): Promise<AgentSession> {
    const scenario = this.select(context);
    return new MockAgentSession(scenario, this.sleep);
  }

  private defaultSelect: ScenarioSelector = (ctx) => {
    const labels = ctx.labels ?? [];
    if (labels.length > 0) {
      const matched = this.scenarios.find((s) => s.labels.some((l) => labels.includes(l)));
      if (matched) return matched;
    }
    const chosen = this.scenarios[this.rotation % this.scenarios.length];
    this.rotation += 1;
    return chosen;
  };
}

class MockAgentSession implements AgentSession {
  private cursor = 0;
  private stopped = false;

  constructor(
    private readonly scenario: Scenario,
    private readonly sleep: Sleeper,
  ) {}

  async runTurn(): Promise<AgentTurn> {
    if (this.stopped) throw new Error("session stopped");
    if (this.cursor >= this.scenario.steps.length) {
      throw new Error(`scenario ${this.scenario.name} exhausted`);
    }
    const step = this.scenario.steps[this.cursor++];
    if (step.delay_ms > 0) await this.sleep(step.delay_ms);
    if (step.throw) {
      throw new Error(
        `scenario ${this.scenario.name} raised at step ${this.cursor}: ${step.content}`,
      );
    }
    return {
      role: step.role,
      content: step.content,
      toolCalls: step.tool_calls,
      finalState: step.final_state,
    };
  }

  isDone(): boolean {
    return this.stopped || this.cursor >= this.scenario.steps.length;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}
