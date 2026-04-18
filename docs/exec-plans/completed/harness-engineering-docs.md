# harness-engineering-docs: Adopt OpenAI's harness-engineering model

_Status:_ completed
_Owner:_ Claude Code
_Started:_ 2026-04-18 · _Completed:_ 2026-04-18

## Why

The project had good code but scattered documentation: one monolithic
`CLAUDE.md`, a handful of loose skills under `.codex/skills/`, and no
structured catalog for design decisions, product specs, or quality grades.
OpenAI's ["Harness engineering: leveraging Codex in an agent-first world"][hep]
post is the most developed playbook for how to lay out an agent-first repo.
We adopted that playbook wholesale.

[hep]: https://openai.com/index/harness-engineering/

## Scope

In:

- Root `AGENTS.md` (table of contents, ~120 lines) + `ARCHITECTURE.md`.
- Top-level `docs/`: `DESIGN`, `FRONTEND`, `PLANS`, `PRODUCT_SENSE`,
  `QUALITY_SCORE`, `RELIABILITY`, `SECURITY`.
- `docs/design-docs/` catalog with core beliefs, golden principles, layered
  architecture, agent legibility, execution model, tracker abstraction,
  workspace isolation, prompt versioning, event log, replay, mock-first,
  event-schema evolution, threat model, doc-gardening (proposed).
- `docs/exec-plans/completed/` — this file + phase post-mortems derived from
  `PROGRESS.md`.
- `docs/generated/db-schema.md` — extracted from `src/persistence/schema.ts`.
- `docs/product-specs/` — one spec per domain (tracker, agent, workspace,
  orchestrator, live-dashboard, replay, search, mock-mode, isolated-runs).
- `docs/references/` — `llms.txt`-style reference extracts for each stack
  dependency.
- Updated prompt: `prompts/harness-v1.md` pointing the agent at `AGENTS.md`.
- `CLAUDE.md` + `README.md` rewrites to defer to `AGENTS.md`.

Out:

- Implementing the doc-gardening eval (proposed, tracked in
  [`../tech-debt-tracker.md`](../tech-debt-tracker.md)).
- Implementing the layer-boundary linter (tracked in tech-debt).

## Decision log

- 2026-04-18 — AGENTS.md is the canonical file; CLAUDE.md becomes a short
  redirect. The AGENTS.md convention is cross-agent (works for Claude Code,
  Codex, Cursor, etc.).
- 2026-04-18 — docs/ tree mirrors the OpenAI post verbatim for all
  top-level files (DESIGN, FRONTEND, PLANS, PRODUCT_SENSE, QUALITY_SCORE,
  RELIABILITY, SECURITY) + subdirectories (design-docs, exec-plans,
  generated, product-specs, references).
- 2026-04-18 — design notes carry a status vocabulary
  (`active | proposed | historical | superseded-by`).
- 2026-04-18 — `prompts/harness-v1.md` replaces `default-v1.md` as the
  `WORKFLOW.md` pointer; `default-v1.md` stays for backwards-compat on old
  runs' `promptVersion` strings.

## Acceptance

- [x] `AGENTS.md` at root, <~120 lines, table-of-contents only.
- [x] `ARCHITECTURE.md` at root with layer map + domain table.
- [x] All docs under `docs/` per the blog layout.
- [x] Catalog + index files cross-link.
- [x] Prompt updated to direct agents to AGENTS.md.
- [x] `pnpm all` green.

## Retrospective

- The process of writing the docs surfaced gaps that became rows in
  `tech-debt-tracker.md` (layer-graph lint, doc-gardening eval, SSE
  backpressure test).
- The layered-architecture rule is already implicit in the code; writing
  it down didn't require any refactor.
- `core-beliefs.md` + `golden-principles.md` are the two files an agent
  should read first after `AGENTS.md`.

## Shipped artifacts

- This commit.
