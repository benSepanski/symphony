import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const WorkflowConfigSchema = z.object({
  tracker: z.object({
    kind: z.string(),
    project_slug: z.string(),
    active_states: z.array(z.string()),
    terminal_states: z.array(z.string()),
    api_key: z.string().optional(),
  }),
  polling: z.object({
    interval_ms: z.number(),
  }),
  workspace: z.object({
    root: z.string(),
  }),
  hooks: z
    .object({
      after_create: z.string().optional(),
      before_remove: z.string().optional(),
    })
    .optional(),
  agent: z.object({
    kind: z.enum(["claude_code", "mock"]),
    max_concurrent_agents: z.number().default(1),
    max_turns: z.number().default(10),
    max_turns_state: z.string().default("Blocked"),
  }),
  claude_code: z
    .object({
      command: z.string().default("claude"),
      model: z.string().optional(),
      permission_mode: z.string().optional(),
    })
    .optional(),
  mock: z
    .object({
      scenarios_dir: z.string().default("fixtures/scenarios"),
      assignment: z.enum(["round_robin", "by_label"]).default("round_robin"),
      default_scenario: z.string().optional(),
    })
    .optional(),
  self_update: z
    .object({
      enabled: z.boolean().default(false),
      repo_path: z.string().optional(),
      branch: z.string().default("main"),
      min_interval_ms: z.number().int().positive().default(600_000),
    })
    .optional(),
  prompt: z.string().optional(),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export interface ParsedWorkflow {
  config: WorkflowConfig;
  promptTemplate: string;
  promptVersion: string;
  promptSource: string;
}

export class WorkflowParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowParseError";
  }
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

interface ParsedPromptFile {
  template: string;
  version: string;
}

export interface ParseWorkflowOptions {
  baseDir?: string;
}

export function parseWorkflowString(
  source: string,
  options: ParseWorkflowOptions = {},
): ParsedWorkflow {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) {
    throw new WorkflowParseError(
      "Missing YAML front matter delimited by `---` at the top of the file",
    );
  }
  const [, yamlBlock, template] = match;

  let rawConfig: unknown;
  try {
    rawConfig = parseYaml(yamlBlock);
  } catch (err) {
    throw new WorkflowParseError(`Invalid YAML in front matter: ${(err as Error).message}`);
  }

  const parsed = WorkflowConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new WorkflowParseError(
      `Workflow config failed validation:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n")}`,
    );
  }

  if (parsed.data.prompt) {
    const promptPath = resolvePromptPath(parsed.data.prompt, options.baseDir);
    const loaded = loadPromptFile(promptPath);
    return {
      config: parsed.data,
      promptTemplate: loaded.template,
      promptVersion: loaded.version,
      promptSource: parsed.data.prompt,
    };
  }

  return {
    config: parsed.data,
    promptTemplate: template.trimStart(),
    promptVersion: "inline",
    promptSource: "inline",
  };
}

export function parseWorkflow(path: string): ParsedWorkflow {
  const source = readFileSync(path, "utf8");
  return parseWorkflowString(source, { baseDir: dirname(resolve(path)) });
}

function resolvePromptPath(promptRef: string, baseDir?: string): string {
  if (isAbsolute(promptRef)) return promptRef;
  return resolve(baseDir ?? process.cwd(), promptRef);
}

function loadPromptFile(path: string): ParsedPromptFile {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (err) {
    throw new WorkflowParseError(`Cannot read prompt file ${path}: ${(err as Error).message}`);
  }
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) {
    return { template: source.trimStart(), version: "unversioned" };
  }
  const [, yamlBlock, body] = match;
  let version = "unversioned";
  try {
    const meta = parseYaml(yamlBlock) as { version?: unknown } | null;
    if (meta && typeof meta.version === "string") version = meta.version;
  } catch {
    /* ignore malformed prompt front matter; treat as unversioned */
  }
  return { template: body.trimStart(), version };
}
