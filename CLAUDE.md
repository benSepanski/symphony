# Symphony

An orchestrator service that polls Linear issues and runs coding agents in isolated workspaces.
The reference implementation is in `elixir/`.

## Cloud Environment

Toolchain: Erlang/OTP 28, Elixir 1.19.5 (installed via `mise`, see `elixir/mise.toml`).
The cloud setup script (`cloud-setup.sh`) installs mise + the toolchain on first session start.

## CI Validation

**Before committing, always run the full CI gate from `elixir/`:**

```bash
cd elixir && make all
```

This runs: `setup -> build -> fmt-check -> lint -> coverage -> dialyzer`.

Do not commit if `make all` fails. Fix all errors first.

## Codebase Guide

See `elixir/AGENTS.md` for detailed conventions, test instructions, and coding rules.
See `SPEC.md` for the language-agnostic specification.
