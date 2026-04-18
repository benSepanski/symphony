# golden-principles

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

The mechanical rules every PR is graded against. These are the "golden
principles" OpenAI's harness engineering post describes: opinionated, fine-
grained, and (where possible) enforced by the `pnpm all` gate.

Each rule has an **enforcement** — automatic, review, or doc-gardening. Rules
marked _review_ are not yet mechanized; file a tech-debt row to automate them.

---

## Architecture

1. **Layer direction is forward-only.**
   Enforcement: review + static graph check in
   `src/orchestrator.test.ts` / `tests/arch.test.ts`. Imports across
   `Types → Config → Persistence → Service → Runtime → API` only point
   downstream.

2. **Providers through injection only.**
   Enforcement: review. Any `spawn`, `fetch`, `Database`, clock, or RNG
   reference outside the Runtime layer must be a constructor parameter with
   a default.

3. **No global singletons.**
   Enforcement: review. The orchestrator and CLI construct every service;
   no module exports a live instance.

4. **No raw SQL outside `src/persistence/`.**
   Enforcement: review + eslint rule (TODO). All callers go through
   `SymphonyLogger`'s typed methods.

5. **No shell from agent code.**
   Enforcement: review. Only `WorkspaceManager.runHook` calls `bash -eu -c`.
   Everything else uses `spawn(cmd, [...args])`.

## Typing

6. **Parse at the boundary, trust inside.**
   Enforcement: review + `tsc --noEmit` (strict mode). External JSON/YAML
   passes through a zod schema or a typed parser (`toAgentTurn`).

7. **No `as any`, no `@ts-ignore` without a comment.**
   Enforcement: eslint + review. If an escape hatch is truly needed, the
   one-liner above it explains _why_.

8. **Validate issue identifiers before filesystem or shell use.**
   Enforcement: `assertSafeIdentifier` + `workspace/manager.test.ts`.

## Observability

9. **Every meaningful runtime moment emits an event.**
   Enforcement: review. See [`../DESIGN.md`](../DESIGN.md) §3.

10. **Dual-write SQLite + JSONL.**
    Enforcement: `SymphonyLogger` invariant; every method that writes a row
    also writes a JSONL line.

11. **Errors are events, not panics.**
    Enforcement: review. Any expected failure (Linear returning `errors:
[...]`, `claude` non-zero exit, hook timeout) surfaces as an event with a
    `*_error` type, not an unhandled rejection.

## Testing

12. **Mock mode must exercise every feature.**
    Enforcement: `pnpm eval`. New behavior comes with a scenario under
    `fixtures/scenarios/` or an explicit gap row in
    `docs/QUALITY_SCORE.md`.

13. **Tests are deterministic.**
    Enforcement: review + `vitest.config.ts` sets `testTimeout`. No real
    `setTimeout` waits — use the injected `Sleeper`.

14. **Every bug fix ships with a regression.**
    Enforcement: review. The PR description links the test that fails
    before the fix.

## Docs

15. **A cross-layer change updates `ARCHITECTURE.md`.**
    Enforcement: doc-gardening (planned) + review.

16. **A new domain gets a product spec.**
    Enforcement: doc-gardening (planned) + review.

17. **A grade movement updates `QUALITY_SCORE.md`.**
    Enforcement: doc-gardening (planned). If the grade moved, the table must
    change in the same PR.

18. **Stale "Last reviewed" stamps on design notes trigger a regrade.**
    Enforcement: doc-gardening (planned). Notes older than 90 days flag for
    review.

19. **No `TODO` without a tracker row.**
    Enforcement: review + `rg 'TODO\\(' --no-filename`. Every `TODO(<slug>)`
    matches a row in [`../exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md).

## Git + PR discipline

20. **Never skip hooks.**
    Enforcement: `PROGRESS.md` + this doc. `--no-verify`, `--no-gpg-sign`,
    `no-commit-verify` are banned. Fix the hook, don't bypass it.

21. **Short-lived PRs.**
    Enforcement: review. If a PR diff exceeds ~500 lines net (excluding
    docs), justify in the description.

22. **The `land` skill is the only merge path.**
    Enforcement: review. Never squash-merge manually; `.codex/skills/land`
    owns the mergeability + review handshake.

23. **Commit messages describe _why_.**
    Enforcement: review. Git subject = imperative; body = motivation, not
    a diff summary.

---

## How to add a new principle

1. Propose it in `docs/design-docs/<slug>.md` under `proposed`.
2. Show the drift it prevents (an example PR or bug).
3. Automate: write the lint / test / eval.
4. Move the design note status to `active` and add the row here.

A principle that cannot be automated is called _taste_. Taste belongs in
review notes. This file is only for rules agents can uphold on their own.
