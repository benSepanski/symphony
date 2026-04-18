# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 2 — AI harnessing.** 3/5 steps done. Scenario suite + eval
harness + replay subcommand all landed. Remaining: prompt versioning
and per-turn rendered prompt.

## Last checkpoint

symphony replay `<run_id>` (commit `f955252`):

- `src/replay.ts` — `createReplayEmitter({ runId, logger, speed })`
  returns `{ events, run }`. `run()` looks up the run in the
  `SymphonyLogger`, re-emits every recorded turn (respecting original
  gaps / `speed`), then emits `runFinished`. `ReplayNotFound` when
  the run id is missing.
- `src/api/server.ts` — `createServer` now accepts
  `{ events: EventEmitter, logger }` instead of `{ orchestrator }`.
  Both orchestrator (live) and replay emitter plug in the same way.
- `src/cli.ts` — explicit `run` + `replay` subcommands (via
  commander `isDefault: true`, so `symphony WORKFLOW.md` still works).
  `replay --port <p> --speed <n>` serves the replay over the same
  Hono app at `/`, so the dashboard watches it like a live run.
- `src/replay.test.ts` — 2 Vitest cases: order of re-emitted events,
  `ReplayNotFound` on an unknown id.
- Manual smoke: record a run via `run`, replay it — replay server's
  `/api/runs` returns the original run, replay log prints "replay
  finished".

Prior Phase 2 checkpoints:

- `d956377` — Turn pnpm eval into a real Vitest scenario suite.
- `770b9e7` — Flesh out scenario fixture suite for Phase 2 eval harness.

Phase 1 checkpoints (summary — see `git log` for full history):

- `560be37` — Vite + React + Tailwind dashboard served by the Hono app.
- `b32cc23` — Wire the CLI and Hono API so mock mode runs end to end.
- `e8e802b` — Orchestrator.
- `64ff62b` — WorkspaceManager.
- `9a08eb3` — SymphonyLogger.
- `373e25e` — MockAgent + scenarios.
- `d026612` — MemoryTracker.
- `5bbafc0` — WORKFLOW.md parser.
- `321edf4` — Phase 0 scaffold.

## Gate status

- `pnpm all` — green. 42 unit tests + 5 eval scenarios.
- `pnpm dev WORKFLOW.md --mock` — end-to-end mock run works.
- `pnpm build:web` — produces `dist/web`, served by Hono at `/`.
- `symphony replay <run_id>` — replays a recorded run with the same
  SSE surface as live.

## Next action

**Phase 2, step 4 — prompt versioning.**

1. Move the Liquid prompt body out of `WORKFLOW.md` into
   `prompts/default-v1.md` (keep the existing inline template as a
   fallback). Header line `-- version: v1 --` or similar.
2. Teach `parseWorkflow` to accept `prompt: prompts/default-v1.md` in
   the front matter. When present, read that file; when absent, use
   the inline template after the front matter (current behavior).
3. Store the prompt version in the `runs` row (new `prompt_version`
   column, default `"inline"`). Log it in each run's JSONL too.
4. Keep the existing repo-root `WORKFLOW.md` working by splitting its
   template into `prompts/default-v1.md` and pointing the front
   matter at it.
5. Tests: parser tests cover both inline + file-referenced prompts.
6. `pnpm all` green; commit.

**Phase 2, step 5 — per-turn rendered prompt.**

1. Add `rendered_prompt` column to `turns` table. Update
   `SymphonyLogger.recordTurn` to accept + persist it.
2. In the orchestrator, render the Liquid template once per turn
   (attempt number is available) and pass the result through to the
   logger.
3. Expose the rendered prompt in `/api/runs/:id` so the UI can show
   exactly what the model saw per turn. Add a collapsed
   "prompt" disclosure on each turn in the run detail view.
4. Tests: orchestrator test asserts the prompt is captured; API test
   asserts it comes back in the detail payload.
5. `pnpm all` green; commit.

Then Phase 2 is done and we move to **Phase 3 — bug + test review**
(fast-check on the scheduler, SIGINT handling, log rotation, SQLite
WAL under concurrent writers, command-injection in user hooks).

## Open issues / deferred

- `PROGRESS.md` screenshot gallery (Phase 4) — not yet started.
- Real-agent mode still throws at boot. Needs `tracker/linear.ts`
  (GraphQL client) + `agent/claude-code.ts` (spawn
  `claude --output-format stream-json`). Blocked on nothing — just
  not implemented yet.
- No `.env.example` yet. CLAUDE.md references one — create when
  wiring up the real Linear tracker.
- `Makefile` mentioned in the plan not yet created; low priority
  since the `pnpm` script surface is sufficient.
- `worktrees/` still contains leftover BEN-\* directories from the
  old Elixir runtime. Safe to ignore (in `.gitignore`).
- Vitest web-ui component coverage is thin — no jsdom +
  testing-library. Revisit in Phase 3 or Phase 4.
- No log search endpoint or UI yet (plan calls for it). Consider in
  Phase 3 once the scenarios push enough data through the logger.

## Decisions log

- **2026-04-17** — Runtime is Node 22 via `mise`, package manager is
  pnpm via corepack. Persistence is SQLite (Drizzle). HTTP is Hono.
  Web UI is Vite + React + Tailwind. Tests are Vitest.
- **2026-04-17** — Single-package repo at root (no monorepo).
- **2026-04-17** — `pnpm test` uses `--passWithNoTests` during
  bootstrap; gate still fails on real test failures.
- **2026-04-17** — ESLint allows `_`-prefixed unused args/vars.
- **2026-04-18** — Tailwind v4 via `@tailwindcss/vite` (no postcss
  config). React 19. Hash-based routing instead of React Router.
- **2026-04-18** — Eval suite lives under `src/eval/*.eval.ts` with a
  separate `vitest.eval.config.ts`. `pnpm all` chains test + eval.
- **2026-04-18** — `createServer` takes any `EventEmitter`, not the
  full orchestrator, so live run and replay share one HTTP surface.
- **2026-04-18** — `crash` scenario added a `throw: true` step field
  so scenarios can represent genuine mock-agent failures that surface
  as "failed" orchestrator runs.
