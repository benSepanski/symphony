# phase-0-scaffold: Scaffold the TypeScript rewrite

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-17 · _Completed:_ 2026-04-17

## Why

The prior Elixir implementation was slowing iteration; we moved to Node 22 +
TypeScript + pnpm to get a single-language stack + a faster test loop.

## Scope

In:

- Delete the Elixir tree.
- Scaffold Node 22, pnpm via corepack, TypeScript strict, ESLint, Prettier.
- Hono HTTP skeleton on port 4000.

Out:

- Actually implementing the orchestrator (deferred to Phase 1).

## Plan (executed)

1. Delete the Elixir implementation.
2. Add `package.json`, `tsconfig.json`, ESLint + Prettier.
3. Introduce `pnpm all` gate (typecheck + fmt:check + lint + test).
4. Stand up the Hono server as the canonical entry.

## Decision log

- 2026-04-17 — Runtime pinned to Node 22 via `.nvmrc`.
- 2026-04-17 — Single-package repo at root (no monorepo).
- 2026-04-17 — Hono chosen over Express / Fastify for low-allocation + tiny
  import surface.

## Acceptance

- [x] `pnpm all` green.
- [x] Checkpoint row in [`PROGRESS.md`](../../../PROGRESS.md).

## Retrospective

- Clean delete of the Elixir tree was straightforward — no cross-history
  graft needed.
- Keeping Node 22 + pnpm was the right call; corepack meant zero-install
  onboarding on the operator machine.

## Shipped artifacts

- `321edf4` — delete Elixir, scaffold TS rewrite.
