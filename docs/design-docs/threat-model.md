# threat-model

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-05-02

Long-form discussion of what Symphony defends against, what it doesn't, and
why. The short summary lives in [`../SECURITY.md`](../SECURITY.md); read that
first.

## Actors

- **Operator.** Trusted. Runs Symphony on their own machine with access to
  a repo they own and a Linear project they control.
- **Reviewer.** Trusted. Opens PRs Symphony produced, comments on Linear
  threads.
- **Agent.** Partially trusted. Spawns the `claude` CLI, which can execute
  arbitrary code in the workspace. The workspace is isolated; the host is
  not sandboxed.
- **Tracker (Linear).** Semi-trusted. Sends issue content; assume the
  content can be adversarial (prompt-injection).
- **External network.** Untrusted.

## Goals

1. A malicious issue body does not achieve arbitrary code execution outside
   the workspace.
2. A malicious issue identifier cannot traverse out of the workspace root.
3. A misbehaving `claude` child process does not OOM or corrupt the parent.
4. Secrets (`LINEAR_API_KEY`) are never written to the DB, the JSONL logs,
   or the rendered prompt.
5. The dashboard and API are not reachable by third parties — they bind to
   localhost.

## Non-goals

- **Sandboxing the host.** The `claude` CLI can run anything. If the operator
  doesn't trust the agent to run `rm -rf`, they shouldn't run it here.
- **Multi-tenant isolation.** One Symphony instance = one operator.
- **Transport encryption on localhost.** Out of scope.
- **Dashboard auth.** Out of scope until we ship a hosted mode.

## Mitigations

| Goal | Mitigation                                                                                                                                                                                    | Covered by                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | Workspace is a git worktree; `before_remove` hook tears it down.                                                                                                                              | `WorkspaceManager` tests.                      |
| 2    | `assertSafeIdentifier` rejects non-`[A-Za-z0-9_-]` identifiers.                                                                                                                               | `workspace/manager.test.ts`.                   |
| 3    | Claude stdout is line-buffered via `readline`; `toAgentTurn` drops unparseable JSON; stderr is capped at 8 KiB.                                                                               | `src/agent/claude-code.ts`.                    |
| 4    | `LINEAR_API_KEY` is read in `cli.ts`, passed directly to the HTTP header, and never logged. The rendered-prompt path has no access to `process.env`.                                          | review (no test yet — filed in tech-debt).     |
| 5    | `cli.ts` passes `hostname` to `serve({ fetch, port })`, defaulting `--bind` to `127.0.0.1` for both `run` and `replay`; LAN exposure requires the operator to opt in (e.g. `--bind 0.0.0.0`). | `src/cli.ts`; [`SECURITY.md`](../SECURITY.md). |

## Attacker playbook (what we assume they try)

1. **Path traversal via issue identifier.** Mitigated by
   `assertSafeIdentifier`.
2. **Shell injection via issue title.** Hook scripts reference issue data
   only through env vars (`"$ISSUE_IDENTIFIER"`). No string formatting.
3. **Prompt injection via issue description.** Out of scope for this harness
   — the agent is the first layer of defense. We keep the prompt minimal and
   explicit about the completion bar so instruction hijacking has to move
   the run to an unexpected `final_state`, which surfaces in the log.
4. **DOS via long `claude` output.** Capped stderr buffer; the orchestrator
   finalizer always runs.
5. **DOS via stuck hook.** `hookTimeoutMs` cap; a timed-out hook surfaces
   as a `HookError` with `exitCode: null`.
6. **SQL injection via issue content.** `SymphonyLogger` uses parameterized
   prepared statements; nothing reads issue text into SQL text.

## Open gaps

- No eval that confirms `LINEAR_API_KEY` is absent from the DB + JSONL —
  tracked in tech-debt.
- No kill-switch if the agent decides to `git push --force` to an upstream
  branch that isn't the per-run `agent/<slug>` branch. Hooks are the
  enforcement point here.
