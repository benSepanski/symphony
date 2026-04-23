# ARCHITECTURE.md

Top-level map of Symphony's domains and permitted dependencies. This file is
the agent's navigation reference when reasoning about a change — consult it
_before_ introducing a new import or module.

Inspired by [OpenAI's harness engineering post][hep]: we enforce a layered
architecture early so throughput can scale without drift.

[hep]: https://openai.com/index/harness-engineering/

---

## The layers

Symphony code flows through exactly seven layers. Dependencies point
**forward only**. A module in a later layer may import from any earlier
layer; earlier layers **must not** import from later layers. This rule is
enforced automatically by [`src/arch.test.ts`](src/arch.test.ts) — add a
file, move one, or wire a new import and the test will tell you whether
the edge is legal.

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │  Utils (pure helpers — no I/O, no global state)                       │
 └──────────────────────────┬────────────────────────────────────────────┘
                            │
 ┌──────────────────────────┼────────────────────────────────────────────┐
 │  Providers (cross-cutting: spawn, fetch, Database, clock, randomUUID) │
 └──────────────────────────┬────────────────────────────────────────────┘
                            │
   Types ─► Config ─► Persistence ─► Service ─► Runtime ─► API/Web ─► Entry
```

| Layer           | Purpose                                                                                     | Example modules                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Types**       | Plain data shapes + zero-dependency interfaces.                                             | [`src/agent/types.ts`](src/agent/types.ts), [`src/tracker/types.ts`](src/tracker/types.ts)                                                                       |
| **Config**      | Parses declarative input (`WORKFLOW.md`, prompt front matter).                              | [`src/config/workflow.ts`](src/config/workflow.ts)                                                                                                               |
| **Persistence** | Owns the schema + dual-write logger (SQLite + JSONL).                                       | [`src/persistence/schema.ts`](src/persistence/schema.ts), [`src/persistence/logger.ts`](src/persistence/logger.ts)                                               |
| **Service**     | One-per-capability adapters behind the Types interfaces.                                    | [`src/tracker/linear.ts`](src/tracker/linear.ts), [`src/agent/claude-code.ts`](src/agent/claude-code.ts), [`src/workspace/manager.ts`](src/workspace/manager.ts) |
| **Runtime**     | The orchestration kernel: poll loop, retry, cancellation, replay.                           | [`src/orchestrator.ts`](src/orchestrator.ts), [`src/replay.ts`](src/replay.ts), [`src/index.ts`](src/index.ts), [`src/eval/`](src/eval/)                         |
| **API / Web**   | Outside-world surfaces: Hono REST + SSE, React dashboard.                                   | [`src/api/server.ts`](src/api/server.ts), [`src/web/*`](src/web/)                                                                                                |
| **Entry**       | Composition root — wires providers, services, runtime, and the HTTP / UI surfaces together. | [`src/cli.ts`](src/cli.ts)                                                                                                                                       |

### Providers

Cross-cutting concerns enter through a single explicit interface, never
imported ad-hoc by inner layers:

| Provider | Interface / type                      | Injection point                   |
| -------- | ------------------------------------- | --------------------------------- |
| Spawn    | [`SpawnFn`](src/agent/claude-code.ts) | `ClaudeCodeAgent({ spawn })`      |
| Fetch    | [`FetchLike`](src/tracker/linear.ts)  | `LinearTracker({ fetchImpl })`    |
| Clock    | `() => Date`                          | `SymphonyLogger({ now })`         |
| ID       | `() => string`                        | `SymphonyLogger({ idGenerator })` |
| Database | `better-sqlite3`                      | `SymphonyLogger({ dbPath })`      |
| Sleep    | [`Sleeper`](src/agent/mock.ts)        | `MockAgent({ sleep })`            |

Never reach for `process.env`, `globalThis.fetch`, `new Date()`, or
`setTimeout` outside the Runtime layer. Test doubles rely on injection.

### Utils

Pure helpers with no I/O. Today: [`assertSafeIdentifier`](src/workspace/manager.ts)
and [`parseDurationMs`](src/cli.ts). Promote a helper to utils the second time
it's duplicated.

---

## Business domains

Symphony has five long-lived domains. Each is owned by a single directory and
is described in a dedicated product spec under
[`docs/product-specs/`](docs/product-specs/).

| Domain       | Directory                           | Product spec                                                                   | Quality grade                                        |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Tracker      | `src/tracker/`                      | [`docs/product-specs/tracker.md`](docs/product-specs/tracker.md)               | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Agent        | `src/agent/`                        | [`docs/product-specs/agent.md`](docs/product-specs/agent.md)                   | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Workspace    | `src/workspace/`                    | [`docs/product-specs/isolated-runs.md`](docs/product-specs/isolated-runs.md)   | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Orchestrator | `src/orchestrator.ts`, `src/cli.ts` | [`docs/product-specs/orchestrator.md`](docs/product-specs/orchestrator.md)     | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Dashboard    | `src/api/`, `src/web/`              | [`docs/product-specs/live-dashboard.md`](docs/product-specs/live-dashboard.md) | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |
| Usage        | `src/usage/`                        | [`docs/product-specs/usage.md`](docs/product-specs/usage.md)                   | see [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) |

---

## The execution model

```
   Tracker.fetchCandidateIssues()
             │
             ▼
   Orchestrator.tick()          ← max_concurrent_agents, claim set
             │
             ▼
   WorkspaceManager.create(issue)  ← hooks: after_create (git worktree)
             │
             ▼
   Agent.startSession({ workdir, prompt })  ← liquid-rendered per-attempt
             │
             ▼
   session.runTurn()  →  Logger.recordTurn()  ──► SQLite row + JSONL line
             │                                         │
             │                                         └─► SSE event → dashboard
             ▼
   Tracker.updateIssueState(…)   ← terminal or max_turns_state
             │
             ▼
   WorkspaceManager.destroy(issue)  ← hooks: before_remove
```

See [`docs/design-docs/execution-model.md`](docs/design-docs/execution-model.md)
for the blow-by-blow including cancellation, error handling, and retry.

---

## What is explicitly disallowed

- **No global singletons.** Pass providers through constructors. The orchestrator
  accepts `{ tracker, agent, workspace, logger }` so both real + mock wiring
  reuse the same code path.
- **No catching `unknown` to swallow.** Either rethrow after logging an event
  with `eventType: "*_error"`, or handle a specific subtype.
- **No shell from agent code.** `WorkspaceManager` runs hooks via
  `execFile("bash", ["-eu", "-c", script])` with an allowlist of env vars.
  Everywhere else: `node:child_process.spawn` with an array of args.
- **No raw SQL outside `src/persistence/`.** Everywhere else goes through
  `SymphonyLogger`'s typed methods.
- **No `require` / `import` cycles across layers.** The layer rule above makes
  these impossible when followed. If you feel the urge, re-read
  [`docs/DESIGN.md`](docs/DESIGN.md) on inversion.

---

## Changing the architecture

When you need a new layer, provider, or cross-cutting concern:

1. Write a short design note under
   [`docs/design-docs/`](docs/design-docs/) and index it in
   [`docs/design-docs/index.md`](docs/design-docs/index.md).
2. Update this file (the map stays true).
3. Open the PR. Leave `docs/QUALITY_SCORE.md` unchanged for now — the
   doc-gardening agent regrades on cadence.

_Do not introduce the new shape without the design note. Undocumented structural
changes are the #1 cause of drift in agent-generated code._
