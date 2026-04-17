import { Command } from "commander";

const program = new Command();

program
  .name("symphony")
  .description("Orchestrator that polls Linear issues and runs coding agents")
  .version("0.1.0")
  .argument("<workflow>", "path to WORKFLOW.md")
  .option("-p, --port <port>", "HTTP server port", "4000")
  .option("--mock", "use mock agent instead of real agent")
  .action((_workflow: string, _opts: { port: string; mock?: boolean }) => {
    console.log("symphony: not yet implemented");
  });

program.parse();
