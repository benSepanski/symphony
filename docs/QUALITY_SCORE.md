# docs/QUALITY_SCORE.md

A rolling, per-domain quality grade. Agents consult this file before taking a
change inside a domain so they know where the foot-guns are; they update it
after landing a change that moves the grade.

Grades are deliberately coarse. Movement matters more than precision.

- **A** — coherent with the layered architecture, typed end-to-end, covered by
  unit + eval tests, low-surface for drift.
- **B** — shipping quality, but has a known soft spot flagged in "gaps".
- **C** — works, but has more tech debt than it has principles; a drift risk.
- **D** — known to be brittle; a design note is required before extension.

_Last regraded:_ 2026-04-20
_Regraders:_ promoted manually for now; doc-gardening bot will take over.

---

## Domain grades

| Domain       | Grade | Notes                                                                                                                                                                  |
| ------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracker      | B     | `LinearTracker` is typed and cached, but its GraphQL filter fields (`project.slugId.eq`, workflowStates nesting) historically drift on Linear's side — see gaps below. |
| Agent        | A     | Both `ClaudeCodeAgent` and `MockAgent` sit behind the same `Agent` interface; turn streaming is deterministic under `toAgentTurn`.                                     |
| Workspace    | A     | `assertSafeIdentifier` closes the path-traversal surface; hooks are timeout-bounded and run via explicit `execFile("bash")`.                                           |
| Orchestrator | A     | Finalizer pattern covers cancellation + failure + max_turns; concurrency is property-tested under `orchestrator.property.test.ts`.                                     |
| Persistence  | A     | Dual-write (SQLite + JSONL) is invariant-enforced by `SymphonyLogger`. WAL mode is on. Prune path is covered.                                                          |
| API          | B     | `/api/events` SSE has no backpressure test; `/api/search` uses a LIKE scan (fine for <10k events, revisit at scale).                                                   |
| Web UI       | C     | No component test suite today. Relies on API-layer tests + manual mock-mode QA.                                                                                        |
| Prompts      | B     | Versioned, rendered-per-turn, persisted. Missing: a lint that fails when a prompt references an undefined liquid variable.                                             |
| Usage        | B     | `ClaudeOAuthUsageChecker` has good error handling and tests, but the OAuth endpoint is undocumented and unsupported — see gaps below.                                  |
| Eval         | B     | Five scenarios cover happy path, rate limit, turn limit, crash, long running. Missing: Linear GraphQL schema drift scenario.                                           |
| Docs         | B     | This harness-engineering rewrite just landed. The doc-gardening job is specified but not yet implemented.                                                              |
| Self-update  | B     | `GitSelfUpdater` is DI-friendly, throttled, fetch-only, and tested. Gap: results aren't persisted to `log_events`, so the dashboard can't render a history.            |

---

## Gaps (open)

| Domain      | Gap                                                                                | Severity | Filed in                                                  |
| ----------- | ---------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| Tracker     | Linear GraphQL schema drift not covered by evals.                                  | med      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| API         | SSE backpressure untested.                                                         | low      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| API         | `/api/search` is `LIKE %q%`; no pagination / ranking.                              | low      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| Web UI      | No component tests (jsdom + testing-library not installed).                        | med      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| Prompts     | No lint for undefined liquid vars in prompt files.                                 | low      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| Usage       | Claude Code OAuth endpoint is undocumented and may change without notice.          | med      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| Docs        | doc-gardening eval specified (`design-docs/doc-gardening.md`) but not implemented. | med      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |
| Self-update | Fetch results aren't persisted; dashboard can't show a history strip.              | low      | [`tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md) |

## Gaps (resolved, archive)

_None in the current cycle. Move rows here when the gap ships + lands a
regression test._

---

## How to update this file

1. Land the change.
2. Decide whether the grade moved (up, down, same). A grade moves when:
   - **Up**: a gap was closed and a regression guards it.
   - **Down**: a new foot-gun shipped and we know about it (rare; usually a
     gap addition is enough).
3. Edit the row above. Change "Last regraded".
4. Add or remove rows in the gaps table.

The doc-gardening eval (once live) will fail when `Last regraded` is older
than 30 days _and_ non-trivial changes have landed in the domain.
