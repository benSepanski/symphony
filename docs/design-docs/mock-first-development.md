# mock-first-development

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Every time a developer has to spend real tokens or hit real Linear to exercise
a change, iteration slows and costs rise. If mock mode is bolted on, it drifts
from real mode and becomes a liar. We need mock mode to be a first-class,
continuously-exercised path.

## Decision

Symphony has two agent implementations behind the same `Agent` interface:

- [`ClaudeCodeAgent`](../../src/agent/claude-code.ts) — spawns the real CLI.
- [`MockAgent`](../../src/agent/mock.ts) — plays back a YAML scenario.

The CLI's `--mock` flag (plus `agent.kind: mock` in `WORKFLOW.md`) swaps the
agent **and** the tracker: `MemoryTracker` stands in for `LinearTracker`.
Everything else — orchestrator, workspace, logger, API, web — is identical.

Mock mode is exercised by the eval suite (`pnpm eval`) on every `pnpm all`.

## Scenarios

Scenarios live under `fixtures/scenarios/*.yaml`:

```yaml
name: happy-path
labels: [happy]
steps:
  - role: assistant
    delay_ms: 100
    content: "Reading the issue..."
  - role: tool
    content: "Ran: `pnpm test` — 1 new failing test added."
    tool_calls:
      - name: bash
        input: { command: "pnpm test" }
  - role: assistant
    delay_ms: 50
    content: "PR opened. Transitioning to Human Review."
    final_state: "Human Review"
```

- Scenario `labels` overlap with issue labels; `MockAgent`'s default selector
  matches label → scenario and falls back to round-robin.
- Scenarios support a `throw: true` step to simulate crashes mid-session.
- The mock tracker's `activeStates` and issue seed determine the fetch
  behavior.

## Invariants

1. Every feature that reaches production must be exercisable in `--mock`.
   If it cannot, `docs/QUALITY_SCORE.md` records the gap.
2. Scenarios are deterministic: same input → same transcript. No real-time
   sleeps in tests (use the injected `sleep`).
3. Adding a scenario is additive; removing one requires updating
   `src/eval/scenarios.eval.ts`.

## Rationale

- **Iteration latency.** `pnpm dev WORKFLOW.md --mock` boots the whole stack
  in < 1 s. No `claude` authentication, no Linear network.
- **Eval signal.** Prompt diffs show up as rendered-transcript diffs in the
  eval, so the tuning loop has teeth.
- **Onboarding.** A new contributor can run Symphony end-to-end without any
  credentials.
- **Design forcing function.** Anything that only works in real mode is a
  soft-layered-in dependency — the mock forces the split.

## Consequences

- The test surface is bigger (every feature ships with a scenario). This is
  the intended trade.
- Mock mode has no connection to a real Linear project; issue labels are
  the only variable. This is a feature for determinism; if you need
  richer structure, seed via `--seed <path>`.
- Real-mode-only features (e.g. reacting to a Linear webhook we don't yet
  receive in mock) start as C-grade tech debt until a scenario exists.
