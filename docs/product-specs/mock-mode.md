# mock-mode: the default way to run Symphony

_Last reviewed:_ 2026-04-18

Mock mode runs Symphony end-to-end with zero external dependencies. It is
how we iterate, how we eval, and how new contributors see the product.

## Users

- **Contributor** — `pnpm dev WORKFLOW.md --mock` without creds.
- **Eval** — `pnpm eval` replays every scenario deterministically.
- **Demo** — the canonical `.github/media/symphony-demo.mp4` runs in mock.

## Inputs

1. `WORKFLOW.md` with `agent.kind: mock` (or pass `--mock`).
2. Scenario files under `fixtures/scenarios/*.yaml`.
3. Optional `--seed <yaml>` or `--no-demo` on the CLI.

## Scenario schema

```yaml
name: <string>
labels: [string] # optional; overlaps with issue.labels for selection
steps:
  - role: assistant | tool
    content: "string"
    delay_ms: 0 # optional; used for realistic timing
    tool_calls: [] # optional; arbitrary JSON
    final_state: "string" # optional; triggers tracker transition
    throw: false # optional; raise a session error
```

Validated by
[`ScenarioSchema`](../../src/agent/mock.ts).

## Scenario selection

1. If `scenarioFor(issue)` is provided (used by the eval), that wins.
2. Otherwise, if the issue has labels and a scenario has an overlapping
   label, pick it.
3. Otherwise, round-robin.

## Invariants

- Mock mode must not reach the network.
- Mock mode must not spawn real processes.
- Scenarios are deterministic: same issue + same seed ⇒ same transcript.
- `MockAgent` requires at least one scenario (throws in its constructor
  otherwise).

## Demo seed

`cli.ts` ships a two-issue `DEMO_ISSUES` array for the out-of-box experience.
`--no-demo` starts with an empty tracker; `--seed <path>` loads a YAML file
of issues validated by `SeedFileSchema`.

## Failure modes

| Failure                                | Surface                                    | Recovery                           |
| -------------------------------------- | ------------------------------------------ | ---------------------------------- |
| Scenario YAML invalid                  | `ScenarioLoadError` at startup             | Fix the YAML.                      |
| Scenario exhausted before run finishes | `Error("scenario <name> exhausted")`       | Add more steps or a `final_state`. |
| No scenarios in dir                    | `MockAgent requires at least one scenario` | Add a scenario.                    |

## Non-goals

- Partial mocks (e.g. real Linear + mock agent). Pick one mode per run.
- Scenario authoring UI.
- Replaying a real run's transcript as a scenario. (Feasible but un-built;
  filed as tech-debt if ever needed.)

## Changelog

- 2026-04-18 — `throw: true` step support.
- 2026-04-18 — `--no-demo` + `--seed`.
