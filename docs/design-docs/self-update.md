# self-update: keep the running instance fresh against main

_Status:_ active
_Created:_ 2026-04-20
_Last reviewed:_ 2026-04-20

## Problem

Symphony often runs itself to improve itself: the operator checks out the
repo, starts the orchestrator, and then merges PRs produced by agents. Once
the orchestrator is up, it never looks at the remote again. The
`after_create` hook in `WORKFLOW.md` bases every new workspace on
`origin/main`, but `origin/main` is whatever ref the repo happened to have
at launch — so workspaces spawned hours later are still branching from a
stale tip. BEN-25 asked for "an option for self-development where we
occasionally update the code from main."

## Decision

A new optional `self_update` block in `WorkflowConfigSchema` turns on a
`SelfUpdater` service. At the start of every `Orchestrator.tick()` (after
the rate-limit check, before we fetch candidate issues), the orchestrator
calls `selfUpdater.maybeFetch()`. The service throttles itself — no more
than one fetch per `min_interval_ms` — and runs `git fetch <remote>
<branch>` on the configured repo, bracketed by `git rev-parse` so we can
report whether the remote actually advanced.

Configuration (front matter in `WORKFLOW.md`):

```yaml
self_update:
  enabled: true # default false; the feature is opt-in
  repo_path: ~/code/foo # default process.cwd()
  branch: main # default main
  min_interval_ms: 600000 # default 10 minutes
```

The orchestrator emits `selfUpdated` with a `SelfUpdateResult` on success
and `selfUpdateError` on failure. The CLI logs both to stdout. No
persistence — the event fires through the existing `EventEmitter` surface
and is consumable by the dashboard via SSE once the UI cares to render it.

## Rationale

- **Fetch-only, never pull.** Worktrees track the `agent/ben-*` branches,
  not `main`. A `git fetch` advances the remote tracking refs without
  touching any checked-out tree. Newly-created worktrees (the
  `after_create` hook branches off `origin/main`) automatically pick up
  the fresher tip; running worktrees are untouched.
- **Throttled inside the service, not the orchestrator.** The updater owns
  its `lastFetchMs`, so the throttling is testable without touching the
  orchestrator and survives poll-interval changes from the settings panel.
- **No schema change.** The `log_events` table has a `NOT NULL run_id` FK,
  which doesn't fit orchestrator-level events. Rather than widen the
  schema for this one feature, we emit in-process events and stream them
  through the existing dashboard/SSE path. Persistence can come later if
  the dashboard needs a history strip (track under tech debt).
- **Dependency-injected `exec`.** Tests pass a fake exec and a fake clock;
  real code uses `child_process.execFile`, matching the
  `WorkspaceManager` pattern.

## Consequences

- `Orchestrator` gains an optional `selfUpdater` provider. Existing
  constructors are backwards-compatible.
- `WorkflowConfigSchema` grows one optional block; zod defaults keep old
  `WORKFLOW.md` files working.
- Two new orchestrator events — `selfUpdated`, `selfUpdateError` — are
  additive per `event-schema-evolution.md`.
- No new SQLite columns; no migration.

## Alternatives considered

- **Run `git pull --ff-only` on main.** Rejected. The orchestrator's
  checkout might not be on `main` (we often start it from `benSepanski/dev`
  or a release branch). A pull could conflict; a fetch is harmless.
- **Tie fetch to a dedicated timer.** Rejected. The orchestrator already
  owns a poll loop; piggy-backing keeps the state machine and shutdown
  path simple. Throttling inside the service handles the interval.
- **Persist every fetch to `log_events`.** Rejected for this PR — would
  require either a synthetic run row or a schema change. Left as a
  follow-up once the dashboard wants to render the history.
- **Run `git fetch` from the `after_create` hook.** Rejected as the
  primary mechanism: hooks are user-authored shell and we'd like a tested
  fallback. The hook is still free to do so; the service is additive.
