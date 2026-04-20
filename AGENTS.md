# AGENTS.md

This file is a **table of contents**, not an encyclopedia. Everything you need to
know to work productively in this repository lives under [`docs/`](docs/). Start
here, then follow the pointers.

Design philosophy — _inspired by OpenAI's [harness engineering][hep] post_:

- If it isn't in the repo, it doesn't exist. Encode Slack threads, tacit
  knowledge, and decisions into markdown under [`docs/`](docs/).
- A short map beats a 1,000-page manual. This file stays under ~120 lines.
- Context is scarce; navigate, don't dump. Load only what the task needs.

[hep]: https://openai.com/index/harness-engineering/

---

## Before you touch code

1. Read [`PROGRESS.md`](PROGRESS.md) — the long-running state of the project.
2. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) — the layered domain map and
   permitted dependencies.
3. Read [`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md) —
   the non-negotiable operating principles this repo enforces on you.
4. Scan [`docs/design-docs/golden-principles.md`](docs/design-docs/golden-principles.md) —
   the mechanical rules every PR is graded against.

If you skip these, you will pattern-match locally and produce drift.

---

## Running the system

| Command                           | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm all`                        | **CI gate.** typecheck → fmt:check → lint → test → eval. Green before commit. |
| `pnpm dev WORKFLOW.md --mock`     | Mock mode — no Linear, no real `claude` CLI. Use for every local iteration.   |
| `pnpm dev WORKFLOW.md`            | Real mode — requires `LINEAR_API_KEY` and the `claude` CLI on `$PATH`.        |
| `pnpm tsx src/cli.ts replay <id>` | Replay any recorded run over SSE at `http://localhost:4000`.                  |
| `pnpm tsx src/cli.ts prune`       | Delete runs + JSONL logs older than the given duration.                       |
| `pnpm build:web`                  | Build the dashboard bundle into `dist/web/`.                                  |

Node 22 (pinned in [`.nvmrc`](.nvmrc)); pnpm via corepack. See
[`docs/references/stack-llms.txt`](docs/references/stack-llms.txt) for version
pins and framework snippets.

---

## Where things live

### Documentation (system of record)

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layered domain architecture.
- [`docs/DESIGN.md`](docs/DESIGN.md) — architectural patterns + taste invariants.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — dashboard conventions.
- [`docs/PLANS.md`](docs/PLANS.md) — how to write and file execution plans.
- [`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md) — what Symphony is and is not.
- [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) — per-domain grades. Update when you change a domain.
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md) — reliability invariants (retries, crash recovery, concurrency).
- [`docs/SECURITY.md`](docs/SECURITY.md) — attack surface, secret handling, workspace isolation.
- [`docs/design-docs/index.md`](docs/design-docs/index.md) — indexed catalog of design decisions.
- [`docs/product-specs/index.md`](docs/product-specs/index.md) — product specs per feature.
- [`docs/generated/db-schema.md`](docs/generated/db-schema.md) — current SQLite schema (regenerate when schema changes).
- [`docs/references/`](docs/references/) — short reference extracts for every stack dependency.
- [`docs/exec-plans/active/`](docs/exec-plans/active/) — plans for in-flight work.
- [`docs/exec-plans/completed/`](docs/exec-plans/completed/) — post-mortems of shipped phases.
- [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md) — registered tech debt.

### Code

- `src/cli.ts` — entry point, `commander` wiring.
- `src/config/` — `WORKFLOW.md` parser (YAML front matter + liquid prompt).
- `src/tracker/` — `LinearTracker` + `MemoryTracker`. See [`docs/design-docs/tracker-abstraction.md`](docs/design-docs/tracker-abstraction.md).
- `src/agent/` — `ClaudeCodeAgent` + `MockAgent`. See [`docs/design-docs/mock-first-development.md`](docs/design-docs/mock-first-development.md).
- `src/workspace/` — git worktree manager + safety checks on issue identifiers.
- `src/usage/` — rate limit monitoring via Claude Code OAuth endpoint. See [`docs/product-specs/usage.md`](docs/product-specs/usage.md).
- `src/orchestrator.ts` — the poll loop, concurrency, state transitions.
- `src/persistence/` — Drizzle schema + `SymphonyLogger` (dual SQLite + JSONL).
- `src/api/` — Hono server (`/api/runs`, `/api/events` SSE, `/api/search`).
- `src/web/` — Vite + React + Tailwind dashboard.
- `src/eval/` — scenario-based regression eval (green as part of `pnpm all`).
- `src/self-update/` — optional `git fetch origin/main` from the poll loop. See [`docs/design-docs/self-update.md`](docs/design-docs/self-update.md).
- `fixtures/scenarios/` — YAML-scripted mock runs.
- `prompts/` — versioned prompt templates referenced from `WORKFLOW.md`.

---

## Golden rules (enforced by `pnpm all`)

See [`docs/design-docs/golden-principles.md`](docs/design-docs/golden-principles.md)
for the full list. The short version:

1. **Never skip hooks.** `--no-verify`, `--no-gpg-sign`, `no-commit-verify` are
   out. Fix the underlying issue.
2. **Respect layer boundaries.** Code may only depend forward through
   `Types → Config → Persistence → Service → Runtime → API/Web`. Providers
   (`fetch`, `spawn`, `Database`, logger) enter via dependency injection.
3. **Dual-write every agent event.** SQLite row **and** JSONL line. Future
   agents query one or the other to audit prior work.
4. **Validate at the boundary.** Parse config (zod), GraphQL (typed), stream
   JSON (`toAgentTurn`). No "YOLO-style" probing of untyped shapes.
5. **No comments for _what_.** Only _why_, and only when non-obvious.
6. **Reject unsafe identifiers.** All filesystem paths derived from issue
   identifiers must pass `/^[A-Za-z0-9_-]+$/`.
7. **Mock mode is the default.** Every feature must be exercisable without a
   `LINEAR_API_KEY` or the `claude` CLI.

---

## Where humans steer, where agents execute

This repo treats Codex / Claude Code as the primary author of code. Humans
design environments, specify intent, and validate outcomes — see
[`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md) and
[`docs/PLANS.md`](docs/PLANS.md).

When you get blocked, **do not** try harder on the wrong thing. Identify the
missing capability (tool, doc, lint, fixture) and land a small PR adding it,
then come back to the original task.

---

_AGENTS.md line budget: keep this file at roughly 100–120 lines. If a section
starts to bloat, promote it into `docs/` and replace with a link. Stale entries
are detected by the doc-gardening eval (see [`docs/design-docs/doc-gardening.md`](docs/design-docs/doc-gardening.md))._
