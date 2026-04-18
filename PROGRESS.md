# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 2 — AI harnessing. Complete.** 5/5 steps landed. Next:
Phase 3 (bugs + test review).

## Last checkpoint

Per-turn rendered prompt (commit `34f2f3b`):

- `src/persistence/schema.ts` — `turns` gains a `rendered_prompt`
  column; `CREATE TABLES` SQL matches.
- `src/persistence/logger.ts` — `recordTurn` accepts + persists
  `renderedPrompt`; `listTurns` and the JSONL payload carry it.
- `src/orchestrator.ts` — renders the Liquid template once per turn
  with `attempt = turnsTaken + 1`, so retry-aware `{% if attempt > 1 %}`
  blocks actually fire on later turns. The first-turn render is
  reused as the session's initial prompt to avoid double work.
- `src/web/RunDetail.tsx` + `src/web/api.ts` — each turn card in
  the UI now has a "prompt the model saw" disclosure that reveals
  the exact rendered template.
- Tests: orchestrator asserts attempt 1..N reach the logger;
  logger test asserts the new column round-trips.

Phase 2 summary (in order):

- `770b9e7` — Scenario fixture suite (rate-limit, turn-limit, crash, long-running).
- `d956377` — `pnpm eval` wired into `pnpm all` against 5 scenarios.
- `f955252` — `symphony replay <run_id>` via any EventEmitter.
- `7912cc3` — Versioned prompt files (`prompts/default-v1.md`).
- `34f2f3b` — Per-turn rendered prompt captured on each turn.

Phase 1 summary (all before Phase 2):

- `560be37` Vite + React + Tailwind dashboard.
- `b32cc23` CLI + Hono API wiring.
- `e8e802b` Orchestrator.
- `64ff62b` WorkspaceManager.
- `9a08eb3` SymphonyLogger.
- `373e25e` MockAgent + scenarios.
- `d026612` MemoryTracker.
- `5bbafc0` WORKFLOW.md parser.
- `321edf4` Phase 0 scaffold.

## Gate status

- `pnpm all` — green. 48 unit tests + 5 eval scenarios.
- `pnpm dev WORKFLOW.md --mock` — live mock run, dashboard shows
  turns + per-turn rendered prompt.
- `pnpm build:web` — produces `dist/web`, served by Hono at `/`.
- `symphony replay <run_id>` — replays a recorded run.
- Prompt versioning live: `WORKFLOW.md` references
  `prompts/default-v1.md`; each run row records `prompt_version` /
  `prompt_source`.

## Next action

**Phase 3 — bugs + test review.** The plan calls out specific risk
areas; tackle them in order of blast radius:

1. **Scheduler under race** — use `fast-check` to property-test
   `Orchestrator.tick()`. Interesting invariants:
   - `claimed.size` never exceeds `max_concurrent_agents` across
     concurrent `tick()` calls.
   - No issue is dispatched twice (even if the tracker returns it
     across consecutive ticks while a run is in flight).
   - A failed run releases its claim so the next tick can pick up
     the same issue.
     Add `fast-check` as a devDep. Start with 100 runs.

2. **Worktree cleanup on crash** — right now if the agent throws
   mid-turn, `workspace.destroy` is never called. The current
   behavior leaves a lingering directory. Decide whether destroy
   should run in a `finally` regardless of error, and how to keep
   the resulting tests deterministic under `--mock` (workspaces
   stripped of hooks). Add a regression test.

3. **SIGINT mid-run** — `Orchestrator.stop` awaits in-flight ticks,
   but it does not currently stop an in-flight session. Verify that
   `stop()` is called on each active session and that the run
   status moves to `failed` or a new `cancelled` status. CLI should
   exit cleanly even when a long-running scenario is active.

4. **SQLite WAL under concurrent writers** — the logger already
   enables WAL, but we never exercised multiple concurrent runs
   against the same DB. Add a test that opens two orchestrators
   sharing one DB path and drives them in parallel. Assert no
   rows are lost or duplicated.

5. **Command injection in hooks** — the workspace manager shells
   out via `bash -eu -c <script>`. A hook can reference
   `$ISSUE_IDENTIFIER` which comes from Linear. If the identifier
   ever contains shell metacharacters, we have a problem. Audit
   the hook input surface, add a test that feeds a malicious
   identifier through the hook, and document the contract.

6. **Log rotation** — JSONL files grow per run. Decide policy:
   keep per-run file (current), roll by size, archive oldest.
   Probably a Phase 4 concern — note here and move on unless it's
   actively biting.

Each is its own commit + `pnpm all` gate. Target one commit per
risk area so failures are easy to bisect.

## Open issues / deferred

- `PROGRESS.md` screenshot gallery (Phase 4) — not yet started.
- Real-agent mode still throws at boot. Needs `tracker/linear.ts`
  (GraphQL client) + `agent/claude-code.ts` (spawn
  `claude --output-format stream-json`). Not blocked — just
  unimplemented.
- No `.env.example` yet. CLAUDE.md references one — create when
  wiring up the real Linear tracker.
- `Makefile` mentioned in the plan not yet created; the `pnpm`
  script surface is sufficient.
- `worktrees/` still contains leftover BEN-\* directories from the
  old Elixir runtime. Safe to ignore (in `.gitignore`).
- Web-ui component tests still thin. Consider jsdom +
  testing-library in Phase 3 or Phase 4.
- No log search endpoint or UI yet (the plan mentions it). A
  simple `/api/search?q=...` against `log_events.payload LIKE` is
  enough to start.

## Decisions log

- **2026-04-17** — Runtime is Node 22 via `mise`, package manager is
  pnpm via corepack. Persistence is SQLite (Drizzle). HTTP is Hono.
  Web UI is Vite + React + Tailwind. Tests are Vitest.
- **2026-04-17** — Single-package repo at root (no monorepo).
- **2026-04-17** — `pnpm test` uses `--passWithNoTests` during
  bootstrap; gate still fails on real test failures.
- **2026-04-17** — ESLint allows `_`-prefixed unused args/vars.
- **2026-04-18** — Tailwind v4 via `@tailwindcss/vite`. React 19.
  Hash-based routing instead of React Router.
- **2026-04-18** — Eval suite under `src/eval/*.eval.ts` with its
  own `vitest.eval.config.ts`. `pnpm all` chains test + eval.
- **2026-04-18** — `createServer` takes any `EventEmitter`, so live
  run and replay share the HTTP surface.
- **2026-04-18** — `crash` scenario introduced `throw: true` step
  field for mock-agent failures.
- **2026-04-18** — Prompt files live under `prompts/` with their own
  `version:` front matter. Inline templates report
  `promptVersion: "inline"`. The orchestrator renders per turn and
  persists the rendered text on the turn row.
