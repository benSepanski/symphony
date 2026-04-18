# layered-domain-architecture

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

A repo that any agent can extend drifts almost immediately if there is no
structural invariant. Agents pattern-match locally; whatever shape they
encounter first is what they replicate. Without a spine, the 10th module
looks like nothing the first nine do.

## Decision

We apply a six-layer dependency rule inspired by OpenAI's harness engineering
post. Within Symphony, a module may only depend "forward" through:

```
Types → Config → Persistence → Service → Runtime → API/Web
```

Plus two sideways concerns:

- **Utils** — pure, stateless helpers imported from anywhere.
- **Providers** — cross-cutting inputs (spawn, fetch, Database, clock, id)
  injected through constructors. Never imported ad hoc from inner layers.

## Rationale

- **Agent legibility.** An agent reading `src/orchestrator.ts` should be able
  to predict which files it can import before opening them. A layered rule
  gives us that prediction with zero context cost.
- **Testability.** Service-layer modules are pure given their providers,
  which is exactly the shape Vitest likes.
- **Separability.** Mock mode and real mode share every layer except
  Provider wiring. Two trackers; two agents; same orchestrator.
- **Guard against "helpful" refactors.** Agents love to hoist. A layer rule
  prevents someone from "accidentally" pulling a React component into
  `src/orchestrator.ts` during a rename.

## Concrete mapping

| Layer       | Allowed imports                                 | Example files                                                                    |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Types       | Only `zod` or plain interfaces.                 | `src/agent/types.ts`, `src/tracker/types.ts`.                                    |
| Config      | Types + `yaml` + `zod`.                         | `src/config/workflow.ts`.                                                        |
| Persistence | Types + `better-sqlite3` + `drizzle-orm`.       | `src/persistence/schema.ts`, `src/persistence/logger.ts`.                        |
| Service     | Types + `node:*` via providers + Config shapes. | `src/tracker/linear.ts`, `src/agent/claude-code.ts`, `src/workspace/manager.ts`. |
| Runtime     | All of the above.                               | `src/orchestrator.ts`, `src/replay.ts`, `src/cli.ts`.                            |
| API / Web   | Runtime + Hono / React.                         | `src/api/*`, `src/web/*`.                                                        |

## Providers, explicit

```
Provider    Type signature                    Injected at
--------    --------------                    -----------
spawn       (cmd, args, opts) => ChildProcess  ClaudeCodeAgent
fetch       RequestInfo => Response            LinearTracker
Database    better-sqlite3.Database            SymphonyLogger
now         () => Date                         SymphonyLogger
id          () => string                       SymphonyLogger
sleep       (ms) => Promise<void>              MockAgent
```

Adding a provider = add the signature above, put it in
[`ARCHITECTURE.md`](../../ARCHITECTURE.md), inject through the constructor.

## Consequences

- Creates a natural location for every new capability.
- Forces a small number of "seams" that mock mode and tests both rely on.
- Adds a minor boilerplate cost on the real/mock wiring in `cli.ts`. This is
  worth it.

## Alternatives considered

- **Onion / hexagonal.** Similar rules, but heavier vocabulary than the
  benefits warrant for a ~5 KLOC codebase.
- **Flat "just don't import the wrong thing".** Fails within one quarter of
  agent churn. We have evidence from the Elixir implementation (now deleted).
- **Runtime dependency check (NestJS-style module system).** Adds complexity
  without buying more static guarantees than `tsc` + lint can.

## Enforcement

1. `tsc --noEmit` catches most illegal imports because the Types layer is
   zero-runtime. A Service module that tried to import the orchestrator
   would circular-import.
2. A future `tests/arch.test.ts` will walk the import graph and assert the
   rule; filed in [`../exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md).
3. Reviewer checklist on every PR: "any new import crosses a layer?".
