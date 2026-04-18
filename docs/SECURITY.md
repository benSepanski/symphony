# docs/SECURITY.md

The security contract Symphony ships today. Symphony runs a coding agent with
meaningful privilege in a trusted environment — this document is the threat
model it assumes and the boundaries it enforces.

> **Warning.** Symphony is an engineering preview. Do not expose its dashboard
> to untrusted networks.

---

## Threat model

Symphony is assumed to run on a **trusted operator machine** with:

- A private repo clone the operator controls.
- A `LINEAR_API_KEY` scoped to the minimum set of teams + projects.
- The `claude` CLI authenticated to an Anthropic account.
- A `127.0.0.1:4000` dashboard bound to loopback, not exposed publicly.

In this environment the attack surface we care about is:

1. **Malicious issue content.** An issue title/description/label could contain
   shell injections, path traversal, or prompt injections targeting the agent.
2. **Compromised tracker.** A trust-boundary violation in Linear's API could
   make fetched issues malicious.
3. **Stream poisoning.** The `claude` CLI's stream-json output is untyped JSON
   from an external process; a bug in parsing could crash the orchestrator.

Not in scope today:

- Multi-tenant isolation (one operator, one Symphony instance).
- Dashboard authentication (loopback-only).
- Transport encryption for local HTTP (loopback-only).

See [`design-docs/threat-model.md`](design-docs/threat-model.md) for a
longer-form discussion.

---

## Enforced boundaries

### Identifier sanitization

`assertSafeIdentifier(issue.identifier)` in
[`src/workspace/manager.ts`](../src/workspace/manager.ts) enforces
`/^[A-Za-z0-9_-]+$/` on any string that reaches `mkdir`, `execFile`, or
workspace paths. A `UnsafeIdentifierError` surfaces with a human-readable
message rather than letting a traversal through.

Any new filesystem or shell usage keyed on external input **must** call this
helper (or add its own allow-list).

### Hook scripts are parameterized via env vars, not interpolation

`WorkspaceManager.runHook` exports a fixed set of env vars to the hook
process:

```
ISSUE_ID, ISSUE_IDENTIFIER, ISSUE_TITLE, ISSUE_STATE, ISSUE_URL, ISSUE_LABELS
```

Hooks consume them via `"$ISSUE_IDENTIFIER"`, never by string-formatting. This
is the explicit contract [`PROGRESS.md`](../PROGRESS.md) calls out:
"Reject path-traversing issue identifiers; lock the env-var contract."

### GraphQL is typed, not interpolated

`LinearTracker.gql` ships queries as static strings with variables passed
separately. There is no string concatenation into GraphQL, so Linear input
can't break the query.

### Stream parsing is bounded

[`toAgentTurn`](../src/agent/claude-code.ts) accepts `unknown`, discriminates
on `type`, and rejects anything unexpected. Unparseable JSON lines are
dropped, not thrown. The `stderrBuffer` is capped at 8 KiB so a runaway
`claude` child can't OOM the parent.

### No secrets in the transcript

The rendered prompt is stored in `turns.rendered_prompt`. It's derived from
the issue + attempt; it never includes `process.env` or other secrets. Prompt
templates MUST NOT `{% include %}` secret-bearing files. (The `liquidjs`
engine is configured without filesystem access by default.)

### Loopback-only HTTP

[`src/api/server.ts`](../src/api/server.ts) is served on `:4000` with no auth.
Binding to `0.0.0.0` or putting the dashboard behind a proxy is out of scope.
Running this on a shared host without a tunnel is unsupported.

### No network from the orchestrator itself

The orchestrator only talks to:

- Linear via `fetchImpl` (through `LinearTracker`).
- The local `claude` CLI via `spawn`.

It does not make arbitrary HTTP calls. New network capability requires a
design note in [`design-docs/`](design-docs/) and a gate in the layer map.

---

## Secret handling

- **`LINEAR_API_KEY`.** Read from `process.env` in `cli.ts`. Never logged.
  Never written to the DB. Not echoed on startup.
- **`CLAUDE_CLI`.** Optional override for the claude binary path; no secret
  content.
- **Any hook-script secrets.** Hooks inherit the parent `process.env` minus
  explicit overrides. If a hook needs a credential (e.g. `GITHUB_TOKEN`), the
  operator injects it _before_ launching Symphony; the harness does not
  broker or store it.

## Non-reversible operations require explicit confirmation

The CLI's `prune` subcommand deletes runs + JSONL files for runs older than
its argument. The default is 30d and it fails closed on bad duration strings.
Prune is idempotent but destructive; prefer it as a cron job, not an
automation hook.

`git worktree remove --force` in the `before_remove` hook is the other
destructive operation. It is scoped to the worktree the orchestrator just
created and keyed off the safe-identifier check above.

---

## Reporting a vulnerability

See [`../NOTICE`](../NOTICE) for the Apache-2.0 contact paths. Open a Github
issue only for non-sensitive reports; for sensitive disclosures mail the
maintainer directly.
