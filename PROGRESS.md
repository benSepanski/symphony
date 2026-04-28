# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**All plan phases complete.** Phase 0 → Phase 4 plus the final
real-agent mode (LinearTracker + ClaudeCodeAgent). System is ready
for a live smoke test against Linear with a real `claude` CLI.

## Gate status

- `pnpm all` — green. 110 unit tests + 5 eval scenarios.
- `pnpm dev WORKFLOW.md --mock` — full mock run with live dashboard.
- `pnpm build:web` — produces `dist/web`, served by Hono at `/`.
- `symphony replay <run_id>` — replays any recorded run over SSE.
- Real mode (`pnpm dev WORKFLOW.md`) constructs LinearTracker +
  ClaudeCodeAgent and fails fast if `LINEAR_API_KEY` is missing.

## Checkpoint log (most recent first)

History (BEN-38):

- _this commit_ — Dedupe `src/web/api.ts` fetch boilerplate behind a private
  `requestJson<T>` helper; cover the helper + `patchSettings` + `requestManualTick`
  error paths with a new `src/web/api.test.ts` (130 unit tests, was 119).

History (BEN-32):

- Record per-run token usage + start-of-run auth/utilization snapshot on `runs`;
  surface on dashboard + run detail; backfill existing DBs via
  `ALTER TABLE ADD COLUMN` on boot.

Real-agent mode:

- `f92eb08` — Pin the LinearTracker empty-apiKey guard in tests.
- `9d9a230` — Rewrite README for the TypeScript stack.
- `221980d` — Add ClaudeCodeAgent and wire real-agent mode into the CLI.
- `c6c08dc` — Add LinearTracker — GraphQL client against api.linear.app.

Phase 4 (UI rigor):

- `5f24941` — `/api/search?q=...` and a `#/search` route with highlights.
- `879d427` — Richer run rows, error surface, live indicators, `--no-demo`.

Phase 3 (bugs + review):

- `1e53cae` — Reject path-traversing issue identifiers; lock the env-var contract.
- `c1e894a` — Assert SymphonyLogger survives two concurrent writers on one DB.
- `04aec5a` — Cover SIGINT mid-run with a cancellation test.
- `54d98ce` — Clean up workspace + tracker state on crash; fast-check scheduler property.

Phase 2 (AI harnessing):

- `34f2f3b` — Persist and surface the rendered prompt per turn.
- `7912cc3` — Versioned prompt files referenced from WORKFLOW.md.
- `f955252` — `symphony replay <run_id>` via any EventEmitter.
- `d956377` — `pnpm eval` wired into `pnpm all` against 5 scenarios.
- `770b9e7` — Scenario fixture suite (rate-limit, turn-limit, crash, long-running).

Phase 1 (TS core port):

- `560be37` Vite + React + Tailwind dashboard.
- `b32cc23` CLI + Hono API so mock mode runs end to end.
- `e8e802b` Orchestrator.
- `64ff62b` WorkspaceManager.
- `9a08eb3` SymphonyLogger.
- `373e25e` MockAgent + scenarios.
- `d026612` MemoryTracker.
- `5bbafc0` WORKFLOW.md parser.

Phase 0:

- `321edf4` Delete Elixir implementation and scaffold TypeScript rewrite.

## Next action

Nothing urgent — the implementation matches the plan. Good next
moves, roughly in priority order, for a future context:

1. **Live smoke test** of real mode. Needs a real `LINEAR_API_KEY`
   and the `claude` CLI. Confirm the GraphQL query field names
   still match Linear's current schema (the client assumes
   `project.slugId.eq` and the shape of workflowStates filter —
   these have moved around historically).
2. **Phase 4 browser iteration.** A context with a browser MCP
   should load `localhost:4000`, walk the four journeys
   (empty/live/failed/past), capture screenshots into
   `.github/media/`, and file layout/contrast/keyboard-nav friction
   as it's observed.
3. **Log rotation.** Deferred Phase 3 item. Revisit if
   `.symphony/logs/` grows uncomfortably large in real use.
4. **Web-ui component tests.** Adding `@testing-library/react` +
   `jsdom` would let us pin the dashboard + run-detail rendering
   contract. Currently we only assert via the API layer.

## Decisions log

- **2026-04-17** — Runtime is Node 22 (pinned in `.nvmrc`), package
  manager is pnpm via corepack. Persistence is SQLite (Drizzle).
  HTTP is Hono. Web UI is Vite + React + Tailwind. Tests are
  Vitest. (Originally pinned via `mise`; switched to `.nvmrc` on
  2026-04-18 to drop the mise dependency.)
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
- **2026-04-18** — Orchestrator cleans up workspace + tracker state
  in a `finally`. New run status `cancelled` for the SIGINT path.
- **2026-04-18** — WorkspaceManager rejects identifiers not matching
  `/^[A-Za-z0-9_-]+$/` via `UnsafeIdentifierError`.
- **2026-04-18** — LinearTracker caches per-team workflow state
  map so repeated state transitions only fetch the map once.
- **2026-04-18** — ClaudeCodeAgent spawns `claude --output-format
stream-json --print` and surfaces assistant / tool_result messages
  as AgentTurns through a promise-resolver queue.
- **2026-04-20** — Optional `self_update` block on `WorkflowConfigSchema`
  enables a throttled `git fetch origin/main` from the poll loop.
  Fetch-only by design (worktrees track agent branches, not `main`).
  See [`docs/design-docs/self-update.md`](docs/design-docs/self-update.md).
