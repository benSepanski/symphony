# CLAUDE.md

This project uses [`AGENTS.md`](AGENTS.md) as its canonical agent instruction
file — see the [OpenAI harness engineering post][hep] for the rationale.
`AGENTS.md` is a cross-agent convention (Claude Code, Codex, Cursor); keeping
one file means guidance doesn't drift between tools.

**Start at [`AGENTS.md`](AGENTS.md)**, then follow its pointers into `docs/`.

[hep]: https://openai.com/index/harness-engineering/

## Read me first (every context)

1. **[`PROGRESS.md`](PROGRESS.md)** — long-running state file.
2. **[`AGENTS.md`](AGENTS.md)** — table of contents for the repo.
3. **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — layered domain map.
4. **[`docs/design-docs/core-beliefs.md`](docs/design-docs/core-beliefs.md)**
   — non-negotiable operating principles.
5. **[`docs/design-docs/golden-principles.md`](docs/design-docs/golden-principles.md)**
   — the mechanical rules `pnpm all` enforces.

Active plans, completed plan post-mortems, and tech debt live under
[`docs/exec-plans/`](docs/exec-plans/).

## The one-line gate

```bash
pnpm all   # typecheck → fmt:check → lint → test → eval. Green before commit.
```

Everything else — stack, commands, conventions, failure modes — is in the
docs tree linked from [`AGENTS.md`](AGENTS.md).
