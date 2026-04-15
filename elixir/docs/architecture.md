# Architecture

Symphony is an orchestrator that polls a Linear project for actionable issues, creates
isolated per-issue workspaces, and dispatches coding agents (Codex or Claude Code) to
work on each issue autonomously.

## Supervision Tree

```
Application
├── Phoenix.PubSub          (broadcast bus for live dashboard)
├── Task.Supervisor          (async work pool)
├── WorkflowStore            (caches parsed WORKFLOW.md)
├── Orchestrator             (poll loop + dispatch)
├── HttpServer               (Phoenix/Bandit endpoint)
└── StatusDashboard          (terminal status renderer)
```

## Module Layers

Modules are organized into layers. Dependencies flow downward only.

```
CLI / HTTP / LiveView          ← entry points
         │
    Orchestrator               ← poll loop, dispatch, retry, reconciliation
         │
    AgentRunner                ← single-issue execution lifecycle
         │
  ┌──────┼──────┐
Agent  Workspace  Tracker      ← adapter boundaries (pluggable backends)
  │       │          │
Codex/   PathSafety  Linear/   ← concrete implementations
ClaudeCode  SSH
```

### Adapter Boundaries

Three behaviours define the pluggable edges of the system:

| Behaviour | Purpose | Implementations |
|-----------|---------|-----------------|
| `Agent`   | Start session, run turns, stop session | `Codex.AppServer`, `ClaudeCode.StreamClient` |
| `Tracker` | Fetch issues, update state, post comments | `Linear.Adapter`, `Tracker.Memory` (test) |
| `Workspace` | Create isolated dirs, run hooks | local filesystem, SSH remote |

### Configuration Flow

```
WORKFLOW.md (front matter)
    → Workflow.parse/1
    → Config.Schema.parse/1
    → Config.settings!/0  (used everywhere at runtime)
```

`WORKFLOW.md` is the single source of runtime configuration. The `WorkflowStore`
GenServer caches the parsed result and watches for changes.

### Data Flow (one poll cycle)

1. `Orchestrator` calls `Tracker.fetch_candidate_issues/0` via Linear GraphQL.
2. For each claimable issue, `Orchestrator` spawns a `Task` under `TaskSupervisor`.
3. The task calls `AgentRunner.run/3`, which:
   a. Creates an isolated workspace via `Workspace.create_for_issue/2`.
   b. Starts an agent session via `Agent.start_session/2`.
   c. Builds a prompt via `PromptBuilder.build_prompt/2`.
   d. Runs one or more agent turns via `Agent.run_turn/4`.
   e. Cleans up via `Agent.stop_session/1`.
4. `Orchestrator` receives task exit signals and updates internal state.

### Workspace Isolation

Each issue gets its own directory under the configured workspace root.
Workspaces can be local or on a remote host via SSH. `PathSafety` enforces
that workspace paths never escape the configured root directory.

### Observability

- `StatusDashboard` renders a live terminal view of orchestrator state.
- `DashboardLive` provides a web-based Phoenix LiveView equivalent.
- `ObservabilityPubSub` broadcasts runtime events for both dashboards.
- See `docs/logging.md` for structured logging conventions.
- See `docs/token_accounting.md` for Codex token usage semantics.
