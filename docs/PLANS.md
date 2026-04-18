# docs/PLANS.md

Plans are first-class artifacts in Symphony. Every non-trivial change carries a
plan; every shipped plan becomes a post-mortem in `exec-plans/completed/`.

This mirrors OpenAI's ["plans as first-class artifacts"][hep] practice: active
plans, completed plans, and known tech debt are all versioned and co-located so
agents can operate without any external context.

[hep]: https://openai.com/index/harness-engineering/

---

## When to write a plan

| Change shape                           | Plan artifact                                                 |
| -------------------------------------- | ------------------------------------------------------------- |
| Typo, one-line fix, dependency bump    | **Ephemeral** — just the PR description.                      |
| Single-file behavior change            | **Ephemeral** — PR description + any design-doc delta.        |
| New module, new migration, cross-layer | **Execution plan** — a markdown file in `exec-plans/active/`. |
| New product surface / domain           | **Execution plan + design note** in `design-docs/`.           |
| Architectural refactor                 | **Execution plan + update to `ARCHITECTURE.md`**.             |

If you're unsure, write the plan. Three bullets of structure beat none.

## Where they live

```
docs/exec-plans/
├── active/                # in-flight plans. One file per initiative.
│   └── <slug>.md
├── completed/             # post-mortems. Renamed from active/ on ship.
│   └── <slug>.md
└── tech-debt-tracker.md   # running registry of known debt + owners.
```

Promote `active/<slug>.md` → `completed/<slug>.md` in the PR that lands the
final piece of work.

## Execution plan template

```markdown
# <slug>: <one-sentence goal>

_Status:_ draft | in-progress | completed | cancelled
_Owner:_ <agent / human / pair>
_Started:_ YYYY-MM-DD · _Completed:_ YYYY-MM-DD

## Why

<Motivation in 2–5 bullets. Link to the Linear issue(s) if any.>

## Scope

**In:**

- <bullet>

**Out:**

- <bullet — what we explicitly deferred>

## Plan

1. <Concrete step, file(s) touched, expected test>
2. ...

## Decision log

<One bullet per material decision. Date-stamped. Include rationale.>

- YYYY-MM-DD — <decision> — <why>

## Risks + mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| ...  | low/med/hi | ...        |

## Acceptance

- [ ] `pnpm all` green.
- [ ] Product spec updated.
- [ ] `docs/QUALITY_SCORE.md` grade re-evaluated.
- [ ] Relevant design docs cross-linked.
- [ ] Entry appended to `PROGRESS.md` checkpoint log.
```

## Completed plan template

A completed plan keeps the original body and appends:

```markdown
## Retrospective

<What actually happened, what broke, what we'd do differently.>

## Shipped artifacts

- Commits: <hashes>
- PRs: <numbers>
- Eval scenarios added: <names>
```

## The tech-debt tracker

`exec-plans/tech-debt-tracker.md` is a plain markdown table of known issues
that are _not_ currently on anyone's plate. Agents hitting a workaround must
append a row before moving on; the doc-gardening eval fails when the tracker
goes stale.

---

## Ephemeral plans

For small changes you don't need a file — but the plan still has to exist
somewhere the agent can see. The acceptable places, in priority order:

1. The PR description.
2. The top of the Linear issue comment thread.
3. A `TODO(slug):` comment in the code referencing `design-docs/TODOS.md`.

An agent that starts coding without an ephemeral plan at minimum is operating
out of harness.
