# spec-check: pause for clarification before burning a turn budget

_Status:_ active
_Created:_ 2026-04-26
_Last reviewed:_ 2026-04-26

## Problem

A Linear ticket like _"Code quality"_ or _"Review docs"_ is technically a
valid task — it has a title, an active state, and a workflow that picks it
up — but it is not a _well-specified_ task. An agent that dives in will
either guess the user's intent (and produce a PR the human throws away) or
fan out across the repo until `max_turns` cuts it off. Both outcomes burn the
hourly budget without moving the human's actual goal forward. BEN-19 names
this directly: _"Consider if a task is under-specified, or for large design
tasks **when needed** ask the user for more input."_

The pre-existing prompt (`prompts/harness-v1.md`) only handled the trivial
case — `issue.description` literally empty. A one-paragraph but ambiguous
description still walked straight into the implementation phase.

## Decision

A new "Spec check" preflight section in the agent prompt
(`prompts/harness-v2.md`) runs **before any code changes**. The agent
evaluates four invariants on the ticket:

1. The deliverable is concrete (a measurable artifact, not a vague review).
2. Success is checkable without asking the human (a test, a heading, a
   query result — something objective).
3. Scope is bounded — a ≤ 500-line PR is plausible, or the ticket
   explicitly authorizes a multi-PR plan under `docs/exec-plans/active/`.
4. Cross-cutting decisions (new APIs, new columns, new dependencies, UI
   redesigns) are decided in the description or explicitly delegated.

If any invariant fails the agent **does not start coding.** It posts a
single `## Claude Workpad` comment that quotes the ambiguity, states the
default interpretation it would otherwise execute, and asks one or two
pointed questions. Then it transitions the ticket to `Blocked`. The next
hourly run picks up once the human has answered.

The prompt's `version:` bumps to `harness-v2`; `WORKFLOW.md`'s `prompt:`
field swaps over. Old transcripts that reference `harness-v1` keep their
provenance — the file remains on disk per the
[`prompt-versioning.md`](prompt-versioning.md) contract.

## Rationale

- **Asking is cheap; rework is not.** A clarification round costs one
  Workpad comment. A wrong PR costs the agent's turn budget _plus_ the
  human's review attention _plus_ the round-trip to delete the branch.
- **The check belongs in the prompt, not the orchestrator.** Whether a
  ticket is "well-specified" is a judgement call against the description's
  prose; the orchestrator can't do that. A heuristic on description length
  would mis-fire on short-but-clear tickets ("Bump TypeScript to 5.7") and
  miss long-but-vague ones ("Improve the dashboard").
- **Don't ask for documented defaults.** The check explicitly tells the
  agent to read `docs/design-docs/` first. Otherwise the failure mode is
  the agent stalling every ticket on questions whose answers are already
  in the repo.
- **One Workpad comment, then `Blocked`.** Matches the existing guardrails
  on the harness prompt and the cron-runner contract — the human gets one
  high-signal blocker, not a thread.

## Consequences

- Agents may now legitimately move tickets to `Blocked` early, without
  having attempted code. The cron runner's "skip tickets in `Blocked`"
  rule already handles that; no orchestrator change required.
- Tickets like BEN-44 (_"Code quality"_), BEN-43 (_"Review docs"_),
  BEN-41 (_"UI Review"_), BEN-53 (_"UI Review"_) — repeating umbrella
  tickets with no acceptance criteria — will be blocked on first pickup
  rather than producing speculative PRs. This is the intended behavior.
- No code, schema, event, or test-fixture changes. The diff is a new
  prompt file, a one-line `WORKFLOW.md` swap, this design note, and a
  pinning test that asserts `WORKFLOW.md` loads `harness-v2` and that the
  rendered output for a "real" issue carries the Spec-check section.

## Alternatives considered

- **Heuristic in the orchestrator (description length, presence of
  "Acceptance criteria" heading).** Rejected: brittle, mis-fires on short
  bug reports ("404 on /api/runs"), misses long-but-vague design tickets.
  Whether scope is bounded is a semantic judgement the model is better at
  than a regex.
- **Add a new tracker capability `requestClarification(issueId, body)`.**
  Rejected for this PR: tracker surface is intentionally small and the
  existing `addComment` + `updateIssueState(Blocked)` already does
  exactly what we need. Adding a typed verb is overkill.
- **Edit `prompts/default-v1.md` in place instead of bumping
  `harness-v1` → `harness-v2`.** Rejected: `prompt-versioning.md`'s
  invariant is _bump the version on a semantic change_. A new preflight
  section is unambiguously semantic.
- **Keep silent and rely on `max_turns` to cut off bad runs.** Rejected
  outright — that's the failure mode BEN-19 was filed against, and BEN-22
  separately addresses the comment that fires _after_ `max_turns`. A
  preflight comment _before_ a wasted run is strictly more useful than
  one _after_.
