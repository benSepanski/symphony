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
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export interface ParsedWorkflow {
  config: WorkflowConfig;
  promptTemplate: string;
}
