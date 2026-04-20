# docs/product-specs/index.md

Per-domain product specs. A product spec says what a domain is for, who its
users are, and what "shipped" means. When you extend a domain, update its spec
in the same PR.

Domain boundaries are enumerated in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md#business-domains).

---

## Active specs

| Spec                                     | Domain                                                     | Quality                                          |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| [`tracker.md`](tracker.md)               | `src/tracker/`                                             | See [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) |
| [`agent.md`](agent.md)                   | `src/agent/`                                               | See [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) |
| [`isolated-runs.md`](isolated-runs.md)   | `src/workspace/`                                           | See [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) |
| [`orchestrator.md`](orchestrator.md)     | `src/orchestrator.ts` + `src/cli.ts`                       | See [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) |
| [`live-dashboard.md`](live-dashboard.md) | `src/api/` + `src/web/`                                    | See [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) |
| [`replay.md`](replay.md)                 | `src/replay.ts`                                            | —                                                |
| [`search.md`](search.md)                 | `src/persistence/logger.ts::search` + `src/web/Search.tsx` | —                                                |
| [`usage.md`](usage.md)                   | `src/usage/`                                               | —                                                |
| [`mock-mode.md`](mock-mode.md)           | `src/agent/mock.ts` + `src/tracker/memory.ts`              | —                                                |

## Template

```markdown
# <domain>: <one-sentence role in Symphony>

_Last reviewed:_ YYYY-MM-DD

## Users

- <role>: <what they do>

## Inputs / outputs

| Kind | Shape | Contract |
| ---- | ----- | -------- |
| In   | ...   | ...      |
| Out  | ...   | ...      |

## Invariants

- <bullet>

## Failure modes

| Failure | Surface | Recovery |
| ------- | ------- | -------- |
| ...     | ...     | ...      |

## Non-goals

- <bullet>

## Changelog

- YYYY-MM-DD — shipped X.
```
