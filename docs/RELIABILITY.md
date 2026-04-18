# docs/RELIABILITY.md

Reliability invariants Symphony must preserve. Every line here is backed by at
least one test; every test lives under `src/**/*.test.ts` or
`src/eval/*.eval.ts`. When you change behavior covered below, update _both_
this doc and the test.

---

## 1. One issue is claimed by at most one run

`Orchestrator.claimed: Set<string>` protects the invariant inside a single
process. The claim is released in a `finally` block so a crashing run still
releases its slot.

Covered by:

- [`src/orchestrator.test.ts`](../src/orchestrator.test.ts) — "does not double-claim an in-flight issue".
- [`src/orchestrator.property.test.ts`](../src/orchestrator.property.test.ts) — fast-check property over arbitrary tracker sequences.

Not yet covered: cross-process safety (two Symphony instances polling the
same Linear project). Today that is prevented by operational rule only.

## 2. A crashing run does not leak workspace state

The run finalizer always:

1. Stops the agent session (`session.stop()`), logging `session_stop_error` if
   `stop` throws.
2. Transitions the tracker to `max_turns_state` (default `Blocked`) when no
   explicit `finalState` was reached.
3. Calls `WorkspaceManager.destroy(issue)`, which runs `before_remove` and
   then removes the directory.
4. Writes `run_finished` with the correct terminal status.

Even if step 2 or 3 throws, step 4 still fires, so no run is orphaned in a
`running` state.

Covered by: [`src/orchestrator.test.ts`](../src/orchestrator.test.ts) —
"finalizer runs on crash", "finalizer runs on SIGINT".

## 3. SIGINT is a graceful drain, not a kill

`cli.ts` wires `SIGINT` and `SIGTERM` to `orchestrator.stop()`, which:

- sets `shuttingDown = true` so the poll loop stops starting new runs,
- awaits the in-flight tick promises so they can transition cleanly,
- marks their status as `cancelled`.

The status `cancelled` is a separate terminal from `failed` because a
cancellation is expected (the operator asked for it), not a bug.

Covered by: [`src/orchestrator.test.ts`](../src/orchestrator.test.ts) — "cancelled is the SIGINT status".

## 4. The logger is safe under concurrent writers

`SymphonyLogger` uses `better-sqlite3` with `journal_mode = WAL` and writes
JSONL via `openSync(path, "a") + appendFileSync`. Two orchestrator processes
writing the same run id will both succeed (rows are UUIDs; JSONL is
append-only with fresh fds per append).

Covered by: [`src/persistence/logger.concurrent.test.ts`](../src/persistence/logger.concurrent.test.ts).

## 5. Replay reconstructs exactly what ran

`createReplayEmitter(runId, logger)` produces an `EventEmitter` that emits the
same `runStarted`, `turn`, `runFinished` sequence the orchestrator did,
ordered by `(turns.turn_number, log_events.id)`. The HTTP server accepts any
`EventEmitter`, so live and replay share the same API code path.

Covered by: [`src/replay.test.ts`](../src/replay.test.ts).

## 6. Prompt rendering is deterministic

`Liquid.parseAndRender(template, { issue, attempt })` has no randomness. The
same template + context yields the same rendered string. The rendered text is
persisted on the turn row so a future agent can audit it.

Covered by: the eval suite (`src/eval/scenarios.eval.ts`) — changes to
prompts re-render and must produce identical transcripts.

## 7. Rate-limit backoff and retry

Mock scenarios cover the rate-limit case; the real `ClaudeCodeAgent` does not
retry internally — if `claude` exits non-zero, the session surfaces the
stderr tail and the finalizer transitions the issue to `max_turns_state`. If
you need in-session retry, file a design note; don't add `while(true) try` to
the agent.

Covered by: [`src/agent/mock.test.ts`](../src/agent/mock.test.ts) — rate-limit
scenario exhausts without panic.

## 8. Hook scripts are bounded

`WorkspaceManager` runs hooks with `execFileAsync("bash", ["-eu", "-c", ...])`
under a 5-minute timeout (`hookTimeoutMs`) and a 10 MiB stdout cap. A hook
that times out surfaces as `HookError` with `exitCode: null` and the tail of
stderr.

Covered by: [`src/workspace/manager.test.ts`](../src/workspace/manager.test.ts).

## 9. Max turns is a hard ceiling

`workflow.config.agent.max_turns` (default `10`) bounds per-session turn
count. When exceeded, status = `max_turns` and the tracker moves to
`max_turns_state` (default `Blocked`). The session's `stop()` is always
called.

Covered by: turn-limit scenario in the eval suite.

## 10. Pruning is idempotent

`symphony prune --older-than 30d` deletes `runs`, `turns`, `log_events`, and
the per-run JSONL file inside a single sqlite transaction. A repeat run is a
no-op.

Covered by: `src/persistence/logger.test.ts` — prune fixtures.

---

## Reliability gaps

Logged in [`exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md).
Resolving them improves Quality Grades in
[`QUALITY_SCORE.md`](QUALITY_SCORE.md).
