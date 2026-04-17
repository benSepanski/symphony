# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Workflow parser, memory tracker, mock agent, and
SymphonyLogger done. Next: workspace manager + orchestrator.

## Last checkpoint

SymphonyLogger — SQLite + JSONL persistence (commit pending at HEAD after
the next `git commit`):

- `src/persistence/schema.ts` — added `final_state` to the `turns` table
  and exported `CREATE_TABLES_SQL` for inline schema application.
- `src/persistence/logger.ts` — `SymphonyLogger` class over
  `better-sqlite3`. Methods `startRun` / `recordTurn` / `logEvent` /
  `finishRun`, plus read helpers `listRuns` / `listTurns` / `listEvents`.
  Every call writes one SQLite row and appends one JSONL line under
  `<logsDir>/<runId>.jsonl` with the spec'd keys. Clock and ID generator
  are injectable for deterministic tests. WAL journaling is enabled.
- `src/persistence/logger.test.ts` — 4 cases: full lifecycle (run →
  turn → event → finish) asserts SQLite and JSONL match; turn numbering;
  JSON serialization of toolCalls + payload; JSONL path shape.
- `src/index.ts` re-exports `SymphonyLogger` + its input/output types.

Prior checkpoints:

- `373e25e` — Add MockAgent that replays scripted YAML scenarios.
- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Phase 1, step 5 — **workspace manager**:

1. Implement `src/workspace/manager.ts`. Expose `WorkspaceManager` with:
   - `create(issue)` — resolves workspace root (expanding `~`), makes a
     `<root>/<issue.identifier>` directory, runs the `after_create` hook
     (if any) with cwd set to the directory. Hooks are shell snippets,
     executed via `child_process.exec` with the workspace dir and a set
     of env vars (`ISSUE_ID`, `ISSUE_IDENTIFIER`, etc.).
   - `destroy(issue)` — runs `before_remove`, then `rm -rf`s the dir.
   - `list()` — returns the current on-disk workspaces.
2. Keep hook execution synchronous-ish (awaitable) but bounded by a
   configurable timeout (default 300000ms). Reject on non-zero exits.
3. Tests: use `mkdtemp` as the root; assert a workspace directory is
   created, that hooks see the right env vars (echo into a file), and
   that destroy cleans up.
4. `pnpm all` green; commit.

Subsequent checkpoints:

- `orchestrator.ts` — wires memory tracker + mock agent + workspace manager
  - logger together. Poll loop, concurrency cap, retry queue.
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
