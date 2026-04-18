# tracker-abstraction

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Symphony's core loop needs an issue source, but the issue source is the most
likely thing to change: today it's Linear; tomorrow it could be Linear v2,
GitHub Issues, or a bespoke backend. If we let Linear shape bleed into the
orchestrator, every tracker swap becomes a rewrite.

## Decision

A single, minimal interface — [`Tracker`](../../src/tracker/types.ts) — with
three methods:

```ts
interface Tracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  updateIssueState(issueId: string, state: string): Promise<void>;
  addComment(issueId: string, body: string): Promise<void>;
}
```

Two implementations:

- [`LinearTracker`](../../src/tracker/linear.ts) — production Linear GraphQL.
- [`MemoryTracker`](../../src/tracker/memory.ts) — in-memory, mock-mode.

The orchestrator accepts a `Tracker`; never a concrete type.

## Rationale

- The interface only captures _what_ the orchestrator needs. It has no
  concept of "labels", "teams", "priorities", "view filters", etc.
- Both implementations fit in < 200 LOC each. Adding a third (GitHub Issues)
  is plausibly one afternoon.
- The interface is easy to fake in tests — no network, no `vi.mock`.

## Invariants

- `fetchCandidateIssues()` is idempotent and side-effect-free. The
  orchestrator may call it many times per minute.
- `updateIssueState()` accepts a human-readable state name (e.g.
  `"Blocked"`, `"Human Review"`). Implementations are responsible for
  resolving the name to a tracker-internal id (see `LinearTracker.resolveStateId`).
- `addComment()` is best-effort; it must not throw on "already commented"
  semantics because Linear doesn't guarantee them.

## Caching

`LinearTracker` caches:

1. `teamByIssue`: issueId → teamId. Populated by
   `fetchCandidateIssues()`, used by `updateIssueState()` so state
   transitions don't re-query for the team.
2. `stateIdByTeam`: teamId → (stateName → stateId). Filled lazily on first
   transition per team.

Both caches live for the process lifetime. If Linear adds/renames states
mid-run, they'll 404; the surfaced error gets logged as
`state_transition_error`.

## Drift watch

Linear's GraphQL schema has historically renamed filter fields:

- `project.slugId.eq` → `project.slugId` → `project.id.eq` — we've seen all three.
- `workflowStates` nesting has moved.

When the real smoke test fails at this boundary, the remediation is to
update [`ISSUES_QUERY`](../../src/tracker/linear.ts) and add a regression
fixture (TODO: an eval that asserts the current query shape against a local
JSON-schema snapshot).

## Consequences

- New tracker implementations just need the three methods and whatever
  caching they want. They don't touch anything in Runtime.
- Tracker-specific concepts (labels for mock-mode scenario assignment) are
  carried on the `Issue` type as a nullable field (`labels: string[]`);
  trackers that don't have them emit `[]`.
- The orchestrator cannot ask "does this issue have a sub-issue?" or "who is
  the assignee?" through this interface. That's intentional. If we need it,
  it becomes a new method with a corresponding `MemoryTracker` stub.
