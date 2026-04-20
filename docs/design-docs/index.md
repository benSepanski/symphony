# docs/design-docs/index.md

Indexed catalog of Symphony's design notes. A design note is a short,
versioned markdown file that captures a decision and its rationale. Every note
has a "status" stamped at the top so agents can tell at a glance whether the
note is still in force.

**Status vocabulary**

- `active` — the code reflects this doc. Changes to the code require changes
  here.
- `superseded-by: <path>` — the decision moved. The other doc is authoritative.
- `proposed` — written but not yet applied. Do not rely on it.
- `historical` — kept for context, no longer reflects code.

---

## Core beliefs and mechanics

| Doc                                                                | Status   | One-liner                                                                 |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| [`core-beliefs.md`](core-beliefs.md)                               | active   | The non-negotiable operating principles this repo enforces on agents.     |
| [`golden-principles.md`](golden-principles.md)                     | active   | The full mechanical rules `pnpm all` + review grade every PR against.     |
| [`layered-domain-architecture.md`](layered-domain-architecture.md) | active   | Why `Types → Config → Persistence → Service → Runtime → API` is enforced. |
| [`agent-legibility.md`](agent-legibility.md)                       | active   | Why everything an agent needs must live in-repo, not in chat threads.     |
| [`doc-gardening.md`](doc-gardening.md)                             | proposed | A recurring eval that flags stale docs + missing cross-links.             |

## Runtime mechanics

| Doc                                                      | Status | One-liner                                                                             |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| [`execution-model.md`](execution-model.md)               | active | Poll → claim → workspace → session → turns → transition → destroy — with error paths. |
| [`tracker-abstraction.md`](tracker-abstraction.md)       | active | Why `Tracker` is one small interface with two implementations.                        |
| [`workspace-isolation.md`](workspace-isolation.md)       | active | Git worktree + hook scripts + identifier allow-list.                                  |
| [`prompt-versioning.md`](prompt-versioning.md)           | active | Prompt files + front-matter `version:` + rendered-per-turn persistence.               |
| [`event-log-as-memory.md`](event-log-as-memory.md)       | active | SQLite + JSONL as the only source of truth for run state.                             |
| [`replay-as-a-mirror.md`](replay-as-a-mirror.md)         | active | Why the HTTP server accepts any `EventEmitter`.                                       |
| [`mock-first-development.md`](mock-first-development.md) | active | Mock mode is a first-class mode, not a fixture.                                       |
| [`event-schema-evolution.md`](event-schema-evolution.md) | active | Adding event types is additive; removing them is a migration.                         |
| [`self-update.md`](self-update.md)                       | active | Opt-in `git fetch origin/main` from the poll loop, throttled, fetch-only.             |
| [`threat-model.md`](threat-model.md)                     | active | Who we defend against and what is out of scope.                                       |

---

## When to add a new note

- You made an architecture-shaped decision (crosses layers, introduces a
  provider, changes an invariant in [`../RELIABILITY.md`](../RELIABILITY.md)).
- You resolved a question that kept coming back.
- You deliberately kept a tool or library the system now depends on.

**Template**

```markdown
# <slug>: <short title>

_Status:_ active
_Created:_ YYYY-MM-DD
_Last reviewed:_ YYYY-MM-DD

## Problem

<What was the question?>

## Decision

<What did we do?>

## Rationale

<Why this and not the obvious alternatives?>

## Consequences

<What this commits us to. Any invariants added to RELIABILITY.md or lints to
golden-principles.md get cross-linked here.>

## Alternatives considered

- <alternative> — rejected because <why>.
```

When a note supersedes another, set the older note's status to
`superseded-by: <new>` and link both directions.
