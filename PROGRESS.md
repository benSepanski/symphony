# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 0 — scaffolding.** Near complete.

## Last checkpoint (uncommitted)

Phase 0 mechanically ready:

- `SPEC.md` and `elixir/` deleted (staged in the working tree, not yet committed).
- `CLAUDE.md` rewritten for TS stack.
- `cloud-setup.sh` rewritten for Node 22 via mise + corepack for pnpm.
- TS scaffold in place at repo root: `package.json`, `tsconfig.json`, `eslint.config.js`,
  `vitest.config.ts`, `drizzle.config.ts`, `.prettierrc`, `.prettierignore`.
- Skeleton types under `src/`: `config/workflow.ts`, `tracker/types.ts`, `agent/types.ts`,
  `persistence/schema.ts`, `cli.ts`, `index.ts`.
- `pnpm install && pnpm all` green (typecheck + fmt:check + lint + test-with-no-tests).

No commits yet — the entire working tree is still uncommitted changes on `main`. The next
context should commit Phase 0 as a single coherent commit before starting Phase 1 modules.

## Next action

1. Commit the Phase 0 work. Suggested message:
   `Scaffold TypeScript rewrite; delete Elixir implementation`.
   Stage the `elixir/` deletions, `SPEC.md` deletion, the TS scaffold, and the
   updated `CLAUDE.md` / `cloud-setup.sh` / `.gitignore`. Confirm `pnpm all` is
   still green post-commit.
2. Start Phase 1 — begin with `config/workflow.ts` parsing YAML front matter +
   Liquid prompt template, backed by Vitest tests. After that, the in-memory
   tracker + mock agent are the right next modules because they unlock the
   mock-mode smoke test. See the plan sequence in the original message.
3. Before wiring up the orchestrator, scaffold one mock scenario YAML
   (`fixtures/scenarios/happy-path.yaml`) so end-to-end mock tests have data.

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
