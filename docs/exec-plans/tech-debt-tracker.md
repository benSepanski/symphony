# tech-debt-tracker

Registry of known debt that is not currently on anyone's plate. Each row has
an owner (the domain that would most naturally adopt it). Agents hitting a
workaround should append a row before moving on. The doc-gardening eval
(proposed) will fail when this tracker is stale or orphaned.

## Format

| Date       | Area   | Debt             | Severity   | Owner       | Remediation sketch  |
| ---------- | ------ | ---------------- | ---------- | ----------- | ------------------- |
| YYYY-MM-DD | domain | one-line summary | low/med/hi | file/module | what would close it |

## Open

| Date       | Area        | Debt                                                                                               | Severity | Owner                       | Remediation sketch                                                                                               |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------- | -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-04-18 | docs        | doc-gardening eval proposed but not implemented.                                                   | med      | `src/eval/`                 | Build `src/eval/doc_gardening.eval.ts` per [`../design-docs/doc-gardening.md`](../design-docs/doc-gardening.md). |
| 2026-04-18 | tracker     | Linear GraphQL schema drift (`project.slugId.eq`, workflowStates nesting) is unguarded by evals.   | med      | `src/tracker/linear.ts`     | Add a fixture-backed eval that asserts the current Linear query shape against a local JSON snapshot.             |
| 2026-04-18 | api         | `/api/events` SSE has no backpressure test.                                                        | low      | `src/api/server.test.ts`    | Drive the stream with a slow consumer; assert bounded buffer.                                                    |
| 2026-04-18 | api         | `/api/search` is naive `LIKE %q%`. No pagination / ranking.                                        | low      | `src/persistence/logger.ts` | Add FTS5 once result volumes warrant it.                                                                         |
| 2026-04-18 | web         | No component tests (no jsdom + testing-library). Behavior asserted only via API layer + manual QA. | med      | `src/web/`                  | Add `@testing-library/react` + `jsdom`; pin the four routes.                                                     |
| 2026-04-18 | web         | Visual QA flow is manual. No automated browser walkthrough.                                        | low      | `.github/media/`            | Add a browser MCP task that captures screenshots into `.github/media/`.                                          |
| 2026-04-18 | prompts     | No lint for undefined liquid vars in prompt files.                                                 | low      | `src/config/workflow.ts`    | During parse, render the template against a well-known context skeleton and fail on missing refs.                |
| 2026-04-18 | persistence | No log rotation; `.symphony/logs/` grows unbounded until manual prune.                             | low      | `src/persistence/logger.ts` | Add size-capped rotation or wire `prune` into a long-run heuristic.                                              |
| 2026-04-18 | security    | No eval asserting `LINEAR_API_KEY` is absent from the DB + JSONL.                                  | low      | `src/eval/`                 | Add a scenario that seeds the env and greps the logs.                                                            |

## Resolved (archive)

_Move rows here when the debt ships a regression guard._

| Date resolved | Date filed | Debt                                                           | Resolved by                                                                                                             |
| ------------- | ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-04-20    | 2026-04-18 | Leftover `worktrees/BEN-*` from old Elixir runs.               | Directory no longer present in the repo; no regression guard added (won't recur by design).                             |
| 2026-04-23    | 2026-04-18 | Layer-direction rule is review-only; no automatic graph check. | [`src/arch.test.ts`](../../src/arch.test.ts) walks `src/` and fails on any forward-only break.                          |
| 2026-05-02    | 2026-04-18 | `serve({ fetch, port })` does not explicitly bind `127.0.0.1`. | [`src/cli.ts`](../../src/cli.ts) now defaults `--bind` to `127.0.0.1` and threads `hostname` into both `serve()` calls. |
