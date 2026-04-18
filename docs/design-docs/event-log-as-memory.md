# event-log-as-memory

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Agents running in a loop need to reason over prior runs: "did this test flake
before?", "has this issue been attempted?", "what was the exact prompt we
tried?". An orchestrator that only holds state in memory — or only exposes it
through a proprietary API — makes that reasoning infeasible.

## Decision

Every agent event is written twice, simultaneously, by `SymphonyLogger`:

1. A row in SQLite (`runs`, `turns`, `log_events`).
2. A line in JSONL at `.symphony/logs/<runId>.jsonl`.

This is a strict dual-write invariant. Every write method appends to both. A
crashed orchestrator loses at most one in-flight event (the one whose
JSONL append hadn't flushed); everything earlier is recoverable.

## Why both?

- **SQLite** is for structured queries. An agent loop can run
  `sqlite3 .symphony/symphony.db "select * from turns where content like '%flake%'"`
  without tooling.
- **JSONL** is for grep + replay. Every row is a self-contained JSON object
  so `rg "runStarted" .symphony/logs/*.jsonl` works without a DB connection.
- **Redundancy.** If the DB gets corrupt (unlikely, but it's a file on disk),
  the JSONL is a full replay source. If the JSONL gets truncated, the DB
  is authoritative.

## Schema in one screen

```
runs
  id PK
  issue_id, issue_identifier, issue_title
  status ∈ {running, completed, failed, max_turns, cancelled}
  started_at, finished_at
  scenario, prompt_version, prompt_source

turns
  id PK
  run_id FK → runs.id
  turn_number
  role ∈ {assistant, tool, user}
  content TEXT
  tool_calls TEXT (json)
  final_state TEXT
  rendered_prompt TEXT
  created_at

log_events
  id (auto)
  run_id FK → runs.id
  turn_id NULLABLE → turns.id
  event_type (stable string)
  issue_id NULLABLE
  payload (json)
  ts
```

See [`../generated/db-schema.md`](../generated/db-schema.md) for the
authoritative reference.

## JSONL line shape

```json
{
  "ts": "ISO8601",
  "run_id": "uuid",
  "turn_id": "uuid or null",
  "event_type": "string",
  "issue_id": "string or null",
  "payload": { ... }
}
```

`event_type` values currently in use are listed in
[`../DESIGN.md`](../DESIGN.md) §3.

## Retention

The CLI's `symphony prune --older-than <duration>` deletes runs + JSONL
files older than the cutoff. Prune is idempotent; running it twice is a
no-op.

No automatic retention runs today. That's deliberate: operators choose the
policy. Log rotation is tracked as tech debt in
[`../exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md).

## Concurrency

`better-sqlite3` is opened in WAL mode. Two Symphony processes writing to
the same DB do not corrupt it, but they should have disjoint run ids. Two
agents grabbing the same issue is prevented at the `claimed` set layer, not
the DB.

See [`../../src/persistence/logger.concurrent.test.ts`](../../src/persistence/logger.concurrent.test.ts).

## Consequences

- Agents running in a loop can build their own "memory" layer on top of the
  existing DB/JSONL without Symphony changing.
- Every feature that emits "internal" runtime state must route through
  `SymphonyLogger`. "Throwaway" in-memory state is a code smell.
- Schema changes are migrations. Add columns; don't reuse. Reads must tolerate
  `NULL` for columns the writer didn't set.
