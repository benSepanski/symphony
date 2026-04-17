# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port.** Phase 0 complete. Workflow parser landed.

## Last checkpoint

Workflow parser (commit pending at HEAD after the next `git commit`) — to
ground the next module in a concrete file format:

- `src/config/workflow.ts` — `parseWorkflow(path)` + `parseWorkflowString`
  split out a `---`-delimited YAML front matter, validates it against the
  existing Zod schema, and returns the remaining Liquid-template body.
- `src/config/workflow.test.ts` — 5 Vitest cases: happy path, default
  application, no front matter, bad YAML, schema violation.
- `WORKFLOW.md` at the repo root — trimmed-down version of the old Elixir
  workflow, suitable for `pnpm dev WORKFLOW.md --mock` once mock mode lands.
- `src/index.ts` now re-exports `parseWorkflow`, `parseWorkflowString`,
  `WorkflowParseError`.

Prior checkpoint: commit `321edf4` — Phase 0 scaffold.

## Next action

Phase 1, step 2 — **in-memory tracker**:

1. Flesh out `src/tracker/memory.ts` implementing the `Tracker` interface.
   Needs a constructor that seeds a fixed list of issues, plus
   `fetchCandidateIssues` (returns issues currently in an `active_states`
   value passed from config), `updateIssueState`, and `addComment`. Support
   deterministic ordering so mock-mode dashboards look stable.
2. Add `src/tracker/memory.test.ts` — seed a few issues, assert state
   transitions, assert `fetchCandidateIssues` filters by active states.
3. `pnpm all` green; commit.

Subsequent checkpoints (each its own commit):

- `agent/mock.ts` + `fixtures/scenarios/happy-path.yaml` (scripted agent).
- `persistence/logger.ts` (SQLite + JSONL).
- `workspace/manager.ts`.
- `orchestrator.ts`.
- `api/server.ts` (Hono, SSE).
- `web/` (Vite + React + Tailwind). Add `vite`, `@vitejs/plugin-react`,
  `react`, `react-dom`, `tailwindcss` then.
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
