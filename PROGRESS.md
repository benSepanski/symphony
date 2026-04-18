# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 1 — TS core port. Complete.** `pnpm dev WORKFLOW.md --mock`
runs a full simulated agent end-to-end; `pnpm build:web` produces a
Vite bundle served by the Hono app at `/`. Next: Phase 2 (AI
harnessing — eval harness, scenario suite, replay).

## Last checkpoint

Web UI (commit pending at HEAD after the next `git commit`):

- `vite.config.ts` — Vite + `@vitejs/plugin-react` + `@tailwindcss/vite`
  rooted at `src/web`, building to `dist/web`. Dev server on 5173 with
  `/api` proxied to port 4000.
- `src/web/{index.html,index.css,main.tsx,App.tsx,Dashboard.tsx,RunDetail.tsx,api.ts}` —
  minimal React 19 + Tailwind v4 UI. Hash routing (`#/` = dashboard,
  `#/runs/:id` = detail). Both views poll on mount and subscribe to
  the SSE stream at `/api/events` so they refresh live.
- `src/api/server.ts` — when `dist/web/index.html` exists, the Hono
  app serves that at `/` and `/assets/*` via
  `@hono/node-server/serve-static`; otherwise falls back to a
  placeholder HTML page.
- `package.json` — `pnpm build` now runs `vite build` then `tsc`;
  new `pnpm dev:web` + `pnpm build:web` scripts.
- `tsconfig.json` — added `jsx: "react-jsx"` + DOM libs so the repo
  type-checks React + fetch/EventSource.
- Smoke (manual): `pnpm build:web && pnpm dev WORKFLOW.md --mock`,
  `curl /` returns the built index.html with script/CSS links,
  `/assets/index-*.js` and `/assets/index-*.css` both 200.

**Phase 1 fully gated:** a human can now open `localhost:4000`, see
runs listed, click into one, watch turns arrive live, all without
spawning a real agent.

Prior checkpoints:

- `e7ba3e3` — Tidy PROGRESS.md after Phase 1 gate passed.
- `b32cc23` — Wire the CLI and Hono API so mock mode runs end to end.
- `e8e802b` — Add Orchestrator that drives a mock-mode run end to end.
- `64ff62b` — Add WorkspaceManager that owns per-issue worktree directories.
- `9a08eb3` — Add SymphonyLogger writing both SQLite and JSONL.
- `373e25e` — Add MockAgent that replays scripted YAML scenarios.
- `d026612` — Add in-memory Tracker for tests and mock-mode runs.
- `5bbafc0` — Parse WORKFLOW.md front matter + ship a reference workflow.
- `321edf4` — Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

**Phase 2 — AI harnessing.** The harness needs to be AI-maintainable
(queryable trace, reproducible runs, eval gate). Sequence:

1. **Scenario suite.** Add four more fixture YAMLs to exercise the
   failure modes the plan calls out:
   - `fixtures/scenarios/rate-limit.yaml` — agent turns emit a tool
     error representing HTTP 429, ending in `Blocked`.
   - `fixtures/scenarios/turn-limit.yaml` — a long scenario of pure
     "still thinking" turns designed to trip `max_turns`.
   - `fixtures/scenarios/crash.yaml` — a step whose content signals a
     crash; use a new scenario field like `throw: true` so the mock
     agent raises and the orchestrator records a `failed` run.
   - `fixtures/scenarios/long-running.yaml` — realistic 10-turn flow
     with small `delay_ms` to look alive on the dashboard.
     Each scenario carries a `labels` entry so they can be exercised by
     label match in smoke runs.

2. **Eval harness.** Turn the placeholder `pnpm eval` script into a
   real Vitest project that boots the orchestrator against
   `MemoryTracker` + `MockAgent` once per scenario and asserts
   invariants:
   - happy-path → run status `completed`, tracker state `Human Review`.
   - rate-limit → run status `completed`, tracker state `Blocked`.
   - turn-limit → run status `max_turns`, tracker state `Blocked`.
   - crash → run status `failed`.
     Wire the eval project into `pnpm all` so regressions fail CI.

3. **`symphony replay <run_id>`.** Re-render a prior run from its
   SQLite + JSONL trace, streaming the recorded turns back through
   the UI. Minimal impl: a CLI subcommand that opens the DB, fetches
   run + turns + events, and re-emits them through a fresh
   `EventEmitter` so any subscriber (web UI, SSE client) sees the
   same sequence. Covers the "Reproducibility" principle in the plan.

4. **Prompt versioning.** Move the Liquid prompt out of
   `WORKFLOW.md` into `prompts/default.md` with a `version: v1` header
   and teach the parser to pull `prompt: prompts/default.md` from the
   front matter. Old workflows that still inline the prompt keep
   working.

5. **Per-turn rendered prompt.** Right now we render the prompt once
   per run. For Phase 2 "Observable context" we want to log the
   rendered prompt per turn. Add a `rendered_prompt` column on the
   turns table and plumb it through.

Each step is its own commit + `pnpm all` gate.

## Open issues / deferred

- `PROGRESS.md` screenshot gallery (Phase 4) — not yet started.
- Real-agent mode (Phase "final") still throws at boot. Needs
  `tracker/linear.ts` (GraphQL client) + `agent/claude-code.ts`
  (spawn `claude --output-format stream-json`) before the human-facing
  Linear + claude flow is usable.
- No `.env.example` yet. CLAUDE.md references one — create when
  wiring up the real Linear tracker.
- `Makefile` mentioned in the plan not yet created; low priority
  since the `pnpm` script surface is sufficient.
- `worktrees/` still contains leftover BEN-\* directories from the
  old Elixir runtime. Safe to ignore (in `.gitignore`).
- The Vitest web-ui test coverage is thin — no component-level tests
  because I didn't want to pull in jsdom + testing-library on a bare
  dashboard. Revisit in Phase 3.

## Decisions log

- **2026-04-17** — Runtime is Node 22 via `mise`, package manager is
  pnpm via corepack. Persistence is SQLite (Drizzle). HTTP is Hono.
  Web UI is Vite + React + Tailwind. Tests are Vitest.
- **2026-04-17** — Single-package repo at root (no monorepo). Agents
  navigate one tsconfig / one `src/` tree.
- **2026-04-17** — `pnpm test` uses `--passWithNoTests` during
  bootstrap so the CI gate stays green before any tests exist. Keep
  this flag; the gate still fails on real test failures.
- **2026-04-17** — ESLint configured to allow `_`-prefixed unused
  args/vars (standard TS convention).
- **2026-04-18** — Tailwind v4 via `@tailwindcss/vite` (no postcss
  config needed). React 19. Hash-based routing instead of React
  Router to keep web deps minimal.
