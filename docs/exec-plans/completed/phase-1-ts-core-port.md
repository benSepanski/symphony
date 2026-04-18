# phase-1-ts-core-port: Port the core orchestrator to TypeScript

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-17 · _Completed:_ 2026-04-17

## Why

The Phase 0 scaffold had no runtime. This phase brought up the core feedback
loop: parser → tracker → agent → workspace → orchestrator → logger → API → UI.

## Scope

In:

- `WORKFLOW.md` parser (zod-validated YAML front matter).
- `MemoryTracker` + `MockAgent` + YAML scenarios.
- `SymphonyLogger` with dual SQLite + JSONL writes.
- `WorkspaceManager` (hook-driven).
- `Orchestrator` poll loop.
- CLI (`commander`) + Hono API.
- Vite + React + Tailwind dashboard.

Out:

- Real Linear / real `claude` wiring (Phase 4 real mode).
- Eval suite (Phase 2).

## Plan (executed)

1. Types first: `Tracker`, `Agent`, `AgentSession`.
2. Parser + schema under `src/config/`.
3. `MemoryTracker` → scenarios → `MockAgent`.
4. `SymphonyLogger` + Drizzle schema.
5. `WorkspaceManager` with hooks.
6. Orchestrator.
7. CLI + Hono API.
8. Vite + React + Tailwind dashboard.

## Decision log

- 2026-04-18 — Tailwind v4 via `@tailwindcss/vite`. React 19. Hash-based
  routing over React Router.
- 2026-04-18 — Scenarios are YAML — the delay + role + content shape is
  intentionally thin so agents can generate new scenarios mechanically.
- 2026-04-18 — `createServer` takes any `EventEmitter`, enabling replay to
  reuse the whole HTTP surface.

## Acceptance

- [x] `pnpm all` green (72 unit tests at phase close).
- [x] `pnpm dev WORKFLOW.md --mock` runs end to end.
- [x] Dashboard served from Hono at `/`.

## Retrospective

- Keeping mock mode as a first-class mode from day 1 paid off immediately;
  every later phase exercised real + mock with zero extra wiring.
- The `EventEmitter` seam between orchestrator and API was the single most
  useful abstraction we picked up.

## Shipped artifacts

- `5bbafc0` WORKFLOW.md parser.
- `d026612` MemoryTracker.
- `373e25e` MockAgent + scenarios.
- `9a08eb3` SymphonyLogger.
- `64ff62b` WorkspaceManager.
- `e8e802b` Orchestrator.
- `b32cc23` CLI + Hono API.
- `560be37` Vite + React + Tailwind dashboard.
