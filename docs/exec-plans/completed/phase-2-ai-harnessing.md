# phase-2-ai-harnessing: Evals, replay, prompt versioning

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-18 · _Completed:_ 2026-04-18

## Why

Without a deterministic eval suite and versioned prompts, every prompt
change was a silent behavior change. Replay mattered because "what did the
agent do?" was the single most common operator question.

## Scope

In:

- Scenario fixture suite (rate-limit, turn-limit, crash, long-running).
- Eval suite (`pnpm eval`) wired into `pnpm all`.
- `symphony replay <run_id>` over SSE.
- Versioned prompt files referenced from `WORKFLOW.md`.
- Persist + surface the rendered prompt per turn.

Out:

- Doc-gardening eval (still proposed in
  [`../../design-docs/doc-gardening.md`](../../design-docs/doc-gardening.md)).

## Plan (executed)

1. Author scenario fixtures under `fixtures/scenarios/`.
2. Build `src/eval/scenarios.eval.ts` + `vitest.eval.config.ts`.
3. Build `src/replay.ts` + share API via `EventEmitter`.
4. Add `prompts/default-v1.md` + reference it from `WORKFLOW.md`.
5. Persist rendered prompt on each turn; expose via API.

## Decision log

- 2026-04-18 — Eval suite under `src/eval/*.eval.ts` with its own vitest
  config. `pnpm all` chains test + eval.
- 2026-04-18 — `crash` scenario introduced `throw: true` for mock agent.
- 2026-04-18 — Prompt files have their own YAML front matter with `version:`.
  Inline templates report `promptVersion: "inline"`.

## Acceptance

- [x] `pnpm all` green including eval.
- [x] `symphony replay <id>` works with --speed.

## Retrospective

- The rendered-prompt-on-turn row has been the single most useful
  debugging affordance so far. Every "why did it do that?" becomes a
  one-line SQL.
- The eval suite caught two regressions during refactors that unit tests
  wouldn't have.

## Shipped artifacts

- `770b9e7` Scenario fixture suite.
- `d956377` `pnpm eval` wired in.
- `f955252` `symphony replay`.
- `7912cc3` Versioned prompt files.
- `34f2f3b` Rendered prompt persistence.
