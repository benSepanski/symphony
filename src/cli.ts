import { serve } from "@hono/node-server";
import { Command } from "commander";
import { join, resolve } from "node:path";
import { createServer } from "./api/server.js";
import { MockAgent, loadScenariosDir } from "./agent/mock.js";
import type { Agent } from "./agent/types.js";
import { parseWorkflow } from "./config/workflow.js";
import { Orchestrator } from "./orchestrator.js";
import { SymphonyLogger } from "./persistence/logger.js";
import { MemoryTracker } from "./tracker/memory.js";
import type { Issue, Tracker } from "./tracker/types.js";
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
}

async function boot({ workflowPath, port, mock }: BootOptions): Promise<void> {
  const workflow = parseWorkflow(workflowPath);
  const isMock = mock || workflow.config.agent.kind === "mock";

  if (!isMock) {
    throw new Error(
      "Real agent mode is not wired yet; pass --mock or set agent.kind: mock in WORKFLOW.md.",
    );
  }

  const dbPath = resolve(".symphony/symphony.db");
  const logsDir = resolve(".symphony/logs");
  const logger = new SymphonyLogger({ dbPath, logsDir });

  const tracker: Tracker = new MemoryTracker({
    activeStates: workflow.config.tracker.active_states,
    issues: DEMO_ISSUES,
  });

  const scenariosDir = workflow.config.mock?.scenarios_dir ?? "fixtures/scenarios";
  const scenarios = loadScenariosDir(resolve(scenariosDir));
  const agent: Agent = new MockAgent({ scenarios });

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
  });

  orchestrator.on("error", (err: Error) => {
    console.error("[orchestrator]", err);
  });

  const app = createServer({ orchestrator, logger });
  const server = serve({ fetch: app.fetch, port });

  orchestrator.start();
  console.log(`symphony listening on http://localhost:${port} (mock mode)`);

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

const program = new Command();
program
  .name("symphony")
  .description("Orchestrator that polls Linear issues and runs coding agents")
  .version("0.1.0")
  .argument("<workflow>", "path to WORKFLOW.md")
  .option("-p, --port <port>", "HTTP server port", "4000")
  .option("--mock", "use mock agent instead of real agent")
  .action(async (workflowPath: string, opts: { port: string; mock?: boolean }) => {
    await boot({
      workflowPath,
      port: Number(opts.port),
      mock: Boolean(opts.mock),
    });
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
