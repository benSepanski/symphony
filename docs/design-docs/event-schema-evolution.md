# event-schema-evolution

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

The event log (`runs`, `turns`, `log_events` + per-run JSONL) is the source
of truth. If the schema is a moving target, every reader — the dashboard,
`replay`, future agent memory layers — breaks simultaneously.

## Decision

- **Adding** a column, row type, or event type is additive and free.
- **Removing** requires a migration note + a deprecation period.
- **Renaming** is equivalent to remove + add.

Readers tolerate `NULL` for columns that weren't set by older writers.
Writers don't re-emit old event types after a deprecation.

## Procedure for a breaking change

1. Write a design note (could be right here as a new heading) describing
   the change, the set of known consumers, and the window.
2. In the first shipping PR:
   - Add the new column / type. Writers start writing both old and new.
   - Update readers to prefer the new field, fall back to the old.
3. In the follow-up PR (at least one week later):
   - Remove the old field from writers.
   - Add a migration for existing rows (if needed).
4. In the final PR:
   - Delete the old column / type entirely.
   - Remove the reader fallback.

No step is allowed to be merged without passing `pnpm all` on its own.

## Naming rules

- Event type strings are lowercase, snake-cased, and describe a past-tense
  thing that happened: `run_started`, `workspace_created`. Errors use an
  `_error` suffix: `state_transition_error`.
- New run statuses are lowercase words: `completed`, `failed`, `max_turns`,
  `cancelled`. Add them to the union in
  [`src/orchestrator.ts`](../../src/orchestrator.ts) _and_ update
  `SymphonyLogger.finishRun` acceptance + the dashboard status legend.

## What not to do

- Don't overload a field's meaning. "payload" may be `null` or any JSON; do
  not start using a magic string like `"__deleted__"` to mean something
  special.
- Don't alter a column type in place. Drop + add (with migration) is the only
  safe path.
- Don't change the JSONL line shape for already-emitted events. Consumers
  cache.

## Current shape

As of 2026-04-18, see [`event-log-as-memory.md`](event-log-as-memory.md)
§"Schema in one screen" and [`../generated/db-schema.md`](../generated/db-schema.md).
