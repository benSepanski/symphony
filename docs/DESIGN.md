# docs/DESIGN.md

Architectural patterns Symphony consistently uses. When in doubt, match these
patterns rather than introducing new ones. Changes to this file require a
companion design note under [`design-docs/`](design-docs/).

---

## 1. Inversion at every I/O boundary

Every module that touches the outside world (network, spawn, filesystem,
database, clock, random) accepts that dependency through its constructor. The
shape lives in `types.ts`; the real implementation lives next to it. Mock
implementations are the test doubles.

Concrete examples:

- `LinearTracker({ fetchImpl })` — swap `globalThis.fetch` for a stub.
- `ClaudeCodeAgent({ spawn })` — swap `node:child_process.spawn`.
- `SymphonyLogger({ now, idGenerator, dbPath })` — deterministic tests.
- `MockAgent({ sleep })` — tests fast-forward scenarios without wall-clock waits.

> **Rule.** If a module can only be tested by `vi.mock("node:child_process")`,
> it belongs one layer up. Inner layers must be unit-testable with pure doubles.

## 2. Typed boundaries, no `any`

All external input is parsed at the edge, once, into typed shapes the rest of
the system can trust.

| Boundary           | Parser                                          | Schema                                               |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `WORKFLOW.md`      | [`parseWorkflow`](../src/config/workflow.ts)    | `WorkflowConfigSchema` (zod)                         |
| YAML scenarios     | [`parseScenario`](../src/agent/mock.ts)         | `ScenarioSchema` (zod)                               |
| YAML seed file     | [`loadSeedIssues`](../src/cli.ts)               | `SeedFileSchema` (zod)                               |
| Linear GraphQL     | [`LinearTracker.gql`](../src/tracker/linear.ts) | Hand-written response types + explicit error surface |
| Claude stream-JSON | [`toAgentTurn`](../src/agent/claude-code.ts)    | `StreamMessage` discriminated union                  |

`unknown` is allowed for payloads written to storage (tool calls, event
payloads). It is not allowed anywhere past the parser. No probing via
`(x as any).foo`.

## 3. Events are the source of truth

Every meaningful runtime moment becomes a log event through
`SymphonyLogger.logEvent(...)` or `SymphonyLogger.recordTurn(...)`. The
orchestrator emits EventEmitter events for the API, but those are a view onto
the persisted record, not a second source of truth. A crashed `.symphony/`
directory fully reconstructs what the orchestrator did.

Supported event types (current):

- `run_started`, `run_finished`
- `turn_recorded`
- `workspace_created`, `workspace_destroyed`, `workspace_destroy_error`
- `session_stop_error`
- `state_transition`, `state_transition_error`
- `error`

Adding an event type is additive and does not require a migration. Removing
one does — see [`design-docs/event-schema-evolution.md`](design-docs/event-schema-evolution.md).

## 4. Small, provider-shaped modules

Each capability — tracker, agent, workspace, logger — fits a
`{ start, do-one-thing, stop }` shape. The orchestrator composes them. This
shape is what makes mock mode viable: swap the implementation, keep the wiring.

```ts
interface Agent {
  startSession(ctx): Promise<AgentSession>;
}
interface AgentSession {
  runTurn(): Promise<AgentTurn>;
  isDone(): boolean;
  stop(): Promise<void>;
}
```

Don't add methods to the interface until a second implementation needs them.

## 5. Deterministic replay

`createReplayEmitter(runId, logger)` reads a past run from SQLite and re-emits
it as if it were live. The rule this protects: every event the API can see
must be derivable from the DB. No transient state.

See [`docs/product-specs/replay.md`](product-specs/replay.md).

## 6. Mock mode is a first-class mode

`--mock` must always work. New features that only function against Linear or
the real `claude` CLI are flagged as risks in
[`docs/QUALITY_SCORE.md`](QUALITY_SCORE.md) and must ship a scenario fixture
under `fixtures/scenarios/` before they count as complete. See
[`design-docs/mock-first-development.md`](design-docs/mock-first-development.md).

## 7. Safe identifiers, always

Any string that reaches `mkdir`, `execFile`, or a URL path is validated
against an allow-list. Today: `assertSafeIdentifier(issue.identifier)` in
[`src/workspace/manager.ts`](../src/workspace/manager.ts) enforces
`/^[A-Za-z0-9_-]+$/`. Apply the same pattern for any new identifier that
escapes into a shell or filesystem.

## 8. Fail fast on required env

Real mode refuses to start without `LINEAR_API_KEY`. Config errors raise
`WorkflowParseError` with a list of zod issues. We never "try to work around"
missing config. See [`docs/SECURITY.md`](SECURITY.md) for the env-var contract.

## 9. Single prompt contract

Prompts are markdown files with a YAML front-matter `version:` string. The
orchestrator renders per attempt via [`liquidjs`](../src/orchestrator.ts) and
writes the rendered body to `turns.rendered_prompt`. Inline prompts report
`promptVersion: "inline"`. See
[`design-docs/prompt-versioning.md`](design-docs/prompt-versioning.md).

## 10. Concurrency is bounded

`workflow.config.agent.max_concurrent_agents` caps the orchestrator's claim
set. Within one run, turn execution is single-threaded (the session owns the
child process). When we need more concurrency, we add capacity, not ad-hoc
parallelism.

## 11. No ambient state for tests

`SymphonyLogger` is the only stateful runtime type. Constructors take explicit
paths (`dbPath`, `logsDir`) so every test gets its own isolated SQLite file
(usually `:memory:` + a scratch JSONL dir). Never rely on a shared `.symphony/`
between tests.

## 12. The shape of a new feature

1. Read the relevant product spec under [`product-specs/`](product-specs/).
2. Extend the Types layer (interface + shape).
3. Add a mock implementation in `src/<domain>/` alongside the real one.
4. Extend the orchestrator's wiring in `cli.ts`.
5. Add a fixture under `fixtures/scenarios/` and a Vitest unit for the
   implementation, plus (if behavior-visible) a scenario in
   `src/eval/scenarios.eval.ts`.
6. Update [`docs/QUALITY_SCORE.md`](QUALITY_SCORE.md) and the product spec.

---

## Taste invariants (lint-enforced)

These are the mechanical rules the `pnpm all` gate checks. They are intentionally
pedantic because they multiply the moment they're encoded:

- `@typescript-eslint/no-unused-vars` — unused vars, args, and caught errors
  are errors; allow `_`-prefixed escape hatch.
- `tsc --noEmit` — strict mode, no implicit any, no unreachable code.
- `prettier --check` — single source of formatting truth; no style debates.
- `vitest run` — unit suite + eval suite, both must be green.

Run `pnpm all` before _every_ commit. If a commit can't pass it, the commit
isn't ready.
