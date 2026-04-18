# execution-model

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

The orchestrator has to coordinate a tracker, an agent, a workspace manager,
and a logger without losing events when any of them fail. A reader scanning
[`src/orchestrator.ts`](../../src/orchestrator.ts) needs a map of the happy
path and the error paths; this is that map.

## The happy path

```
Orchestrator.start()                        ┐
   └─► setInterval(tick, interval_ms)       │  poll loop
                                            │
Orchestrator.tick()                         │
   ├─ Tracker.fetchCandidateIssues()        │
   ├─ drop claimed ids                      │
   ├─ take(min(issues, capacity))           │
   └─► Promise.all(issues.map(runIssue))    ┘

Orchestrator.runIssue(issue)
   ├─ liquid-render initialPrompt
   ├─ Logger.startRun(...)                         → row + JSONL event
   ├─ emit("runStarted", ...)
   ├─ Workspace.create(issue)                      → after_create hook
   ├─ Logger.logEvent({ type: "workspace_created" })
   ├─ Agent.startSession({ workdir, prompt, ... })
   ├─ loop while !session.isDone()
   │     ├─ bail if shuttingDown → status = "cancelled"
   │     ├─ bail if turnsTaken >= max_turns → status = "max_turns"
   │     ├─ liquid-render per-attempt prompt (attempt > 1 only)
   │     ├─ session.runTurn()
   │     ├─ Logger.recordTurn(...)                 → row + JSONL event
   │     ├─ emit("turn", ...)
   │     └─ capture finalState from turn
   ├─ finally:
   │    ├─ session.stop()  (log session_stop_error on throw)
   │    ├─ Tracker.updateIssueState(finalState or max_turns_state)
   │    ├─ Logger.logEvent({ type: "state_transition" })
   │    ├─ Workspace.destroy(issue)                → before_remove hook
   │    ├─ Logger.logEvent({ type: "workspace_destroyed" })
   │    ├─ Logger.finishRun(runId, status)
   │    ├─ emit("runFinished", ...)
   │    └─ claimed.delete(issue.id)
```

## Error paths

| Failure                     | Status                   | Event emitted               | Tracker state                 | Workspace destroyed? |
| --------------------------- | ------------------------ | --------------------------- | ----------------------------- | -------------------- |
| `Agent.startSession` throws | `failed`                 | `error`                     | `max_turns_state`             | best-effort          |
| `session.runTurn()` throws  | `failed`                 | `error`                     | `max_turns_state`             | yes                  |
| `session.stop()` throws     | whatever was already set | `session_stop_error`        | whatever was already intended | yes (best-effort)    |
| Tracker transition throws   | unchanged                | `state_transition_error`    | unchanged                     | yes                  |
| Workspace destroy throws    | unchanged                | `workspace_destroy_error`   | whatever was intended         | no (logged)          |
| Operator sends SIGINT       | `cancelled`              | none extra                  | `max_turns_state`             | yes                  |
| Max turns exceeded          | `max_turns`              | (implicit — `run_finished`) | `max_turns_state`             | yes                  |

The finalizer is a single `finally` block. Every error path terminates
through it; the `claimed` set is always released.

## Concurrency

- `max_concurrent_agents` (default `1`) caps the `claimed` set.
- Within one run, turns execute serially — the session owns the child.
- `tick()` may discover more candidate issues than capacity; the surplus is
  simply skipped and picked up on the next poll.
- Two `tick()` calls never interleave on the same issue id because the
  `claimed` set is checked + mutated synchronously inside `runIssue`'s first
  two statements.

See [`src/orchestrator.property.test.ts`](../../src/orchestrator.property.test.ts)
for a fast-check property that asserts no double-claim across arbitrary
tracker sequences.

## Polling

`setInterval(interval_ms)` drives the clock. The interval timer is
`unref`'d so it never keeps the process alive past the SIGINT drain.
`shuttingDown = true` is the only way to stop enrolling new work — the
interval is cleared and in-flight ticks are awaited in `stop()`.

## Cancellation

SIGINT / SIGTERM → `cli.ts` calls `orchestrator.stop()`:

```
stop():
  shuttingDown = true
  clearInterval(pollTimer)
  await Promise.allSettled(inflightTicks)
```

Because the run loop reads `shuttingDown` before each turn, cancellation is
effective within one turn's worth of latency. Each in-flight run still
finalizes (state transition, workspace destroy, run_finished) so no
state is leaked.

## Replay

[`createReplayEmitter`](../../src/replay.ts) reads the runs/turns/log_events
tables for a single `runId`, sorts them, and emits them on a fresh
`EventEmitter` with delays scaled by `speed`. The API server accepts any
`EventEmitter`, so live and replay share every byte of the HTTP surface. See
[`replay-as-a-mirror.md`](replay-as-a-mirror.md).

## What this commits us to

- Adding a new terminal status is additive: update `RunFinishedEvent["status"]`,
  the finalizer comment, and `src/persistence/logger.ts`'s acceptance.
- Adding a new event type is additive: pick a stable name, call
  `Logger.logEvent`, update the consumers that care (the dashboard treats
  unknown types as pass-through).
- Removing a turn or event type is a migration. See
  [`event-schema-evolution.md`](event-schema-evolution.md).
