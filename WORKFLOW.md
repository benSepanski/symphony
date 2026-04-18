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
prompt: prompts/default-v1.md
---

The full prompt template lives in `prompts/default-v1.md`. This
body is ignored when `prompt:` is set above — it's only used as an
inline fallback for workflows that don't reference an external prompt
file.
