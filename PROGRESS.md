# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Workflow parser, memory tracker, and mock agent all
done. Next piece is persistence.

## Last checkpoint

Mock agent + happy-path scenario (commit pending at HEAD after the next
`git commit`):

- `src/agent/types.ts` — `Agent.startSession(context)` now takes an
  `AgentStartContext` ({ workdir, prompt, issueIdentifier?, labels? });
  `AgentSession` adds `isDone()` and an optional `finalState` on turns.
- `src/agent/mock.ts` — `MockAgent` + `MockAgentSession`. Walks Zod-validated
  scenarios, sleeps via an injectable `Sleeper` (tests pass a no-op fake),
  and picks scenarios by label first, falling back to round-robin.
- `src/agent/mock.test.ts` — 11 cases: schema happy path, two schema
  failures, step walk, delay contract, over-run guard, label match,
  round-robin, empty-scenarios guard, fixture loading (both file and
  directory).
- `fixtures/scenarios/happy-path.yaml` — 5-step scenario ending in
  `final_state: Human Review`.
- `src/index.ts` re-exports `MockAgent` and scenario types.

Prior checkpoints:

- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 4 — **persistence**:

1. Implement `src/persistence/logger.ts`. Construct with a DB path (default
   `.symphony/symphony.db`) and a JSONL directory (default
   `.symphony/logs/`). Creates both on first write. Expose:
   - `startRun({ issueId, issueIdentifier, scenario? }) -> runId`
   - `recordTurn({ runId, role, content, toolCalls?, finalState? }) -> turnId`
   - `logEvent({ runId, turnId?, eventType, issueId?, payload? })`
   - `finishRun({ runId, status })`
2. Open SQLite via `better-sqlite3`, apply schema inline (no drizzle
   migrations yet — just `CREATE TABLE IF NOT EXISTS` from the Drizzle
   schema). Drizzle's query builder is still usable for inserts.
3. Every recorded event writes (a) one SQLite row and (b) one JSONL line
   under `.symphony/logs/<runId>.jsonl` with stable keys
   `{ ts, run_id, turn_id, event_type, issue_id, payload }`.
4. Tests use `:memory:` DB + a temporary directory via `node:os.tmpdir()`.
   Assert SQLite rows and JSONL lines agree.
5. `pnpm all` green; commit.

Subsequent checkpoints:

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
