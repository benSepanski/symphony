# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** All non-HTTP/UI primitives done. Next: API +
CLI wiring so mock mode runs end-to-end, then web UI.

## Last checkpoint

Orchestrator (commit pending at HEAD after the next `git commit`):

- `src/orchestrator.ts` — `Orchestrator` ties Tracker + Agent +
  WorkspaceManager + SymphonyLogger together. `start()` kicks a poll
  loop on `polling.interval_ms`; `tick()` fetches candidate issues,
  respects `agent.max_concurrent_agents`, renders the Liquid prompt
  per issue, creates the workspace, walks the session through every
  turn, writes every event via the logger, applies the requested
  `final_state` tracker transition, tears down the workspace, and
  emits `runStarted` / `turn` / `runFinished` events for downstream
  consumers. Honors `max_turns` + `max_turns_state`. Catches per-run
  errors and reports them as `failed` runs (rather than crashing the
  whole orchestrator). `stop()` waits for in-flight ticks.
- `src/orchestrator.test.ts` — 5 cases: full happy-path run
  (tracker state, logger rows, event order, workspace cleanup);
  no-transition scenario leaves state alone; max_turns cap; concurrent
  agent cap; Liquid prompt renders with issue context.
- `src/index.ts` re-exports `Orchestrator` + its event types.

Prior checkpoints:

- `64ff62b` — Add WorkspaceManager that owns per-issue worktree directories.
- `9a08eb3` — Add SymphonyLogger writing both SQLite and JSONL.
- `373e25e` — Add MockAgent that replays scripted YAML scenarios.
- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 7 — **API + CLI wiring so mock mode runs end-to-end**:

1. Implement `src/api/server.ts`. Expose `createServer({ orchestrator,
logger })` returning a Hono app with:
   - `GET /api/runs` — `logger.listRuns()`
   - `GET /api/runs/:id` — run + turns + events
   - `GET /api/events` — SSE stream fed by orchestrator events
     (`runStarted`, `turn`, `runFinished`); format each as `data: <json>\n\n`.
   - Serve a tiny placeholder `/` HTML while the real web bundle isn't
     built yet. Once `web/` lands, swap to serving the Vite build.
2. Wire `src/cli.ts` so `pnpm dev WORKFLOW.md --mock`:
   - parses WORKFLOW.md,
   - when `--mock` (or `config.agent.kind === "mock"`) is set, seeds a
     MemoryTracker with a couple of demo issues and a MockAgent loaded
     from `fixtures/scenarios/`,
   - constructs `WorkspaceManager`, `SymphonyLogger`, `Orchestrator`,
   - boots the Hono server on `--port` (default 4000),
   - handles SIGINT by calling `orchestrator.stop()` + closing logger.
3. Manual smoke: run `pnpm dev WORKFLOW.md --mock`, `curl
localhost:4000/api/runs` after a few seconds, confirm JSONL under
   `.symphony/logs/` + SQLite under `.symphony/symphony.db` have
   entries. This is the Phase 1 gate for "full flow without spawning
   anything real."
4. API gets a vitest — hit `/api/runs` with `hono/testing` against an
   in-memory logger + a pre-seeded run.
5. `pnpm all` green; commit.

Subsequent checkpoints:

- `web/` — Vite + React + Tailwind. Add `vite`, `@vitejs/plugin-react`,
  `react`, `react-dom`, `tailwindcss` devDeps then. Build output served
  by the Hono app.
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
