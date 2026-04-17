# Symphony

An orchestrator that polls Linear issues and runs coding agents in isolated git worktrees. Node + TypeScript stack.

## Read me first (every context)

Before taking any action in a fresh context, read these in order:

1. **[`PROGRESS.md`](PROGRESS.md)** — long-running state file. Current phase, last checkpoint, next action.
2. This file — stack + commands.
3. **[`plans/current.md`](plans/current.md)** — the strategic plan (if present).

## Stack

- **Runtime**: Node 22 (managed via `mise`, see [`mise.toml`](mise.toml))
- **Language**: TypeScript (strict), ESLint + Prettier
- **Server**: Hono + `@hono/node-server`, port 4000
- **Persistence**: SQLite via `better-sqlite3` + Drizzle ORM; DB at `.symphony/symphony.db`
- **Web UI**: Vite + React + Tailwind (under `src/web/`)
- **Tests**: Vitest
- **Package manager**: pnpm

## CI gate — run before every commit

```bash
pnpm all
```

Runs: `typecheck -> fmt:check -> lint -> test`. Do not commit if `pnpm all` fails.

## Local run

```bash
cp .env.example .env  # then fill in LINEAR_API_KEY
pnpm dev WORKFLOW.md --mock       # mock mode, no real agent spawn
pnpm dev WORKFLOW.md              # real agents (requires LINEAR_API_KEY + claude CLI)
```

Open the dashboard at <http://localhost:4000>.

## Mock mode

`--mock` (or `agent.kind: mock` in `WORKFLOW.md`) routes to the scripted fake agent under
[`src/agent/mock.ts`](src/agent/mock.ts). It reads YAML scenarios from
[`fixtures/scenarios/`](fixtures/scenarios) and emits timed messages as if a real model were running.
Use this for every local iteration — it exercises the full orchestrator + UI without spending tokens.

## Layout

```
src/
  cli.ts               # entry point
  config/              # WORKFLOW.md parser
  tracker/             # Linear + in-memory trackers
  agent/               # Agent interface, claude-code + mock impls
  workspace/           # git worktree + hooks
  orchestrator.ts      # poll loop, concurrency, retry
  persistence/         # Drizzle schema + logger
  api/                 # Hono server, SSE, REST
  web/                 # Vite + React dashboard
fixtures/scenarios/    # YAML-scripted mock agent runs
prompts/               # versioned prompt templates
```

## Conventions

- No comments explaining _what_ the code does — only _why_ if non-obvious.
- Every agent event writes a row to SQLite **and** a JSONL line under `.symphony/logs/`. Agents running in a loop should be able to query the DB or grep the JSONL to audit prior work.
- Never skip hooks (`--no-verify`). Fix the underlying issue.
