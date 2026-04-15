# Coding Conventions

Rules and patterns that keep the codebase consistent. Linters and CI enforce
what they can; everything else relies on review discipline.

## Typespec Requirements

- Every public function (`def`) in `lib/` must have an adjacent `@spec`.
- `defp` specs are optional.
- `@impl` callback implementations are exempt from a local `@spec`.
- Validate with: `mix specs.check`

## Configuration

- Access runtime config through `SymphonyElixir.Config` (backed by `WORKFLOW.md`
  front matter). Do not read environment variables directly for config that
  belongs in the workflow file.
- Exception: `LINEAR_API_KEY` is read from the environment when `tracker.api_key`
  is omitted from `WORKFLOW.md`.

## Workspace Safety

- Never run a coding agent with `cwd` set to the source repo.
- Workspaces must stay under the configured workspace root (`PathSafety`).

## Concurrency

- `Orchestrator` is stateful and concurrency-sensitive. Preserve retry,
  reconciliation, and cleanup semantics when modifying it.
- Async work goes through `Task.Supervisor` (named `SymphonyElixir.TaskSupervisor`).

## Style

- Follow existing module and naming patterns in `lib/symphony_elixir/*`.
- Keep changes narrowly scoped; avoid unrelated refactors in the same PR.
- Adapter boundaries (`Agent`, `Tracker`, `Workspace`) use behaviour callbacks.
  Add new external integrations behind a behaviour, not as direct calls.

## Spec / Implementation Alignment

- The implementation may be a superset of `SPEC.md`.
- The implementation must not conflict with `SPEC.md`.
- If a change meaningfully alters intended behavior, update the spec in the
  same PR so it stays current.
