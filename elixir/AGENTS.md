# Symphony Elixir

Elixir orchestration service that polls Linear, creates per-issue workspaces,
and runs coding agents (Codex / Claude Code) in isolation.

## Quick Orientation

| What you need | Where to look |
|---------------|---------------|
| System architecture & module layers | [`docs/architecture.md`](docs/architecture.md) |
| Coding conventions & style rules | [`docs/conventions.md`](docs/conventions.md) |
| Testing strategy & CI gate | [`docs/testing.md`](docs/testing.md) |
| PR body format & docs-update policy | [`docs/pr-requirements.md`](docs/pr-requirements.md) |
| Structured logging conventions | [`docs/logging.md`](docs/logging.md) |
| Codex token usage semantics | [`docs/token_accounting.md`](docs/token_accounting.md) |
| Language-agnostic spec | [`../SPEC.md`](../SPEC.md) |
| Workflow / runtime config contract | [`WORKFLOW.md`](WORKFLOW.md) |

## Environment

- Elixir `1.19.x` (OTP 28) via `mise` — see [`mise.toml`](mise.toml).
- Install deps: `mix setup`
- Full CI gate: `make all` (format check → lint → coverage → dialyzer).

## Key Rules (enforced)

These are the most common sources of CI failure. See the linked docs for full details.

1. **Public `@spec` required** — every `def` in `lib/` needs an adjacent `@spec`.
   `@impl` callbacks are exempt. Validate: `mix specs.check`
   → [`docs/conventions.md`](docs/conventions.md)

2. **Workspace safety** — never run an agent with `cwd` in the source repo.
   Workspaces must stay under the configured root.
   → [`docs/conventions.md`](docs/conventions.md)

3. **PR body template** — must follow `.github/pull_request_template.md`.
   Validate: `mix pr_body.check --file <path>`
   → [`docs/pr-requirements.md`](docs/pr-requirements.md)

4. **Spec alignment** — implementation must not conflict with `SPEC.md`.
   Update the spec in the same PR when behavior changes.
   → [`docs/conventions.md`](docs/conventions.md)

## Codebase Entry Points

- **Application boot**: `lib/symphony_elixir.ex` → supervision tree.
- **Poll loop**: `lib/symphony_elixir/orchestrator.ex`.
- **Single-issue execution**: `lib/symphony_elixir/agent_runner.ex`.
- **Config loading**: `lib/symphony_elixir/config.ex` (from `WORKFLOW.md`).
- **Adapter boundaries**: `lib/symphony_elixir/agent.ex`, `tracker.ex`, `workspace.ex`.

## Validation

Run targeted tests while iterating, then the full gate before commit:

```bash
mix test test/path/to/specific_test.exs   # iterate fast
make all                                    # before commit
```
