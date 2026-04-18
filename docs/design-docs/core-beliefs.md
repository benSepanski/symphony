# core-beliefs: the non-negotiables

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

Symphony's operating principles. These are written in imperative mood, scoped
to agents acting in the repo. Breaking one is not a style issue — it's a
design violation that needs a note arguing it out.

---

## 1. Humans steer; agents execute

Every long-lived decision is captured as an artifact in this repo:

- Prompts (`prompts/*.md`) — _how_ an agent approaches any issue.
- Workflow (`WORKFLOW.md`) — _where_ and _how often_ to poll.
- Product specs (`docs/product-specs/`) — _what_ each feature does.
- Design docs (`docs/design-docs/`) — _why_ we built it this way.
- Quality grades (`docs/QUALITY_SCORE.md`) — _how coherent_ each domain is.

When an agent gets blocked, the fix is not "try harder" — it's to ask:
_what capability, lint, fixture, or doc is missing that would have unblocked
me?_ and land that first.

## 2. Repository knowledge is the system of record

If a decision lives only in Slack, a Google Doc, a reviewer's head, or a
cancelled Linear thread, it effectively does not exist. Agents cannot see it.

The remediation, always, is to encode the knowledge into markdown under
[`docs/`](..). A reviewer's comment that requested a structural change is a
standing rule; promote it into [`golden-principles.md`](golden-principles.md)
or a design note rather than "remembering it next time".

## 3. Context is scarce — map, don't dump

`AGENTS.md` is a ~120-line table of contents, not a manual.
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) is a one-screen picture of layers
and domains. Every long explanation lives deeper, where it can be loaded on
demand.

When you're tempted to add 200 lines to `AGENTS.md`, instead: write a design
note, link it.

## 4. Mock mode is the default

Every feature must be exercisable without `LINEAR_API_KEY` or the `claude`
CLI. That constraint keeps the system:

- Debuggable on an airplane.
- Cheap to iterate (no token spend).
- Deterministic to eval.
- Safe to demo.

When a feature only works in real mode, we flag it as a C grade and file a
tech-debt row.

## 5. Dual-write every agent event

Each meaningful runtime moment is persisted to two places:

- A row in SQLite (queryable — agents can `sqlite3 .symphony/symphony.db`).
- A line in JSONL (greppable — agents can `rg` a run id without spinning up
  the DB).

The invariant is: the dashboard, replay, and any future agent loop operate
solely from these records. In-memory state is a convenience, not a truth.

## 6. Validate at the boundary, trust inside

External input — YAML, JSON, stream-JSON, GraphQL responses — is parsed once
at the boundary into typed shapes. Past that point, agents may rely on the
types. No `(x as any)` probing. No try/catch around property access.

## 7. Short-lived PRs

Long-lived branches rot. Each Linear issue should produce one PR, short and
merge-ready. If a change is sprawling, break it into ephemeral plans. The
`land` skill assumes short-lived PRs and breaks down when they aren't.

## 8. Taste is encoded, not assumed

When a reviewer says "please always do X", the next step is to write a lint
or a structural test for X. If we can't encode it, it doesn't bind. See
[`golden-principles.md`](golden-principles.md) for how lints are grown.

## 9. Destructive moves require a note

`git worktree remove --force`, DB migration, deleting files not yet tracked,
changing a wire format, reshuffling `docs/` — all require a design note
under [`design-docs/`](.) before the PR lands. The note can be two paragraphs,
but it must exist.

## 10. The harness is the product

Symphony is as much the orchestrator as it is the scaffolding around the
agent: the prompts, the workspace contract, the event log, the replay, the
dashboard. Time spent improving the harness compounds. Time spent tuning any
one prompt does not.
