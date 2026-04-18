# search: finding prior runs

_Last reviewed:_ 2026-04-18

`/api/search?q=...` + `#/search` let operators find runs by free-text match
against turn content and event payloads. It's the "what was that flake
yesterday?" tool.

## Users

- **Operator** — finds a prior run that matched a keyword.
- **Reviewer** — locates the run that exhibited a regression.

## API

```
GET /api/search?q=<text>&limit=<n>
```

- `q` — required; if empty, returns `{ matches: [] }`.
- `limit` — optional, clamped to `[1, 500]`, default `100`.

Response:

```ts
{
  query: string;
  matches: SearchMatch[];
}

type SearchMatch = {
  runId: string;
  issueIdentifier: string;
  issueTitle: string | null;
  status: string;
  matchKind: "turn" | "event";
  turnNumber: number | null;
  eventType: string | null;
  snippet: string;
}
```

## Invariants

- Results are ordered by `matchedAt DESC` and include matches from both
  turns (on `turns.content`) and events (on `log_events.payload`).
- The query is escaped (`%`, `_`, `\`) before LIKE.
- Empty query returns `[]` — not an error.
- Limit is enforced server-side.

## Implementation

[`SymphonyLogger.search`](../../src/persistence/logger.ts) runs a UNION ALL
against `turns.content` and `log_events.payload` with LIKE. It's the
simplest thing that works; if it stops working at volume, the upgrade path
is SQLite FTS5.

## Failure modes

| Failure                   | Surface        | Recovery                           |
| ------------------------- | -------------- | ---------------------------------- |
| Huge query (> 10 k chars) | Valid but slow | No input sanitization — fair game. |
| LIKE scan > a few ms      | Slow response  | Tracked in `tech-debt-tracker.md`. |

## Non-goals

- Full-text ranking (BM25, TF-IDF).
- Cross-field filters (`status:failed AND q=...`).
- Autocomplete / suggestions.
- Regex queries.

## Changelog

- 2026-04-18 — Introduced alongside Phase 4 UI rigor.
