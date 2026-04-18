# Symphony

Symphony turns project work into isolated, autonomous implementation runs, letting teams manage
work instead of supervising coding agents.

[![Symphony demo video preview](.github/media/symphony-demo-poster.jpg)](.github/media/symphony-demo.mp4)

_In this [demo video](.github/media/symphony-demo.mp4), Symphony monitors a Linear board for work
and spawns agents to handle each ticket. The agents complete the tasks and provide proof of work
(CI status, PR review feedback, walkthrough videos). When accepted, the agents land the PR safely.
Engineers don't supervise the agents; they manage the work at a higher level._

> [!WARNING]
> Symphony is a low-key engineering preview for testing in trusted environments.

## Stack

- Node 22 (version pinned in [`.nvmrc`](.nvmrc); pnpm comes from corepack)
- TypeScript, strict mode
- Hono HTTP server on port 4000
- SQLite via `better-sqlite3` + Drizzle ORM at `.symphony/symphony.db`
- Vite + React + Tailwind dashboard
- Vitest unit and eval suites

## Quick start

```bash
# 1. Install deps (uses pnpm via corepack; see .nvmrc for the Node version)
corepack enable
pnpm install

# 2. Copy the env template and fill in LINEAR_API_KEY if you want real-agent mode
cp .env.example .env

# 3. Try mock mode — no API key or claude CLI needed
pnpm build:web
pnpm dev WORKFLOW.md --mock

# 4. Open the dashboard
open http://localhost:4000
```

## Modes

- **Mock mode** (`--mock` or `agent.kind: mock` in `WORKFLOW.md`): scripted YAML scenarios under
  `fixtures/scenarios/` play back through the full orchestrator — workspace creation, turn
  streaming, tracker transitions, persistence — without spawning the real `claude` CLI or hitting
  Linear. Scenarios are picked by matching issue labels; unmatched issues round-robin through the
  full scenario list.
- **Real mode** (default when `agent.kind: claude_code`): uses `LinearTracker` to poll a Linear
  project and `ClaudeCodeAgent` to spawn `claude --output-format stream-json --print` for each
  ticket. Requires `LINEAR_API_KEY` and the `claude` CLI on `$PATH`.

## Commands

```bash
pnpm dev WORKFLOW.md            # run the orchestrator (default subcommand: run)
pnpm dev WORKFLOW.md --mock     # mock mode with built-in demo issues
pnpm dev WORKFLOW.md --mock --no-demo              # empty state, no seeded issues
pnpm dev WORKFLOW.md --mock --seed my-issues.yaml  # seed from YAML
pnpm tsx src/cli.ts replay <runId> --speed 5       # replay a past run over SSE

pnpm build:web        # build the dashboard bundle into dist/web
pnpm all              # typecheck + fmt:check + lint + test + eval
pnpm eval             # run the scenario eval suite only
```

## Observability

Every agent event writes two artifacts:

- A row in SQLite at `.symphony/symphony.db` (`runs`, `turns`, `log_events`). Queryable by future
  agents running in a loop — `sqlite3 .symphony/symphony.db "select * from turns limit 5"`.
- A JSONL line under `.symphony/logs/<runId>.jsonl` with the stable shape
  `{ ts, run_id, turn_id, event_type, issue_id, payload }`.

The HTTP API exposes `/api/runs`, `/api/runs/:id`, `/api/events` (SSE), and `/api/search?q=...`.

## Development

Symphony follows OpenAI's [harness engineering][hep] playbook: knowledge lives in
a structured `docs/` tree, and [`AGENTS.md`](AGENTS.md) is a ~120-line table of
contents that points into it. Start there.

- [`AGENTS.md`](AGENTS.md) — cross-agent entry point (Claude Code, Codex, ...).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layered domain map.
- [`docs/`](docs/) — design notes, product specs, reliability + security
  invariants, exec plans, stack references.
- [`PROGRESS.md`](PROGRESS.md) — long-running plan state.
- [`CLAUDE.md`](CLAUDE.md) — Claude-Code-specific entry point (redirects to `AGENTS.md`).

Run `pnpm all` before committing.

[hep]: https://openai.com/index/harness-engineering/

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
