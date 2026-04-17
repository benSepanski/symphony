# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Parser, memory tracker, mock agent, logger, and
workspace manager all done. Orchestrator is next.

## Last checkpoint

Workspace manager (commit pending at HEAD after the next `git commit`):

- `src/workspace/manager.ts` — `WorkspaceManager` creates
  `<root>/<issue.identifier>` directories, runs the `after_create` /
  `before_remove` hooks with `ISSUE_*` env vars set, and `rm -rf`s the
  directory on `destroy`. Hooks shell out to `bash -eu -c` with a
  bounded timeout (default 300s, overridable). Hook failures raise a
  `HookError` carrying stderr + exit code.
- `src/workspace/manager.test.ts` — 5 cases: directory creation,
  after_create sees env vars, before_remove runs before deletion,
  HookError on non-zero exit, `list()` is sorted.
- `src/index.ts` re-exports `WorkspaceManager` + `HookError`.

Prior checkpoints:

- `9a08eb3` — Add SymphonyLogger writing both SQLite and JSONL.
- `373e25e` — Add MockAgent that replays scripted YAML scenarios.
- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 6 — **orchestrator**:

1. Implement `src/orchestrator.ts`. Takes a `Tracker`, an `Agent`, a
   `WorkspaceManager`, a `SymphonyLogger`, and a `ParsedWorkflow`. Core
   loop on an interval (`polling.interval_ms`):
   - call `tracker.fetchCandidateIssues()`
   - for each returned issue not already claimed, spin up a run up to
     `agent.max_concurrent_agents`
   - per run: create workspace, render prompt template via Liquid, start
     an `AgentSession`, loop `runTurn` until `isDone()` or turn cap is
     reached, writing every turn/event through the logger, transitioning
     tracker state on `finalState`, and tearing down the workspace at
     the end.
2. Expose an `EventEmitter`-style interface so the HTTP layer can fan
   events out over SSE. At minimum: `runStarted`, `turn`, `runFinished`.
3. Tests: use `MemoryTracker` + `MockAgent` + a `WorkspaceManager` under
   a `mkdtemp` root + an in-memory logger. Drive a full simulated run
   and assert (a) tracker ends in the expected state, (b) logger
   records the full event sequence, (c) workspace is torn down.
4. `pnpm all` green; commit.

Subsequent checkpoints:

- `api/server.ts` (Hono) — SSE `/api/events`, REST `/api/runs`,
  `/api/runs/:id`, `/api/runs/:id/events`. Serve the built web bundle.
- `web/` — Vite + React + Tailwind. Add `vite`, `@vitejs/plugin-react`,
  `react`, `react-dom`, `tailwindcss` devDeps at that point.
- Wire `cli.ts` to boot everything in mock mode on
  `pnpm dev WORKFLOW.md --mock`. **This is the Phase 1 gate.**
- Finally `tracker/linear.ts` + `agent/claude-code.ts` for real mode.

## Open issues / deferred

- `PROGRESS.md` screenshot gallery (Phase 4) — not yet started.
- Eval harness under `pnpm eval` (Phase 2) is a placeholder — `package.json`
  wires `eval` to `vitest run --project eval` but Vitest is not configured
  with projects yet. Revisit when reaching Phase 2.
- `prompts/` and `fixtures/scenarios/` directories exist but are empty.
- No `.env.example` yet. CLAUDE.md references one — create when wiring up
  the real Linear tracker.
- `Makefile` mentioned in the plan not yet created; low priority since the
  `pnpm` script surface is sufficient.
- `worktrees/` still contains leftover BEN-\* directories from the old Elixir
  runtime. Safe to ignore (they're in `.gitignore`).

## Decisions log

- **2026-04-17** — Runtime is Node 22 via `mise`, package manager is pnpm via
  corepack. Persistence is SQLite (Drizzle). HTTP is Hono. Web UI is Vite +
  React + Tailwind. Tests are Vitest.
- **2026-04-17** — Single-package repo at root (no monorepo). Agents navigate
  one tsconfig / one `src/` tree.
- **2026-04-17** — `pnpm test` uses `--passWithNoTests` during bootstrap so
  the CI gate stays green before any tests exist. Keep this flag; the gate
  still fails on real test failures.
- **2026-04-17** — ESLint configured to allow `_`-prefixed unused args/vars
  (standard TS convention).
