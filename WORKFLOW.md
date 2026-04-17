---
tracker:
  kind: linear
  project_slug: "symphony-d18f53b5a82d"
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Blocked
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 1800000
workspace:
  root: ~/myGithubProjects/symphony/worktrees
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
agent:
  kind: claude_code
  max_concurrent_agents: 1
  max_turns: 5
  max_turns_state: Blocked
claude_code:
  command: claude
  model: claude-sonnet-4-6
  permission_mode: full
mock:
  scenarios_dir: fixtures/scenarios
  assignment: round_robin
  default_scenario: happy-path
---

You are working on Linear ticket `{{ issue.identifier }}`.

{% if attempt %}
Continuation context:

- Retry attempt #{{ attempt }} — the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat prior investigation unless new code changes require it.
- Do not end the turn while the issue is in an active state unless blocked by missing permissions/secrets.
  {% endif %}

Issue context:

- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Description:

{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## Completion bar

Do not move the ticket to `Human Review` until:

- Implementation matches the acceptance criteria on the issue.
- `pnpm all` is green.
- Branch is pushed and a PR is linked on the issue.
- PR metadata (labels, description) is in place.

## Guardrails

- Do not edit the issue body. Use one persistent `## Claude Workpad` comment per issue.
- If blocked, leave a single blocker comment and transition the issue to `Blocked`.
- Out-of-scope improvements belong in a new Backlog issue, not an expanding current scope.
- In `Human Review`, do not make changes; wait and poll.
- Terminal states (`Done`, `Cancelled`, `Closed`) are no-ops — shut down for that issue.
