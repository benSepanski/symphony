# usage: API rate limit monitoring

_Last reviewed:_ 2026-04-19

Symphony periodically checks the Claude Code API's rate limit before spawning agents. When a window reaches 100% utilization, the orchestrator pauses runs until capacity returns.

## Users

- **Orchestrator** — decides whether to spawn a new agent session.
- **Dashboard** — displays current utilization in the run panel.

## Interface

```ts
interface UsageSnapshot {
  fiveHour: UsageWindow; // Per-hour 5-minute rolling window
  sevenDay: UsageWindow; // Per-day 7-day rolling window
  fetchedAt: string; // ISO-8601 timestamp
}

interface UsageWindow {
  utilization: number; // 0.0 to 1.0 (e.g. 0.95 = 95%)
  resetsAt: string; // ISO-8601 timestamp
}

interface UsageChecker {
  check(): Promise<UsageSnapshot | null>;
}
```

## Implementations

| Implementation                                               | Mode      | Source                                          |
| ------------------------------------------------------------ | --------- | ----------------------------------------------- |
| [`ClaudeOAuthUsageChecker`](../../src/usage/claude-oauth.ts) | real      | Claude Code OAuth endpoint (Anthropic internal) |
| `null` (no-op)                                               | mock/test | Skipped in mock mode; tests disable it          |

## Invariants

- The usage endpoint is **undocumented and unsupported**; Anthropic may change the path, headers, response shape, or auth scheme at any time without notice.
- The OAuth credential is read from the OS (Keychain on macOS, `~/.claude/.credentials.json` on Linux).
- `check()` is called at most every 30 seconds (configurable via `usageMinIntervalMs`).
- When a rate limit is detected, the orchestrator emits `usageUpdated` and pauses before claiming new issues.
- A failed fetch (network, auth, malformed response) returns `null`; the orchestrator does not pause.

## Failure modes

| Failure                                | Surface                                    | Recovery                                    |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Endpoint unreachable                   | `onError` callback called; null returned   | Orchestrator continues normally.            |
| Credential missing or invalid          | `onError` callback called; null returned   | Orchestrator continues normally.            |
| Malformed response JSON                | `onError` callback called; null returned   | Orchestrator continues normally.            |
| Rate limit detected (100% utilization) | `usageUpdated` emitted with limited window | Orchestrator pauses new claims until reset. |
| Endpoint moved / auth scheme changed   | `onError` callback called; null returned   | Operator updates `ANTHROPIC_BETA` header.   |

## Non-goals

- Predictive throttling. We react to 100%, not pre-emptively backoff at 80%.
- Per-model rate limits. We check the account-level aggregates.
- Cost tracking or spend alerts (different problem; not in scope).

## Evolution

To integrate a different rate limit checker (e.g., Anthropic's stable API):

1. Implement `UsageChecker` in `src/usage/<provider>.ts`.
2. Update `src/cli.ts` to construct the right checker based on config.
3. Add a unit test covering the new provider (especially error paths).
4. Update this spec and [`docs/QUALITY_SCORE.md`](../QUALITY_SCORE.md).
