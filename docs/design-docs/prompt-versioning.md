# prompt-versioning

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

An orchestrator is nothing without its prompt. If the prompt is a string
literal in code, every change is a silent behavior change: transcripts from
two months ago mean nothing because we can't recover the prompt that
generated them. Tuning becomes "try a change and pray we can describe it
later".

## Decision

Prompts are versioned markdown files under [`prompts/`](../../prompts) with
YAML front-matter:

```markdown
---
version: harness-v1
---

You are working on Linear ticket `{{ issue.identifier }}`.
...
```

`WORKFLOW.md`'s `prompt:` field points at the file. The orchestrator renders
per-attempt via [`liquidjs`](https://liquidjs.com/) and records both
`promptVersion` (on the run) and `renderedPrompt` (on every turn).

Inline templates still work (`WORKFLOW.md` body) — they report
`promptVersion: "inline"` so we can tell them apart.

## Rendered-per-turn persistence

Every turn row has a `rendered_prompt` column. Until a turn is taken, the
template string is what we hold; after, we've evaluated it against that
attempt's context (liquid variables: `issue`, `attempt`).

This means an auditor re-reading a run sees exactly what the model saw,
including the "retry attempt #N" language that switches on for attempts > 1.

## Rationale

- **Reproducibility.** Scenario evals compare rendered transcripts; a prompt
  change is visible in the diff.
- **Bisectability.** If behavior changes, we can roll back the prompt
  version without reverting code.
- **Multi-prompt futures.** A later feature could select between prompt
  files by label (e.g. `happy-v2` for bug-fix issues, `investigate-v1` for
  spikes) without changing wiring.

## Invariants

1. Prompt files with a front-matter `version:` string are canonical.
2. Files without front-matter report `version: "unversioned"` and raise a
   warning flag in the doc-gardening eval.
3. The liquid context is always `{ issue, attempt }`. Extending it is a
   cross-layer change: update the orchestrator, the tests, and this doc.
4. A prompt must not reference secrets or environment variables. (liquid is
   configured without filesystem access.)

## Evolving a prompt

- Bump the `version:` string when changing semantics (a noun change, a new
  instruction, a reordering that matters).
- Whitespace-only edits may leave the version alone; there's no test that
  fails on them.
- When a version bump breaks an eval scenario, review the scenario's
  golden; update it in the same PR.

## Consequences

- Tuning a prompt is a reviewable diff. Agents can argue about words without
  touching code.
- Two-phase prompts (e.g. a "setup" prompt followed by a "review" prompt
  per turn) are _not_ supported today. The design note to enable them would
  extend `session.runTurn()` to accept a rendered prompt per turn; TODO.
- Anything a prompt author needs to know about Symphony's own invariants
  lives in [`../../AGENTS.md`](../../AGENTS.md) / the files it links to —
  the prompt itself stays short and task-focused.
