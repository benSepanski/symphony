# workspace-isolation

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Running a coding agent directly against the operator's working copy is an
immediate disaster: branches get clobbered, half-finished changes get
overwritten, and two concurrent runs race on `package-lock.yaml`. The agent
needs a private playground per issue that still has a valid git history.

## Decision

Each run gets a dedicated **git worktree** under
`workflow.config.workspace.root`, named after the issue identifier. The
worktree lives on a per-issue branch (`agent/<slug>`) that either already
exists (resumption) or is created fresh from `origin/main`.

[`WorkspaceManager`](../../src/workspace/manager.ts) owns:

1. Creating the directory and running the `after_create` hook.
2. Running the `before_remove` hook and removing the directory on tear-down.
3. Validating the issue identifier via
   [`assertSafeIdentifier`](../../src/workspace/manager.ts).

The hook scripts (see [`WORKFLOW.md`](../../WORKFLOW.md)) do the actual
`git worktree add/remove`. The manager is deliberately agnostic: it doesn't
know _how_ a workspace is created, only that a script can do it.

## Identifier safety

Issue identifiers come from an external tracker. They become filesystem path
components and (in Linear-style IDs) sometimes branch-name segments.
Therefore:

```ts
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9_-]+$/;
```

Anything that doesn't match yields `UnsafeIdentifierError`. This is the
canonical guard against `../../../etc/passwd`-style inputs.

Every new filesystem or shell use keyed on external input must either call
`assertSafeIdentifier` or bring its own allow-list.

## Hooks

Hook scripts are bash blocks in `WORKFLOW.md` — plain strings that the
manager invokes via:

```ts
execFileAsync("bash", ["-eu", "-c", script], { cwd, env, timeout });
```

- `-e` fail on the first non-zero command.
- `-u` fail on an unset variable.
- `timeout` bounded by `hookTimeoutMs` (default 5 min).
- `maxBuffer: 10 MiB`.

The env the hook sees is `process.env` + a fixed additive set:

```
ISSUE_ID, ISSUE_IDENTIFIER, ISSUE_TITLE, ISSUE_STATE, ISSUE_URL, ISSUE_LABELS
```

No interpolation into the hook body. Hooks reference these env vars by name.

## Rationale

- **Worktrees over clones.** A worktree shares the object DB with the main
  repo, so there's no per-run disk duplication. Branch management is a
  plain `git worktree add/remove`.
- **Hooks over hard-coded logic.** The manager doesn't know or care that we
  use worktrees. A different operator can plug in container-based workspaces
  by rewriting the hooks.
- **Identifier allow-list over escaping.** Escaping is fragile; rejection is
  loud.

## Failure modes

| Scenario                              | Surface                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| `after_create` hook exits non-zero    | `HookError` → orchestrator `failed`                      |
| `after_create` hook times out         | `HookError` with `exitCode: null`                        |
| `before_remove` hook fails            | `workspace_destroy_error` event; directory still deleted |
| Directory remove fails                | `workspace_destroy_error` event                          |
| Identifier fails `SAFE_IDENTIFIER_RE` | `UnsafeIdentifierError`                                  |

## Consequences

- The orchestrator can assume a fresh, clean `cwd` for the agent every run.
- A failed hook is a halt condition, not a silent leak.
- Branch lifecycle (`agent/<slug>`) is entirely inside the hook scripts; the
  manager does not inspect git.
- If we ever ditch worktrees for containers, only the hooks change. The
  manager stays.

## Alternatives considered

- **Full clone per run.** Correct but expensive (~1 GB copy); disk pressure
  on the operator machine.
- **Container per run.** Best isolation, worst latency + most complexity.
  Reserved for a future design note if/when we ship hosted mode.
- **Just run in the main repo.** Rejected outright — it's the problem.
