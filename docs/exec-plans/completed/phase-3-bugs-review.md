# phase-3-bugs-review: Reliability hardening

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-18 · _Completed:_ 2026-04-18

## Why

A handful of edge cases — path traversal, concurrent writers, mid-run SIGINT,
crash cleanup — were untested but user-visible. Closing them was the
difference between a demo and a tool.

## Scope

In:

- Reject path-traversing issue identifiers; lock the env-var contract.
- Assert the logger survives two concurrent writers.
- Cover SIGINT mid-run with a cancellation test.
- Clean up workspace + tracker state on crash; fast-check scheduler property.

Out:

- Log rotation (still tech-debt).

## Plan (executed)

1. Add `assertSafeIdentifier` + `UnsafeIdentifierError`.
2. Write a concurrent-writer test against `SymphonyLogger`.
3. Add an orchestrator-crash test that asserts the finalizer fires.
4. Add a fast-check property test over arbitrary tracker sequences.

## Decision log

- 2026-04-18 — Orchestrator cleans up workspace + tracker state in a
  `finally`. New run status `cancelled` for the SIGINT path.
- 2026-04-18 — `WorkspaceManager` rejects identifiers not matching
  `/^[A-Za-z0-9_-]+$/` via `UnsafeIdentifierError`.

## Acceptance

- [x] `pnpm all` green.
- [x] Property test stable under fast-check default budget.

## Retrospective

- Adopting fast-check for the scheduler property caught a double-claim bug
  we would have shipped otherwise. The cost is ~50ms of eval time; it's
  paid for itself.
- The env-var contract freeze on hook scripts stopped a class of
  injection-ish bugs we'd been "planning to get to".

## Shipped artifacts

- `54d98ce` Crash cleanup + fast-check property.
- `04aec5a` SIGINT cancellation test.
- `c1e894a` Concurrent-writer assertion.
- `1e53cae` Identifier + env-var contract.
