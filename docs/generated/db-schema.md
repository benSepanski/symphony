# docs/generated/db-schema.md

The current SQLite schema, extracted from
[`src/persistence/schema.ts`](../../src/persistence/schema.ts). This file is the
quick reference; the TypeScript is the source of truth. When the schema changes,
update this file in the same PR.

_Last regenerated:_ 2026-04-18
_Generated from commit:_ (this one)

---

## Tables

### `runs`

One row per orchestrator run (one attempt against one issue).

| Column             | SQL type         | Notes                                                                                                                                  |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | TEXT PK NOT NULL | UUIDv4.                                                                                                                                |
| `issue_id`         | TEXT NOT NULL    | Tracker-internal id.                                                                                                                   |
| `issue_identifier` | TEXT NOT NULL    | Human-readable (e.g. `BEN-42`).                                                                                                        |
| `issue_title`      | TEXT NULLABLE    |                                                                                                                                        |
| `status`           | TEXT NOT NULL    | Default `running`. Terminal: `completed`, `failed`, `max_turns`, `cancelled`.                                                          |
| `started_at`       | TEXT NOT NULL    | ISO-8601 UTC.                                                                                                                          |
| `finished_at`      | TEXT NULLABLE    | ISO-8601 UTC; `NULL` while `status = running`.                                                                                         |
| `scenario`         | TEXT NULLABLE    | Mock-mode scenario name.                                                                                                               |
| `prompt_version`   | TEXT NULLABLE    | From the prompt's front-matter `version:` key; `"inline"` for inline templates; `"unversioned"` for prompt files without front matter. |
| `prompt_source`    | TEXT NULLABLE    | The path (or `"inline"`) identifying which prompt template was used.                                                                   |

### `turns`

One row per agent turn within a run.

| Column            | SQL type                   | Notes                                                                                                         |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`              | TEXT PK NOT NULL           | UUIDv4.                                                                                                       |
| `run_id`          | TEXT NOT NULL FK → runs.id | Never null.                                                                                                   |
| `turn_number`     | INTEGER NOT NULL           | 1-based, monotonic per run.                                                                                   |
| `role`            | TEXT NOT NULL              | `assistant` / `tool` / `user` (user only on rare resumptions).                                                |
| `content`         | TEXT NOT NULL              | Full text body of the turn.                                                                                   |
| `tool_calls`      | TEXT NULLABLE              | JSON array; each element is `{ name, input, id }` for tool_use or `{ tool_use_id, content }` for tool_result. |
| `final_state`     | TEXT NULLABLE              | Set when this turn reports a terminal state transition (e.g. `Human Review`, `Done`).                         |
| `rendered_prompt` | TEXT NULLABLE              | The liquid-rendered prompt that was fed into this turn.                                                       |
| `created_at`      | TEXT NOT NULL              | ISO-8601 UTC.                                                                                                 |

Index: `idx_turns_run_id (run_id)`.

### `log_events`

Catch-all event log. One row per notable runtime moment.

| Column       | SQL type                   | Notes                                                                                                 |
| ------------ | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`         | INTEGER PK AUTOINCREMENT   |                                                                                                       |
| `run_id`     | TEXT NOT NULL FK → runs.id |                                                                                                       |
| `turn_id`    | TEXT NULLABLE              | FK-ish to `turns.id`; not enforced.                                                                   |
| `event_type` | TEXT NOT NULL              | Stable string (see [`../design-docs/event-log-as-memory.md`](../design-docs/event-log-as-memory.md)). |
| `issue_id`   | TEXT NULLABLE              | Tracker id; for traceability.                                                                         |
| `payload`    | TEXT NULLABLE              | JSON blob specific to the event type.                                                                 |
| `ts`         | TEXT NOT NULL              | ISO-8601 UTC.                                                                                         |

Index: `idx_log_events_run_id (run_id)`.

---

## Event types

Emitted by `SymphonyLogger.logEvent`:

- `run_started`
- `workspace_created`
- `workspace_destroyed`
- `workspace_destroy_error`
- `session_stop_error`
- `state_transition`
- `state_transition_error`
- `error`
- `run_finished`

Emitted implicitly via `recordTurn`:

- `turn_recorded` (on the JSONL side only; SQLite gets a `turns` row instead)

See [`../design-docs/event-schema-evolution.md`](../design-docs/event-schema-evolution.md)
for the rules on adding / removing event types.

---

## JSONL mirror

Every event above also writes a line to
`.symphony/logs/<runId>.jsonl` with the stable shape:

```json
{
  "ts": "ISO8601",
  "run_id": "uuid",
  "turn_id": "uuid or null",
  "event_type": "string",
  "issue_id": "string or null",
  "payload": { "..." }
}
```

The dual-write invariant is documented in
[`../design-docs/event-log-as-memory.md`](../design-docs/event-log-as-memory.md).

---

## Canonical DDL

```sql
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
```

`PRAGMA journal_mode = WAL;` is set at connection time.

---

## Regeneration

When `src/persistence/schema.ts` changes, update this doc in the same PR.
The doc-gardening eval (proposed) will fail on drift.
