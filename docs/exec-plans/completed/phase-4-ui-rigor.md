# phase-4-ui-rigor: Dashboard polish + search

_Status:_ completed
_Owner:_ human + Codex
_Started:_ 2026-04-18 · _Completed:_ 2026-04-18

## Why

The Phase 1 dashboard was functional but thin: empty state, error surface,
and search were missing. These shipped a dashboard that felt like a tool.

## Scope

In:

- Richer run rows (elapsed time, final state, error surface).
- Live indicators on in-flight runs.
- `--no-demo` flag to start with empty state.
- `/api/search?q=...` + `#/search` route with highlighted matches.

Out:

- Component-level testing (tech-debt — filed).
- Visual QA via browser MCP (tech-debt — filed).

## Plan (executed)

1. Extend `RunDetail` with error + elapsed time.
2. Add status filters on `Dashboard`.
3. Add the `--no-demo` flag to `cli.ts`.
4. Add `SymphonyLogger.search` + `/api/search` + `Search` route.

## Decision log

- 2026-04-18 — `/api/search` uses LIKE `%q%` against turn content +
  event payload. Good enough for < 10k rows; revisit at scale.

## Acceptance

- [x] `pnpm all` green.
- [x] Manual QA against mock + replay flows.

## Retrospective

- Hash-based routing kept the dashboard dead-simple — no router, no context
  provider, one file per route.
- Search is the highest-signal UI feature we've shipped; operators use it
  to find "that flake from yesterday" without opening the DB.

## Shipped artifacts

- `879d427` Richer run rows + --no-demo.
- `5f24941` `/api/search` + search route.
