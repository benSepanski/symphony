# breakdown-nudge: comment when a run hits the wall

_Status:_ active
_Created:_ 2026-04-25
_Last reviewed:_ 2026-04-25

## Problem

A run that hits `max_turns` or fails mid-scenario already transitions the
issue to `max_turns_state` (`Blocked` by default). That is the harness's
current "contact the human" path — but the human gets a state change with no
context. They have to dig through `.symphony/logs/` or open the dashboard's
run detail to learn whether the agent ran out of turns, crashed on a tool
call, or tripped over a missing fixture. The result: tasks that should be
broken into smaller sub-issues sit in `Blocked` until somebody notices and
pieces the story together by hand.

[BEN-22](https://linear.app/bensepanski/issue/BEN-22/break-down-tasks) frames
the wider problem as "when tasks are taking too many turns or not successful,
try to break them into multiple sub-issues and contact the human."

## Decision

When a run finalizes with `status === "max_turns"` or `status === "failed"`,
the orchestrator's finalizer posts one structured Linear comment on the
issue via the existing `Tracker.addComment` capability:

```
## Symphony auto-pause

This run hit the **5-turn limit** after 5 turn(s). The harness has
transitioned the issue to `Blocked`.

If the work is sprawling, **break it into smaller sub-issues** and link
them back here. Otherwise, fix the underlying blocker (missing doc,
fixture, lint, permission), then move the issue back to an active state
to retry.

Run id: `…`
```

The post is wrapped in a try/catch:

- On success → `breakdown_comment_posted` event (SQLite + JSONL).
- On failure → `breakdown_comment_error` event; the run still finishes
  normally. Comment posting is best-effort, like the existing
  `state_transition_error` handling.

`cancelled` and `rate_limited` runs do **not** trigger the comment. Those
are operational interruptions, not task failures — the human already knows
about a SIGINT or a capped 5-hour window.

## Rationale

- **Encode taste, don't assume it.** Golden principle #8 says taste that
  cannot be encoded drifts. "Tell the human when a run dies" is taste; this
  PR makes it a hard rule.
- **Use what exists.** `Tracker.addComment` is already in the interface and
  already implemented by both `LinearTracker` and `MemoryTracker`. No new
  surface, no new provider, no schema change.
- **Suggest, don't auto-fan-out.** The Tracker abstraction explicitly lists
  sub-issues as a non-goal (`docs/product-specs/tracker.md` § Non-goals).
  Auto-creating sub-issues would require a new GraphQL surface, an opinion
  about how to slice the work, and a new mock for tests. The minimum
  intervention — a one-line nudge to the human, who already has the full
  Linear UI — captures the intent without expanding scope.
- **Distinct heading.** `## Symphony auto-pause` is deliberately different
  from the agent's `## Claude Workpad` heading so the two streams don't
  collide on the same issue.

## Consequences

- `MemoryTracker.getComments(issueId)` is the test seam; `addComment` is
  exercised by every `max_turns` / `failed` orchestrator path.
- Future work can ride on the same hook: e.g. attaching the failing turn's
  rendered prompt as a snippet, or suggesting specific sub-issues by parsing
  the last assistant turn. Both are additive.
- If the harness ever grows a richer tracker capability (`createSubIssue`),
  this comment becomes a natural place to wire it in.

## Alternatives considered

- **Auto-create sub-issues.** Rejected: requires new tracker surface and
  encodes a heuristic ("split into N tasks of ≤ M turns") we don't yet have
  evidence for. The human is one click away from filing a sub-issue
  themselves, with full context.
- **Stuff the breakdown nudge into the prompt template.** Rejected: the
  agent only sees the prompt while a session is alive. By the time the run
  hits `max_turns` the session is already torn down. The nudge has to come
  from the harness, not the agent.
- **Make the comment opt-in via WORKFLOW.md.** Rejected: golden principle #8
  says encode taste rather than offer escape hatches. If the comment is
  noisy in practice, we can iterate the body — but the rule itself stays
  on by default.
