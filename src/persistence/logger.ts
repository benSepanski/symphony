import { appendFileSync, closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import Database, { type Database as BetterDb } from "better-sqlite3";
import { CREATE_TABLES_SQL, RUN_COLUMN_MIGRATIONS } from "./schema.js";

export interface LoggerOptions {
  dbPath: string;
  logsDir: string;
  now?: () => Date;
  idGenerator?: () => string;
}

export interface StartRunInput {
  issueId: string;
  issueIdentifier: string;
  issueTitle?: string | null;
  scenario?: string | null;
  promptVersion?: string | null;
  promptSource?: string | null;
}

export interface RunStartContextInput {
  runId: string;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  startFiveHourUtil?: number | null;
  startSevenDayUtil?: number | null;
}

export interface RunTokenUsageInput {
  runId: string;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheCreation: number;
  totalCostUsd: number;
}

export interface RecordTurnInput {
  runId: string;
  role: string;
  content: string;
  toolCalls?: unknown;
  finalState?: string | null;
  renderedPrompt?: string | null;
}

export interface LogEventInput {
  runId: string;
  turnId?: string | null;
  eventType: string;
  issueId?: string | null;
  payload?: unknown;
}

export interface RunLog {
  id: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  scenario: string | null;
  promptVersion: string | null;
  promptSource: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheCreation: number | null;
  totalCostUsd: number | null;
  authStatus: string | null;
  startFiveHourUtil: number | null;
  startSevenDayUtil: number | null;
}

export interface TurnLog {
  id: string;
  runId: string;
  turnNumber: number;
  role: string;
  content: string;
  toolCalls: string | null;
  finalState: string | null;
  renderedPrompt: string | null;
  createdAt: string;
}

export interface EventLog {
  id: number;
  runId: string;
  turnId: string | null;
  eventType: string;
  issueId: string | null;
  payload: string | null;
  ts: string;
}

export interface SearchMatch {
  runId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  matchKind: "turn" | "event";
  turnNumber: number | null;
  eventType: string | null;
  snippet: string;
}

export class SymphonyLogger {
  readonly db: BetterDb;
  private readonly logsDir: string;
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly turnCounts = new Map<string, number>();

  constructor(options: LoggerOptions) {
    if (options.dbPath !== ":memory:") {
      mkdirSync(dirname(options.dbPath), { recursive: true });
    }
    mkdirSync(options.logsDir, { recursive: true });
    this.logsDir = options.logsDir;
    this.now = options.now ?? (() => new Date());
    this.id = options.idGenerator ?? randomUUID;
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(CREATE_TABLES_SQL);
    this.migrateRunColumns();
  }

  private migrateRunColumns(): void {
    const existing = new Set(
      (this.db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    for (const col of RUN_COLUMN_MIGRATIONS) {
      if (existing.has(col.name)) continue;
      this.db.exec(`ALTER TABLE runs ADD COLUMN ${col.name} ${col.sql}`);
    }
  }

  startRun(input: StartRunInput): string {
    const runId = this.id();
    const startedAt = this.isoNow();
    this.db
      .prepare(
        `INSERT INTO runs
           (id, issue_id, issue_identifier, issue_title, status, started_at, scenario,
            prompt_version, prompt_source)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
      )
      .run(
        runId,
        input.issueId,
        input.issueIdentifier,
        input.issueTitle ?? null,
        startedAt,
        input.scenario ?? null,
        input.promptVersion ?? null,
        input.promptSource ?? null,
      );
    this.appendJsonl(runId, {
      ts: startedAt,
      run_id: runId,
      turn_id: null,
      event_type: "run_started",
      issue_id: input.issueId,
      payload: {
        issue_identifier: input.issueIdentifier,
        scenario: input.scenario ?? null,
        prompt_version: input.promptVersion ?? null,
        prompt_source: input.promptSource ?? null,
      },
    });
    return runId;
  }

  recordTurn(input: RecordTurnInput): string {
    const turnId = this.id();
    const createdAt = this.isoNow();
    const nextNumber = (this.turnCounts.get(input.runId) ?? 0) + 1;
    this.turnCounts.set(input.runId, nextNumber);
    const toolCallsJson = input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls);
    this.db
      .prepare(
        `INSERT INTO turns
           (id, run_id, turn_number, role, content, tool_calls, final_state, rendered_prompt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turnId,
        input.runId,
        nextNumber,
        input.role,
        input.content,
        toolCallsJson,
        input.finalState ?? null,
        input.renderedPrompt ?? null,
        createdAt,
      );
    this.appendJsonl(input.runId, {
      ts: createdAt,
      run_id: input.runId,
      turn_id: turnId,
      event_type: "turn_recorded",
      issue_id: null,
      payload: {
        turn_number: nextNumber,
        role: input.role,
        content: input.content,
        tool_calls: input.toolCalls ?? null,
        final_state: input.finalState ?? null,
        rendered_prompt: input.renderedPrompt ?? null,
      },
    });
    return turnId;
  }

  logEvent(input: LogEventInput): number {
    const ts = this.isoNow();
    const payloadJson = input.payload === undefined ? null : JSON.stringify(input.payload);
    const result = this.db
      .prepare(
        `INSERT INTO log_events (run_id, turn_id, event_type, issue_id, payload, ts)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.runId,
        input.turnId ?? null,
        input.eventType,
        input.issueId ?? null,
        payloadJson,
        ts,
      );
    this.appendJsonl(input.runId, {
      ts,
      run_id: input.runId,
      turn_id: input.turnId ?? null,
      event_type: input.eventType,
      issue_id: input.issueId ?? null,
      payload: input.payload ?? null,
    });
    return Number(result.lastInsertRowid);
  }

  finishRun(runId: string, status: string): void {
    const finishedAt = this.isoNow();
    this.db
      .prepare(`UPDATE runs SET status = ?, finished_at = ? WHERE id = ?`)
      .run(status, finishedAt, runId);
    this.appendJsonl(runId, {
      ts: finishedAt,
      run_id: runId,
      turn_id: null,
      event_type: "run_finished",
      issue_id: null,
      payload: { status },
    });
  }

  listRuns(): RunLog[] {
    return this.db
      .prepare(
        `SELECT id, issue_id AS issueId, issue_identifier AS issueIdentifier,
                issue_title AS issueTitle, status, started_at AS startedAt,
                finished_at AS finishedAt, scenario,
                prompt_version AS promptVersion, prompt_source AS promptSource,
                tokens_input AS tokensInput, tokens_output AS tokensOutput,
                tokens_cache_read AS tokensCacheRead,
                tokens_cache_creation AS tokensCacheCreation,
                total_cost_usd AS totalCostUsd,
                auth_status AS authStatus,
                start_five_hour_util AS startFiveHourUtil,
                start_seven_day_util AS startSevenDayUtil
         FROM runs ORDER BY started_at ASC`,
      )
      .all() as RunLog[];
  }

  recordRunStartContext(input: RunStartContextInput): void {
    this.db
      .prepare(
        `UPDATE runs
           SET auth_status = ?,
               start_five_hour_util = ?,
               start_seven_day_util = ?
         WHERE id = ?`,
      )
      .run(
        input.authStatus,
        input.startFiveHourUtil ?? null,
        input.startSevenDayUtil ?? null,
        input.runId,
      );
    this.appendJsonl(input.runId, {
      ts: this.isoNow(),
      run_id: input.runId,
      turn_id: null,
      event_type: "run_start_context",
      issue_id: null,
      payload: {
        auth_status: input.authStatus,
        start_five_hour_util: input.startFiveHourUtil ?? null,
        start_seven_day_util: input.startSevenDayUtil ?? null,
      },
    });
  }

  updateRunUsage(input: RunTokenUsageInput): void {
    this.db
      .prepare(
        `UPDATE runs
           SET tokens_input = ?,
               tokens_output = ?,
               tokens_cache_read = ?,
               tokens_cache_creation = ?,
               total_cost_usd = ?
         WHERE id = ?`,
      )
      .run(
        input.tokensInput,
        input.tokensOutput,
        input.tokensCacheRead,
        input.tokensCacheCreation,
        input.totalCostUsd,
        input.runId,
      );
    this.appendJsonl(input.runId, {
      ts: this.isoNow(),
      run_id: input.runId,
      turn_id: null,
      event_type: "run_token_usage",
      issue_id: null,
      payload: {
        tokens_input: input.tokensInput,
        tokens_output: input.tokensOutput,
        tokens_cache_read: input.tokensCacheRead,
        tokens_cache_creation: input.tokensCacheCreation,
        total_cost_usd: input.totalCostUsd,
      },
    });
  }

  listTurns(runId: string): TurnLog[] {
    return this.db
      .prepare(
        `SELECT id, run_id AS runId, turn_number AS turnNumber, role, content,
                tool_calls AS toolCalls, final_state AS finalState,
                rendered_prompt AS renderedPrompt, created_at AS createdAt
         FROM turns WHERE run_id = ? ORDER BY turn_number ASC`,
      )
      .all(runId) as TurnLog[];
  }

  listEvents(runId: string): EventLog[] {
    return this.db
      .prepare(
        `SELECT id, run_id AS runId, turn_id AS turnId, event_type AS eventType,
                issue_id AS issueId, payload, ts
         FROM log_events WHERE run_id = ? ORDER BY id ASC`,
      )
      .all(runId) as EventLog[];
  }

  pruneOlderThan(cutoff: Date): { runsRemoved: number; filesRemoved: number } {
    const cutoffIso = cutoff.toISOString();
    const targets = this.db
      .prepare(`SELECT id FROM runs WHERE started_at < ?`)
      .all(cutoffIso) as Array<{ id: string }>;
    if (targets.length === 0) return { runsRemoved: 0, filesRemoved: 0 };

    const ids = targets.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM log_events WHERE run_id IN (${placeholders})`).run(...ids);
      this.db.prepare(`DELETE FROM turns WHERE run_id IN (${placeholders})`).run(...ids);
      this.db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...ids);
    });
    tx();

    let filesRemoved = 0;
    for (const id of ids) {
      try {
        rmSync(this.jsonlPath(id), { force: true });
        filesRemoved += 1;
      } catch {
        /* ignore missing files */
      }
      this.turnCounts.delete(id);
    }
    return { runsRemoved: ids.length, filesRemoved };
  }

  search(query: string, limit = 100): SearchMatch[] {
    if (query.trim() === "") return [];
    const like = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT r.id AS runId,
                  r.issue_identifier AS issueIdentifier,
                  r.issue_title AS issueTitle,
                  r.status AS status,
                  'turn' AS matchKind,
                  t.turn_number AS turnNumber,
                  NULL AS eventType,
                  t.content AS snippet,
                  t.created_at AS matchedAt
           FROM turns t JOIN runs r ON r.id = t.run_id
           WHERE t.content LIKE ? ESCAPE '\\'
           UNION ALL
           SELECT r.id AS runId,
                  r.issue_identifier AS issueIdentifier,
                  r.issue_title AS issueTitle,
                  r.status AS status,
                  'event' AS matchKind,
                  NULL AS turnNumber,
                  e.event_type AS eventType,
                  e.payload AS snippet,
                  e.ts AS matchedAt
           FROM log_events e JOIN runs r ON r.id = e.run_id
           WHERE e.payload LIKE ? ESCAPE '\\'
         )
         ORDER BY matchedAt DESC
         LIMIT ?`,
      )
      .all(like, like, limit) as Array<SearchMatch & { matchedAt: string }>;
    return rows.map(({ matchedAt: _, ...rest }) => rest);
  }

  jsonlPath(runId: string): string {
    return join(this.logsDir, `${runId}.jsonl`);
  }

  close(): void {
    this.db.close();
  }

  private appendJsonl(runId: string, event: Record<string, unknown>): void {
    const path = this.jsonlPath(runId);
    const fd = openSync(path, "a");
    try {
      appendFileSync(fd, `${JSON.stringify(event)}\n`);
    } finally {
      closeSync(fd);
    }
  }

  private isoNow(): string {
    return this.now().toISOString();
  }
}
