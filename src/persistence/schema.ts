import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  issueIdentifier: text("issue_identifier").notNull(),
  issueTitle: text("issue_title"),
  status: text("status").notNull().default("running"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  scenario: text("scenario"),
  promptVersion: text("prompt_version"),
  promptSource: text("prompt_source"),
});

export const turns = sqliteTable("turns", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  turnNumber: integer("turn_number").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  finalState: text("final_state"),
  renderedPrompt: text("rendered_prompt"),
  createdAt: text("created_at").notNull(),
});

export const logEvents = sqliteTable("log_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  turnId: text("turn_id"),
  eventType: text("event_type").notNull(),
  issueId: text("issue_id"),
  payload: text("payload"),
  ts: text("ts").notNull(),
});

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY NOT NULL,
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  issue_title TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scenario TEXT,
  prompt_version TEXT,
  prompt_source TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id),
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  final_state TEXT,
  rendered_prompt TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  turn_id TEXT,
  event_type TEXT NOT NULL,
  issue_id TEXT,
  payload TEXT,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_run_id ON turns(run_id);
CREATE INDEX IF NOT EXISTS idx_log_events_run_id ON log_events(run_id);
`;
