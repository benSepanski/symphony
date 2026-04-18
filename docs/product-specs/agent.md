# agent: the thing that writes code

_Last reviewed:_ 2026-04-18

The agent is the worker that receives a prompt and returns a stream of turns.
Symphony ships two implementations behind one interface.

## Implementations

| Implementation                                      | Mode      | Underlying                                            |
| --------------------------------------------------- | --------- | ----------------------------------------------------- |
| [`ClaudeCodeAgent`](../../src/agent/claude-code.ts) | real      | `claude --output-format stream-json --print <prompt>` |
| [`MockAgent`](../../src/agent/mock.ts)              | mock/test | YAML scenarios in `fixtures/scenarios/`               |

## Interface

```ts
interface Agent {
  startSession(ctx: AgentStartContext): Promise<AgentSession>;
}

interface AgentSession {
  runTurn(): Promise<AgentTurn>;
  isDone(): boolean;
  stop(): Promise<void>;
}

interface AgentTurn {
  role: "assistant" | "tool" | "user";
  content: string;
  toolCalls?: unknown[];
  finalState?: string;
}
```

## Invariants

- `startSession` is async because the real agent spawns a child; do not
  assume a process is running synchronously.
- `runTurn()` is awaited serially; the next turn must not be requested
  while a prior `runTurn()` is in flight.
- `isDone()` is monotonic: it flips from false to true exactly once.
- `stop()` is safe to call at any time, including before the first turn.
  Real mode uses SIGTERM with a 2 s grace then SIGKILL.
- `finalState`, if present, is a tracker state name and triggers a
  transition in the orchestrator finalizer.

## Real agent: stream parsing

`ClaudeCodeAgent` spawns the CLI, reads newline-delimited JSON from stdout,
and converts each accepted message into an `AgentTurn` via
[`toAgentTurn`](../../src/agent/claude-code.ts).

- Unparseable lines are dropped.
- `type: "result"` closes the stream.
- `stderrBuffer` is capped at 8 KiB.
- Exit code ≠ 0 surfaces as an `exitError` that `runTurn()` rejects with.

## Mock agent: scenarios

`MockAgent` picks a scenario per session and plays back its `steps`. Selection:

1. If the issue has labels and a scenario has an overlapping label, match.
2. Otherwise, round-robin.

A `throw: true` step raises mid-session (tests crash cleanup).

See [`mock-mode.md`](mock-mode.md) for the full scenario schema.

## Failure modes

| Failure                              | Surface                            | Recovery                                             |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| `claude` child exits non-zero        | `runTurn` rejects with `exitError` | Orchestrator transitions issue to `max_turns_state`. |
| `claude` emits malformed stream-json | Line dropped; no crash             | Covered by `claude-code.test.ts`.                    |
| Mock scenario exhausted              | `scenario <name> exhausted`        | Test bug; add more steps or update the eval.         |

## Non-goals

- In-session retry. If the `claude` child fails, the orchestrator marks
  the run `failed`; a higher-level policy (next poll tick) re-queues.
- Parallel turns in one session.
- Cross-session context sharing. Each `startSession` is independent.

## Evolution

Adding a third agent implementation:

1. Add to `src/agent/<kind>.ts`.
2. Extend `WorkflowConfigSchema.agent.kind`.
3. Wire in `cli.ts`.
4. Add at least one scenario exercising it (or document why not) and
   update `docs/QUALITY_SCORE.md`.
