# replay-as-a-mirror

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Debugging an agent run after the fact is painful when the only view of the
run is "scrollback from the CLI". We want the full fidelity of the live
dashboard — turns, events, transitions — applied to any past run.

## Decision

The HTTP server accepts any `EventEmitter`:

```ts
createServer({ events: EventEmitter, logger, webRoot }): Hono
```

The orchestrator is one such emitter (live runs). `createReplayEmitter` is
the other: it reads a run from SQLite and produces an emitter that streams
past events as if they were happening now.

`symphony replay <runId> --speed 5` wires up the replay emitter + API server
and opens the dashboard at `http://localhost:4000`. Nothing on the web side
knows the difference between live and replayed.

## Invariants

- Replay order is `turn.turn_number ASC` for turns and `log_events.id ASC`
  for events. Original wall-clock order is preserved by the insertion order
  in both tables.
- Delays are scaled by the `speed` factor passed to `createReplayEmitter`.
- The SSE stream emits identical JSON bodies to what the orchestrator would
  have sent live: `runStarted`, `turn`, `runFinished`.

See [`../../src/replay.test.ts`](../../src/replay.test.ts) for the
parity tests.

## Why it works

The dashboard subscribes via Server-Sent Events to `/api/events` and
re-renders. If the server is emitter-agnostic, the UI is too. No conditional
"if replay mode" branches anywhere.

## Consequences

- Any future event type automatically shows up in replay as long as it's
  recorded.
- Features that depend on live-only state (hypothetical: "press this button
  to cancel this run") must degrade gracefully when replayed. Today we have
  none.
- Replay is read-only; it cannot modify the DB. The API's mutation-style
  endpoints (none today) would need to be feature-flagged off for replay.
