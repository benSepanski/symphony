# Pull Request Requirements

## PR Body

Every PR must follow the template in `.github/pull_request_template.md`:

| Section      | Purpose                                           | Limit     |
|-------------|---------------------------------------------------|-----------|
| Context     | Why is this change needed?                        | ≤ 240 chars |
| TL;DR       | What changed, in plain language                   | ≤ 120 chars |
| Summary     | High-level bullet points of the changes           | Each ≤ 120 chars |
| Alternatives| What else was considered and why not               | —         |
| Test Plan   | Checklist starting with `make -C elixir all`      | —         |

Validate locally:

```bash
mix pr_body.check --file /path/to/pr_body.md
```

The GitHub Actions workflow `.github/workflows/pr-description-lint.yml`
enforces this on every PR.

## Docs Update Policy

If behavior or config changes, update docs in the same PR:

- `../README.md` — project concept and goals.
- `README.md` — Elixir implementation and run instructions.
- `WORKFLOW.md` — workflow/config contract changes.
- `docs/` — any affected guide in this directory.
