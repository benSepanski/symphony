# docs/PRODUCT_SENSE.md

What Symphony _is_ and, just as importantly, what it is _not_. Before you ship a
feature, confirm it aligns with the sentences below. If it doesn't, either
the feature or this doc is wrong — argue it out in a design note.

---

## One-sentence pitch

> Symphony turns project work into isolated, autonomous implementation runs,
> letting teams manage the work instead of supervising coding agents.

## What Symphony does

1. Polls an issue tracker (Linear in production; memory in mock mode) for work
   in an active state.
2. For each eligible issue, creates an isolated workspace — a git worktree in
   real mode — and spawns one coding agent (`claude` CLI or a scripted mock).
3. Streams every turn into a durable SQLite + JSONL log, viewable live on the
   dashboard or replayable after the fact.
4. Transitions the issue's state based on the agent's reported outcome (done,
   human-review, blocked).

## What Symphony deliberately is not

- **Not a code-review tool.** It _runs_ the agent; it does not grade the PR.
- **Not a chat product.** Humans steer via Linear (+ the dashboard), not by
  interrupting live sessions.
- **Not multi-tenant.** One Symphony instance ⇔ one Linear project ⇔ one repo.
- **Not a generic queue.** The unit of work is always a tracker issue.
- **Not a scheduler.** The only temporal knob is `polling.interval_ms`.
- **Not a secret manager.** `LINEAR_API_KEY` comes from the env; the hook
  scripts are responsible for any other credentials, and they run in the same
  process — the harness does not broker secrets.

## Users

- **Operator.** Configures `WORKFLOW.md`, runs `pnpm dev`, watches the
  dashboard, intervenes when the queue stalls.
- **Reviewer.** Opens PRs Symphony produced, reads the run transcript when
  something looks wrong.
- **Agent.** The only "user" that actually writes code in the repo.

## Loudly-held beliefs

1. **Humans steer; agents execute.** Every decision is either captured in
   `WORKFLOW.md` / `prompts/*.md` (scale) or delivered as a Linear comment
   (one-off). Nothing in the runtime asks a human mid-run.
2. **Repository knowledge is the system of record.** If it isn't in `docs/`,
   an agent cannot act on it.
3. **Mock mode is the default.** Every feature must exercise end-to-end
   without a real Linear key or the `claude` CLI.
4. **One issue, one run, one workspace.** Fan-out across a single issue is a
   footgun we will not add without a design note.
5. **Determinism where possible.** The same scenario against the same prompt
   version produces the same transcript in `src/eval/`.
6. **Every event persisted.** SQLite + JSONL. We never rely on in-memory state
   for anything an auditor would want tomorrow.

## Non-goals (for now)

- Multi-repo orchestration from one Symphony instance.
- Parallel turns within a single session.
- Rich web UI for editing prompts (edit the markdown files).
- Authentication on the dashboard (`trusted environments`-only, per README).
- Hosted / SaaS deployment.

Revisit this list any time a feature proposes to cross one of these lines.
