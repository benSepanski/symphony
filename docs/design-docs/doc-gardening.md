# doc-gardening

_Status:_ proposed
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

Documentation rots. The moment we merge a feature and forget to update the
relevant design note, the repo stops being a trustworthy source of truth for
the next agent. The harness-engineering model assumes the repository is the
system of record; a stale repo silently violates that.

## Decision (proposed)

Ship a recurring eval + linter that grades `docs/` for freshness and
structural integrity. The eval runs as part of `pnpm eval` and fails on any
of:

1. **Broken internal links.** Any relative link (e.g.
   `[foo](../exec-plans/foo.md)`) that does not resolve to a file in the
   current tree.
2. **Missing index entries.** A design note exists in `docs/design-docs/` but
   is not referenced from `docs/design-docs/index.md`, or vice versa.
3. **Stale "Last reviewed".** A design note's `Last reviewed:` date is more
   than 90 days old and the module it documents has had non-trivial changes
   since (diff size heuristic).
4. **Undefined liquid vars in prompts.** A prompt file references
   `{{ foo.bar }}` where `foo.bar` is not in the well-known context.
5. **Domains without grade.** An entry appears in `ARCHITECTURE.md`'s
   "Business domains" table but not in `docs/QUALITY_SCORE.md`.
6. **Orphan tech-debt rows.** A row in `tech-debt-tracker.md` points at a
   file that no longer exists.

## Implementation sketch

- New test file: `src/eval/doc_gardening.eval.ts`.
- Reuses `tree-sitter` or a regex to extract links/headings from markdown
  (no new dependency — regex is enough for our shape).
- Emits a structured failure message saying which rule fired, with the
  remediation inline: e.g.
  > `docs/design-docs/foo.md` is not listed in
  > `docs/design-docs/index.md`. Add a row or rename the file.

## Dependencies

- None today. The eval infrastructure already exists (`vitest.eval.config.ts`).
- Filed as a tech-debt row in
  [`../exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md).

## Consequences (once active)

- Agents hitting a doc-gardening failure fix the doc in the same PR as the
  code, by construction. Drift becomes impossible to merge.
- A small, ongoing cost: ~30 s of eval time.
- The rules themselves will evolve. Adding a rule is additive; each rule's
  failure must include its own remediation hint.

## Status

Not yet implemented. Move to `active` when `src/eval/doc_gardening.eval.ts`
exists and is wired into `pnpm eval`.
