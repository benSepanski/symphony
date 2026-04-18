# isolated-runs: one workspace per run

_Last reviewed:_ 2026-04-18

Every orchestrator run gets a private directory — a git worktree in real mode,
a plain dir in mock mode. The agent's `cwd` is this directory; anything it
writes is confined here until the `before_remove` hook tears it down.

## Users

- **Orchestrator** — constructs + destroys one workspace per run via
  [`WorkspaceManager`](../../src/workspace/manager.ts).
- **`after_create` hook** — sets up a git worktree on the `agent/<slug>`
  branch.
- **`before_remove` hook** — removes the worktree and its branch.

## Lifecycle

```
WorkspaceManager.create(issue)
  ├─ assertSafeIdentifier(issue.identifier)
  ├─ mkdir -p <root>/<identifier>
  └─ bash -eu -c "<after_create>" with ISSUE_* env

WorkspaceManager.destroy(issue)
  ├─ bash -eu -c "<before_remove>" with ISSUE_* env
  └─ rmSync <root>/<identifier> { recursive, force }
```

## Inputs

- `workflow.config.workspace.root` — absolute path or `~/…`; created on
  startup.
- `workflow.config.hooks.after_create` / `before_remove` — bash strings.
- `issue.identifier` — must match `/^[A-Za-z0-9_-]+$/`.

## Invariants

- One workspace per active run. Concurrent runs each use a dedicated path.
- Hook scripts run with `bash -eu -c …` and a 5-minute timeout by default.
- The hook env contains the fixed set:
  `ISSUE_ID, ISSUE_IDENTIFIER, ISSUE_TITLE, ISSUE_STATE, ISSUE_URL, ISSUE_LABELS`.
- Destroy is idempotent: running it on a missing directory is a no-op.
- Unsafe identifiers are rejected before any filesystem write.

## Failure modes

| Failure                             | Surface                                                  | Recovery                                                               |
| ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Identifier fails regex              | `UnsafeIdentifierError`                                  | Fix the tracker; don't paper over the error.                           |
| `after_create` hook non-zero        | `HookError` (exit code + stderr)                         | Operator inspects hook; orchestrator moves issue to `max_turns_state`. |
| `after_create` hook timeout         | `HookError` with `exitCode: null`                        | Increase `hookTimeoutMs` via code change + design note.                |
| `before_remove` hook fails          | `workspace_destroy_error` event; directory still deleted | Best-effort; not fatal.                                                |
| Directory remove fails (e.g. EBUSY) | `workspace_destroy_error` event                          | Next run sees the leftover and the hook recovers.                      |

## Workflow snippet (today)

```yaml
hooks:
  after_create: |
    REPO="$HOME/myGithubProjects/symphony"
    BRANCH="agent/$(basename "$PWD" | tr '[:upper:]' '[:lower:]')"
    WORKSPACE="$(pwd)"
    cd "$(dirname "$WORKSPACE")"
    rmdir "$WORKSPACE"
    git -C "$REPO" worktree prune
    if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
      git -C "$REPO" worktree add "$WORKSPACE" "$BRANCH"
    else
      git -C "$REPO" worktree add "$WORKSPACE" -b "$BRANCH" origin/main
    fi
  before_remove: |
    REPO="$HOME/myGithubProjects/symphony"
    BRANCH="agent/$(basename "$PWD" | tr '[:upper:]' '[:lower:]')"
    git -C "$REPO" worktree remove "$(pwd)" --force 2>/dev/null || true
    git -C "$REPO" branch -D "$BRANCH" 2>/dev/null || true
```

## Non-goals

- Container-level isolation.
- Per-run networking policy.
- Per-run disk quota enforcement.

If those are needed, see
[`../design-docs/workspace-isolation.md`](../design-docs/workspace-isolation.md)
for the alternatives considered.

## Changelog

- 2026-04-18 — Added `assertSafeIdentifier` + `UnsafeIdentifierError`.
- 2026-04-18 — Froze the `ISSUE_*` env-var contract in the hook env.
