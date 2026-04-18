# replay: re-watching a past run

_Last reviewed:_ 2026-04-18

`symphony replay <runId>` replays any recorded run over SSE so it looks like
a live run in the dashboard. This is the operator's primary post-mortem tool.

## Users

- **Reviewer** — replays a suspicious run to trace how it went wrong.
- **Agent loops** (future) — programmatic consumer of `/api/events` against
  a replayed run.

## Command

```bash
pnpm tsx src/cli.ts replay <runId> [--port 4000] [--speed 5]
```

- `--port` — HTTP port for the dashboard.
- `--speed` — playback multiplier (1 = realtime; 5 = five× faster).

## Invariants

- Replay is read-only; it never writes to the DB.
- Ordering matches live: `turn.turn_number ASC` for turns,
  `log_events.id ASC` for events.
- The same `createServer({ events, logger })` runs against the replay
  emitter, so the web bundle doesn't know or care it's not live.
- Delays between original events are preserved (divided by `speed`).

## Implementation

[`src/replay.ts`](../../src/replay.ts) exposes
`createReplayEmitter({ runId, logger, speed })`, which returns:

```ts
{
  events: EventEmitter; // emits runStarted, turn, runFinished
  run: () => Promise<void>; // start replay, resolve on "run complete"
}
```

Usage pattern in `cli.ts`:

```ts
const { events, run } = createReplayEmitter(...);
const app = createServer({ events, logger });
const server = serve({ fetch: app.fetch, port });
await run();
```

## Failure modes

| Failure                           | Surface                              | Recovery                     |
| --------------------------------- | ------------------------------------ | ---------------------------- |
| Unknown `runId`                   | `Error("run not found")` at startup  | Operator uses `--query`.     |
| Corrupt row (missing turn number) | Replay falls back to insertion order | Covered by `replay.test.ts`. |

## Non-goals

- Replaying _multiple_ runs concurrently.
- Replaying _live_ (streaming, join-already-running run) — that's the live
  dashboard's job.
- Modifying a run via replay. Replay is strictly passive.

See [`../design-docs/replay-as-a-mirror.md`](../design-docs/replay-as-a-mirror.md)
for the design rationale.
