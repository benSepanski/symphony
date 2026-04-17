# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Phase 0 + workflow parser + memory tracker done.

## Last checkpoint

In-memory tracker (commit pending at HEAD after the next `git commit`):

- `src/tracker/memory.ts` — `MemoryTracker` class implementing
  `Tracker.fetchCandidateIssues` / `updateIssueState` / `addComment`. Seeded
  from a fixed issue list + `activeStates` set. Returns defensive copies so
  callers cannot mutate internal state through issue references.
- `src/tracker/memory.test.ts` — 5 Vitest cases covering active-state
  filtering, sort order, state transitions, comments, unknown-id errors,
  and copy-safety.
- `src/index.ts` re-exports `MemoryTracker`.

Prior checkpoints:

- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 3 — **mock agent + one scenario**:

1. Add `src/agent/mock.ts`. Expose a `MockAgent` implementing `Agent`:
   `startSession(workdir, prompt)` loads a YAML scenario (path passed in
   via the constructor), returns an `AgentSession` whose `runTurn` walks
   the scenario step-by-step, respecting each entry's `delay_ms`.
2. Define the scenario shape with Zod. Fields per step: `role` (required),
   `content` (required), `delay_ms` (default 0), `tool_calls` (optional),
   `final_state` (optional — when present, signals the orchestrator what
   Linear state to transition to after the turn completes).
3. Drop `fixtures/scenarios/happy-path.yaml` — a trivial 3-turn scenario
   (plan, implement, complete) ending with `final_state: Done`.
4. Tests: load the scenario, step through it, assert message shape and
   terminal state. Use a fake clock to avoid real waits.
5. `pnpm all` green; commit.

Subsequent checkpoints:

- `persistence/logger.ts` (SQLite via Drizzle + JSONL under `.symphony/logs/`).
- `workspace/manager.ts` (git worktree + hook execution).
- `orchestrator.ts` (poll loop, concurrency limit, retry queue).
- `api/server.ts` (Hono, SSE, REST) + web bundle.
- `web/` — add `vite`, `@vitejs/plugin-react`, `react`, `react-dom`,
  `tailwindcss` devDeps when that module lands.
- Finally `tracker/linear.ts` + `agent/claude-code.ts`.

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
