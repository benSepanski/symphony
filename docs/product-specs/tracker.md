# tracker: the issue source

_Last reviewed:_ 2026-04-18

The tracker is the orchestrator's only way to find work. It answers "what
should we run next?" and "how do I mark this done?".

## Users

- **Orchestrator** — calls `fetchCandidateIssues()` once per tick.
- **Run finalizer** — calls `updateIssueState()` on run completion.
- **Agent** (indirectly) — posts progress via `addComment()`.

## Implementations

| Implementation                                 | Mode | Backing store                             |
| ---------------------------------------------- | ---- | ----------------------------------------- |
| [`LinearTracker`](../../src/tracker/linear.ts) | real | Linear GraphQL (`api.linear.app/graphql`) |
| [`MemoryTracker`](../../src/tracker/memory.ts) | mock | `Map<string, Issue>`                      |

## Interface

```ts
interface Tracker {
  fetchCandidateIssues(): Promise<Issue[]>;
  updateIssueState(issueId: string, state: string): Promise<void>;
  addComment(issueId: string, body: string): Promise<void>;
}
```

See [`../design-docs/tracker-abstraction.md`](../design-docs/tracker-abstraction.md)
for the rationale behind keeping it this thin.

## Invariants

- `fetchCandidateIssues()` is idempotent and side-effect-free.
- Results are filtered to `workflow.config.tracker.active_states`.
- `updateIssueState(id, name)` is by human-readable name; the implementation
  resolves the tracker-internal id.
- `addComment()` is best-effort and must not throw on "already commented".
- Issue objects expose a stable shape:

  ```ts
  interface Issue {
    id: string;
    identifier: string; // passes /^[A-Za-z0-9_-]+$/
    title: string;
    description: string | null;
    state: string;
    labels: string[];
    url: string;
  }
  ```

## Failure modes

| Failure                                  | Surface                                                                      | Recovery                               |
| ---------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| Linear 401 (bad token)                   | `LinearApiError` at startup                                                  | Operator regenerates `LINEAR_API_KEY`. |
| Linear 5xx during fetch                  | Error bubbles out of `tick()` → `emit("error")`                              | Next tick retries.                     |
| State not resolvable (renamed in Linear) | `Error("no Linear workflow state named …")` → `state_transition_error` event | Operator updates `WORKFLOW.md`.        |
| Memory tracker missing issue id          | `Error("unknown issue id …")`                                                | Test bug. Fix the seed.                |

## Caching (LinearTracker)

- `teamByIssue: Map<string, string>` — populated by `fetchCandidateIssues`.
- `stateIdByTeam: Map<string, Map<string, string>>` — populated lazily on
  first transition per team.

Both caches live for the process lifetime. If Linear changes a state name
mid-run, the change won't be picked up until the process restarts.

## Non-goals

- Rich Linear semantics: assignee, priority, sub-issues, dependencies.
- Webhook integration.
- Paginating past 100 issues per fetch (add if it becomes a real problem;
  tracked in `../exec-plans/tech-debt-tracker.md`).
