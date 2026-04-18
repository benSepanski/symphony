import { serve } from "@hono/node-server";
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { createServer } from "./api/server.js";
import { ClaudeCodeAgent } from "./agent/claude-code.js";
import { MockAgent, loadScenariosDir } from "./agent/mock.js";
import type { Agent } from "./agent/types.js";
import { parseWorkflow } from "./config/workflow.js";
import { Orchestrator } from "./orchestrator.js";
import { SymphonyLogger } from "./persistence/logger.js";
import { createReplayEmitter } from "./replay.js";
import { LinearTracker } from "./tracker/linear.js";
import { MemoryTracker } from "./tracker/memory.js";
import type { Issue, Tracker } from "./tracker/types.js";
import { ClaudeOAuthUsageChecker } from "./usage/claude-oauth.js";
import type { UsageChecker } from "./usage/types.js";
import { WorkspaceManager } from "./workspace/manager.js";

const DEMO_ISSUES: Issue[] = [
  {
    id: "demo-1",
    identifier: "DEMO-1",
    title: "Investigate a race condition in the dispatch loop",
    description: "Users report stuck runs. Repro + fix.",
    state: "Todo",
    labels: ["bug", "happy"],
    url: "https://example.com/DEMO-1",
  },
  {
    id: "demo-2",
    identifier: "DEMO-2",
    title: "Add a dashboard filter for blocked runs",
    description: "Backlog ask — small UI change.",
    state: "Todo",
    labels: ["ui"],
    url: "https://example.com/DEMO-2",
  },
];

interface BootOptions {
  workflowPath: string;
  port: number;
  mock: boolean;
  noDemo: boolean;
  seedPath?: string;
}

const SeedIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  state: z.string(),
  labels: z.array(z.string()).default([]),
  url: z.string(),
});
const SeedFileSchema = z.object({ issues: z.array(SeedIssueSchema) });

function loadSeedIssues(path: string): Issue[] {
  const raw = parseYaml(readFileSync(path, "utf8"));
  return SeedFileSchema.parse(raw).issues;
}

async function boot({ workflowPath, port, mock, noDemo, seedPath }: BootOptions): Promise<void> {
  const workflow = parseWorkflow(workflowPath);
  const isMock = mock || workflow.config.agent.kind === "mock";

  const dbPath = resolve(".symphony/symphony.db");
  const logsDir = resolve(".symphony/logs");
  const logger = new SymphonyLogger({ dbPath, logsDir });

  let tracker: Tracker;
  let agent: Agent;
  let modeLabel: string;
  let usageChecker: UsageChecker | undefined;

  if (isMock) {
    const seedIssues = seedPath ? loadSeedIssues(resolve(seedPath)) : noDemo ? [] : DEMO_ISSUES;
    tracker = new MemoryTracker({
      activeStates: workflow.config.tracker.active_states,
      issues: seedIssues,
    });
    const scenariosDir = workflow.config.mock?.scenarios_dir ?? "fixtures/scenarios";
    const scenarios = loadScenariosDir(resolve(scenariosDir));
    agent = new MockAgent({ scenarios });
    modeLabel = "mock mode";
  } else {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error(
        "LINEAR_API_KEY is not set. Real-agent mode requires a Linear API key — copy .env.example to .env and fill it in, or pass --mock.",
      );
    }
    tracker = new LinearTracker({
      apiKey,
      projectSlug: workflow.config.tracker.project_slug,
      activeStates: workflow.config.tracker.active_states,
    });
    agent = new ClaudeCodeAgent({
      command: workflow.config.claude_code?.command,
      model: workflow.config.claude_code?.model,
      permissionMode: workflow.config.claude_code?.permission_mode,
    });
    usageChecker = new ClaudeOAuthUsageChecker({
      onError: (err) => console.warn("[usage]", err.message),
    });
    modeLabel = "real mode (Linear + claude)";
  }

  const workspaceRoot =
    workflow.config.workspace.root.startsWith("~") || workflow.config.workspace.root.startsWith("/")
      ? workflow.config.workspace.root
      : join(process.cwd(), workflow.config.workspace.root);
  const workspace = new WorkspaceManager({
    root: workspaceRoot,
    hooks: isMock
      ? undefined
      : {
          afterCreate: workflow.config.hooks?.after_create,
          beforeRemove: workflow.config.hooks?.before_remove,
        },
  });

  const orchestrator = new Orchestrator({
    workflow,
    tracker,
    agent,
    workspace,
    logger,
    usageChecker,
  });

  orchestrator.on("error", (err: Error) => {
    console.error("[orchestrator]", err);
  });

  const app = createServer({
    events: orchestrator,
    logger,
    getUsage: () => orchestrator.getUsage(),
    getState: () => orchestrator.getState(),
  });
  const server = serve({ fetch: app.fetch, port });

  orchestrator.start();
  console.log(`symphony listening on http://localhost:${port} (${modeLabel})`);

  const shutdown = async () => {
    console.log("\nshutting down");
    await orchestrator.stop();
    server.close();
    logger.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function replay(opts: { runId: string; port: number; speed: number }): Promise<void> {
  const dbPath = resolve(".symphony/symphony.db");
  const logsDir = resolve(".symphony/logs");
  const logger = new SymphonyLogger({ dbPath, logsDir });

  const { events, run } = createReplayEmitter({
    runId: opts.runId,
    logger,
    speed: opts.speed,
  });

  const app = createServer({ events, logger });
  const server = serve({ fetch: app.fetch, port: opts.port });
  console.log(`symphony replay serving http://localhost:${opts.port} (speed ${opts.speed}x)`);

  try {
    await run();
    console.log("replay finished; press ctrl-c to exit");
  } catch (err) {
    console.error(err);
    server.close();
    logger.close();
    process.exit(1);
  }

  const shutdown = () => {
    server.close();
    logger.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const program = new Command();
program
  .name("symphony")
  .description("Orchestrator that polls Linear issues and runs coding agents")
  .version("0.1.0");

program
  .command("run", { isDefault: true })
  .argument("<workflow>", "path to WORKFLOW.md")
  .option("-p, --port <port>", "HTTP server port", "4000")
  .option("--mock", "use mock agent instead of real agent")
  .option("--no-demo", "skip seeding the built-in mock-mode demo issues")
  .option("--seed <path>", "YAML file with a demo issues list (see fixtures/seed.example.yaml)")
  .action(
    async (
      workflowPath: string,
      opts: { port: string; mock?: boolean; demo?: boolean; seed?: string },
    ) => {
      await boot({
        workflowPath,
        port: Number(opts.port),
        mock: Boolean(opts.mock),
        noDemo: opts.demo === false,
        seedPath: opts.seed,
      });
    },
  );

program
  .command("prune")
  .description("Delete runs (and their JSONL logs) older than the given duration")
  .option("--older-than <duration>", "retention cutoff: e.g. 7d, 24h, 30m. Defaults to 30d.", "30d")
  .action((opts: { olderThan: string }) => {
    const cutoff = new Date(Date.now() - parseDurationMs(opts.olderThan));
    const dbPath = resolve(".symphony/symphony.db");
    const logsDir = resolve(".symphony/logs");
    const logger = new SymphonyLogger({ dbPath, logsDir });
    try {
      const result = logger.pruneOlderThan(cutoff);
      console.log(
        `pruned ${result.runsRemoved} run(s) and ${result.filesRemoved} JSONL file(s) older than ${cutoff.toISOString()}`,
      );
    } finally {
      logger.close();
    }
  });

function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`cannot parse duration ${JSON.stringify(input)}; expected e.g. 7d, 24h, 30m`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const mult =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
  return value * mult;
}

program
  .command("replay")
  .argument("<runId>", "id of a previously recorded run from .symphony/symphony.db")
  .option("-p, --port <port>", "HTTP server port", "4000")
  .option("--speed <factor>", "playback speed multiplier (1 = realtime)", "5")
  .action(async (runId: string, opts: { port: string; speed: string }) => {
    await replay({
      runId,
      port: Number(opts.port),
      speed: Number(opts.speed),
    });
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
