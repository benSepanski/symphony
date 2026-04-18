# Symphony — TS rewrite progress

Long-running state file. Read this first on every fresh context. Update after every checkpoint.

## Current phase

**Phase 4 — UI rigor loop. Complete** (structural items; iterative
browser polish remains for a browser-equipped context). Moving to
the final work chunk: real-agent mode (Linear tracker + claude-code
agent) so the system can drive real tickets.

## Last checkpoint (Phase 4)

Phase 4 landed across two commits:

- `879d427` — Richer run rows (new `issue_title` column, shown on
  the dashboard + run detail), an Error panel for failed/cancelled
  runs that parses the first `error` event's payload, a pulse dot
  on the `running` status badge, an SSE connected/connecting/
  disconnected indicator, and CLI `--no-demo` + `--seed <path>`
  flags so the empty-state journey is reachable and humans can
  hand-craft mock issues without patching `cli.ts`.
- `5f24941` — `/api/search?q=...` (SymphonyLogger.search unions
  turn content + event payload LIKE, escapes user-supplied % / \_)
  and a third SPA route at `#/search` rendering compact result
  cards with the query highlighted in amber.

All four Phase 4 journeys from the plan have a code answer now:

- Empty state → `--no-demo`.
- Watching a live agent → SSE indicator, pulse, title on each row.
- An agent fails → rose-tinted Error panel in RunDetail.
- Inspecting past runs → search endpoint + route.

The next context (with a browser / MCP) should load
`localhost:4000` and iterate: spacing, color contrast, focus
styles, keyboard nav. Code path is ready; polish remains.

## Earlier checkpoint (Phase 3)

- `1e53cae` — Reject path-traversing issue identifiers in
  WorkspaceManager; confirm env-var-as-argv is injection-safe.
- `c1e894a` — Assert SymphonyLogger survives two concurrent writers
  on one DB (WAL contract).
- `04aec5a` — Cover SIGINT mid-run with a cancellation test.
- `54d98ce` — Clean up workspace + tracker state on crash; add
  fast-check scheduler property (40 randomized cases).

Notable behavior changes from Phase 3:

- Orchestrator.runIssue now cleans up unconditionally in a finally:
  session.stop, tracker transition (to max_turns_state when no
  final_state was set), workspace destroy, run finalize.
- New run status "cancelled" for the SIGINT path.
- WorkspaceManager rejects identifiers that don't match
  /^[A-Za-z0-9_-]+$/ via UnsafeIdentifierError, so a malicious
  Linear identifier can never escape the workspace root.

## Earlier checkpoints

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

- `pnpm all` — green. 60 unit tests + 5 eval scenarios.
- `pnpm dev WORKFLOW.md --mock` — live mock run, dashboard shows
  turns + per-turn rendered prompt.
- `pnpm build:web` — produces `dist/web`, served by Hono at `/`.
- `symphony replay <run_id>` — replays a recorded run.
- Prompt versioning live: `WORKFLOW.md` references
  `prompts/default-v1.md`; each run row records `prompt_version` /
  `prompt_source`.

## Next action

**Real-agent mode** — the last work item from the original plan,
and the thing that makes symphony actually useful against Linear
tickets with a real `claude` CLI.

Two modules to implement, each with its own commit:

1. **`src/tracker/linear.ts`** — Linear GraphQL client.
   - Auth: `Authorization: <api_key>` header (Linear accepts the
     raw API key, no `Bearer` prefix).
   - `fetchCandidateIssues()` → query by `project.slug ==
config.tracker.project_slug` and `state.name IN active_states`.
     Return them as `Issue[]`.
   - `updateIssueState(issueId, state)` → first resolve `state` to a
     state id (cache the team's state map), then
     `issueUpdate(input: { stateId })`.
   - `addComment(issueId, body)` → `commentCreate`.
   - Pluck `LINEAR_API_KEY` from `process.env`. Error early if
     missing in real-agent mode.
   - Test with `vi.fn()` over `fetch` so the GraphQL shape is
     pinned without real API calls.

2. **`src/agent/claude-code.ts`** — spawn `claude
--output-format stream-json --print --input-format stream-json`,
   write the initial prompt + subsequent turn results, read
   line-delimited JSON off stdout, convert each assistant message /
   tool result into an `AgentTurn`.
   - Config from `workflow.config.claude_code`: `command`, `model`,
     `permission_mode`.
   - `isDone()` when the child emits the `result` message or exits.
   - `stop()` sends `SIGTERM` then `SIGKILL` after a short grace.
   - Test by injecting a fake spawn that feeds scripted stdout
     lines; assert turns come out in order.

Then in `cli.ts`, drop the "Real agent mode is not wired yet" throw
and instead:

- if `--mock` or `agent.kind: mock` → current path.
- else → `LinearTracker` + `ClaudeCodeAgent`, refuse to boot if
  `LINEAR_API_KEY` is missing.

Also add `.env.example` listing `LINEAR_API_KEY`.

## Deferred from Phase 3

- **Log rotation** — JSONL files grow per run. Revisit only if it
  actively bites.

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
