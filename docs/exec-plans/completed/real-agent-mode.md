# real-agent-mode: LinearTracker + ClaudeCodeAgent

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-18 · _Completed:_ 2026-04-18

## Why

Up to this point Symphony only ran in mock mode. This phase closed the gap
from "demo" to "real".

## Scope

In:

- `LinearTracker` — GraphQL client against `api.linear.app`.
- `ClaudeCodeAgent` — spawns `claude --output-format stream-json --print`,
  surfaces assistant/tool_result messages as `AgentTurn`s.
- Wire real mode into the CLI, failing fast if `LINEAR_API_KEY` is missing.
- Rewrite `README.md` for the TypeScript stack.

Out:

- Live smoke test (requires a real key + project; tracked as a next-context
  action in `PROGRESS.md`).

## Plan (executed)

1. Build `LinearTracker`: types, issues query, mutation for state update,
   mutation for comments, per-team workflow state cache.
2. Build `ClaudeCodeAgent`: spawn child, stream-json parse,
   promise-resolver queue for runTurn.
3. `cli.ts` selects real-vs-mock wiring based on `agent.kind` / `--mock`.
4. Update `README.md`.

## Decision log

- 2026-04-18 — `LinearTracker` caches per-team workflow state map so
  repeated transitions only fetch the map once.
- 2026-04-18 — `ClaudeCodeAgent` treats unparseable JSON lines as drops
  (not panics) to survive occasional stream-JSON oddities.
- 2026-04-18 — Dropped `mise` in favor of `.nvmrc` + `corepack` to shrink
  the install path.

## Acceptance

- [x] `pnpm all` green — 72 unit tests + 5 evals.
- [x] `pnpm dev WORKFLOW.md` fails fast on missing `LINEAR_API_KEY`.

## Retrospective

- The stream-json parser was the hardest part. The "promise-resolver queue"
  pattern (push → resolve; pull → pending) felt ad-hoc; it's captured in
  `toAgentTurn` as a pure function for testability.
- Linear's GraphQL schema shape (`project.slugId.eq`) is brittle and under-
  documented. Added it to the QUALITY_SCORE gaps.

## Shipped artifacts

- `c6c08dc` LinearTracker.
- `221980d` ClaudeCodeAgent + CLI wiring.
- `9d9a230` README rewrite.
- `f92eb08` Pin the LinearTracker empty-apiKey guard test.
- `d70cac6` Drop mise + cloud-setup.sh; pin Node via .nvmrc.
