# Testing

## Quick Reference

```bash
make all          # full CI gate (format, lint, coverage, dialyzer)
make test         # unit tests only
make coverage     # tests with coverage enforcement
make e2e          # live end-to-end tests (requires Docker + API keys)
```

## Strategy

- **Unit tests** cover business logic in isolation. The `Tracker.Memory` adapter
  replaces the real Linear client in tests.
- **Snapshot tests** (`StatusDashboard`) pin terminal output against golden files
  in `test/fixtures/status_dashboard_snapshots/`.
- **Spec-check tests** verify that the `mix specs.check` and `mix pr_body.check`
  Mix tasks correctly enforce their rules.
- **Live E2E tests** run Symphony inside Docker against real Linear and Codex
  APIs. These are gated behind `make e2e` and are not part of the default CI
  gate.

## CI Gate

The required CI gate is `make all`, which runs:

`setup → build → fmt-check → lint → coverage → dialyzer`

All checks must pass before committing. The GitHub Actions workflow
(`.github/workflows/make-all.yml`) runs this on every PR and push to `main`.

## Writing Tests

- Place tests in `test/` mirroring the `lib/` directory structure.
- Use `test/support/test_support.exs` for shared test helpers.
- Use `test/support/snapshot_support.exs` for snapshot comparison utilities.
- Snapshot tests use evidence files (`.evidence.md`) paired with golden
  output (`.snapshot.txt`).

## Validation Before Handoff

Run targeted tests while iterating, then run the full gate before committing:

```bash
mix test test/path/to/specific_test.exs   # iterate fast
make all                                    # before commit
```
