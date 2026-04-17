# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Core complete. `pnpm dev WORKFLOW.md --mock`
runs a full simulated agent end-to-end over HTTP. Next: the web UI.

## Last checkpoint

API + CLI wiring (commit pending at HEAD after the next `git commit`):

- `src/api/server.ts` — Hono app exposing `GET /api/runs`,
  `GET /api/runs/:id` (run + turns + events), `GET /api/events` (SSE
  stream piped from orchestrator events), and a placeholder `/` HTML
  page until the Vite bundle lands.
- `src/api/server.test.ts` — 4 cases over the Hono `app.request` test
  helper: list runs, fetch one by id, 404 on unknown id, `/` serves
  HTML.
- `src/cli.ts` — wired up. Parses WORKFLOW.md, seeds a MemoryTracker
  with two demo issues in mock mode, loads scenarios from
  `fixtures/scenarios/` (path overridable via `mock.scenarios_dir`),
  constructs WorkspaceManager / SymphonyLogger / Orchestrator, serves
  over Hono (`@hono/node-server`), SIGINT/SIGTERM trigger a clean
  shutdown. Real-agent mode still throws — deliberate until
  `tracker/linear.ts` + `agent/claude-code.ts` land.
- In mock mode, workspace hooks are stripped (they assume real git
  worktree plumbing that doesn't exist in scripted-scenario runs).
- Smoke test (ran locally, not committed):
  `rm -rf .symphony && pnpm dev WORKFLOW.md --mock --port 4321`
  then `curl /api/runs` → returns one completed DEMO-1 run with 5
  turns, ending in `Human Review`. `.symphony/symphony.db` + JSONL
  populated as expected.

**Phase 1 gate: passed.** `symphony --mock ./WORKFLOW.md` boots,
simulates a full agent run end-to-end, HTTP endpoints show it, SQLite

- JSONL contain the trace.

Prior checkpoints:

- `e8e802b` — Add Orchestrator that drives a mock-mode run end to end.
- `64ff62b` — Add WorkspaceManager that owns per-issue worktree directories.
- `9a08eb3` — Add SymphonyLogger writing both SQLite and JSONL.
- `373e25e` — Add MockAgent that replays scripted YAML scenarios.
- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 8 — **web UI** (final Phase 1 piece):

1. Add `src/web/` — Vite + React + TS + Tailwind, separate `tsconfig`
   (JSX) so server and web share the repo root but not compiler flags.
2. Package additions (`pnpm add -D`): `vite`, `@vitejs/plugin-react`,
   `react`, `react-dom`, `@types/react`, `@types/react-dom`,
   `tailwindcss`, `postcss`, `autoprefixer`.
3. Three routes (React Router or simple hash routing):
   - Dashboard — list of runs (polls `/api/runs` or listens on SSE);
     each row: identifier, title, state, last turn content, status.
   - Run detail — single run with a timeline of turns + events, and
     a live tail if the run is still active.
   - Log search — text-filtered view over all events (SQLite
     `content LIKE '%q%'` behind an endpoint).
4. Add Vite build to `pnpm build`. Hono app serves the built assets
   via `serveStatic` at `/` (replacing the placeholder).
5. Smoke: `pnpm dev WORKFLOW.md --mock`, open `localhost:4000`, watch
   a run stream in.
6. `pnpm all` green; commit. **This is the Phase 1 gate for the
   "watchable" smoke test** per the plan.

Subsequent phases:

- Phase 2 — AI harnessing: eval harness under `pnpm eval`, scenario
  suite (rate-limit, turn-limit, crash, long-running), prompt
  versioning, `symphony replay <run_id>`.
- Phase 3 — Bug + test review (fast-check for the scheduler, error
  paths).
- Phase 4 — UI polish loop with the Claude-in-Chrome MCP.
- Finally `tracker/linear.ts` + `agent/claude-code.ts` for real mode.

## Open issues / deferred

- `PROGRESS.md` screenshot gallery (Phase 4) — not yet started.
- Eval harness under `pnpm eval` (Phase 2) is a placeholder — `package.json`
  wires `eval` to `vitest run --project eval` but Vitest is not configured
  with projects yet. Revisit when reaching Phase 2.
- `prompts/` is empty. `fixtures/scenarios/` has `happy-path.yaml`; the
  plan calls for `rate-limit.yaml`, `turn-limit.yaml`, `crash.yaml`,
  `long-running.yaml` — add as we hit Phase 2.
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
