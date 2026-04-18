---
version: v1
---

You are working on Linear ticket `{{ issue.identifier }}`.

{% if attempt > 1 %}
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
