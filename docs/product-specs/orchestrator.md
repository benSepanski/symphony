# orchestrator: the poll loop

_Last reviewed:_ 2026-04-18

The orchestrator is the kernel: a poll loop that picks candidate issues,
creates workspaces, spawns sessions, records turns, and cleans up. It knows
nothing about Linear, Claude, or git — it composes `Tracker`, `Agent`,
`WorkspaceManager`, and `SymphonyLogger`.

Source: [`src/orchestrator.ts`](../../src/orchestrator.ts). CLI glue:
[`src/cli.ts`](../../src/cli.ts).

## Users

- **Operator** via the CLI (`pnpm dev WORKFLOW.md`).
- **Dashboard** via the shared `EventEmitter` + Hono API.
- **Replay** via the same `EventEmitter` seam (see
  [`replay.md`](replay.md)).

## Inputs

```ts
interface OrchestratorOptions {
  workflow: ParsedWorkflow; // WORKFLOW.md parsed + validated
  tracker: Tracker; // mock or Linear
  agent: Agent; // mock or Claude Code
  workspace: WorkspaceManager; // hook-driven
  logger: SymphonyLogger; // dual-write
  scenarioFor?: (issue) => string | undefined; // eval hook
}
```

## Emitted events (via EventEmitter)

- `runStarted: { runId, issue }`
- `turn: { runId, issue, turn }`
- `runFinished: { runId, issue, status, error? }`
- `error: Error` (operational only — fatal tick failures)

## Lifecycle

See [`../design-docs/execution-model.md`](../design-docs/execution-model.md)
for the full happy-path + error-path trace.

High-level:

1. `start()` begins a `setInterval` at `polling.interval_ms`.
2. Each tick: `tracker.fetchCandidateIssues()` → dedupe against `claimed`
   → cap at `max_concurrent_agents - claimed.size` → `Promise.all(runIssue)`.
3. Each run: `startRun` → `workspace.create` → `agent.startSession` →
   `session.runTurn` loop → `finalizer` (stop, transition, destroy,
   finishRun).

## Invariants

- `claimed` is released in `finally`. No leaked slot.
- `shuttingDown` prevents new runs from starting but permits in-flight
  runs to finalize.
- Max turns is a hard ceiling; exceeding it sets status `max_turns`.
- SIGINT → status `cancelled` (a distinct terminal from `failed`).
- Every turn's rendered prompt is persisted on its row.

## Configuration (WORKFLOW.md)

```yaml
polling:
  interval_ms: 1800000 # 30 min
agent:
  kind: claude_code | mock
  max_concurrent_agents: 1
  max_turns: 5
  max_turns_state: Blocked # tracker state to fall back to
prompt: prompts/harness-v1.md
```

## Failure modes

Documented in the execution model doc. Summary:

- Any step inside `runIssue` that throws goes through the single `finally`,
  which always: stops the session, transitions state, destroys workspace,
  finishes run.

## Non-goals

- Scheduling (cron, priorities, per-issue intervals).
- Fan-out across one issue.
- Cross-process coordination.

## Changelog

- 2026-04-18 — Finalizer pattern: state + workspace cleanup in `finally`.
- 2026-04-18 — New `cancelled` status for SIGINT drains.
