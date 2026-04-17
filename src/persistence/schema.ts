import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").notNull(),
  issueIdentifier: text("issue_identifier").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  scenario: text("scenario"),
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
