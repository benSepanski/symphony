# agent-legibility

_Status:_ active
_Created:_ 2026-04-18
_Last reviewed:_ 2026-04-18

## Problem

From a coding agent's point of view, anything it can't pull into context at
task time effectively does not exist. A decision made in Slack, a design
discussion on a Google Doc, an oral history of why we picked Drizzle over
Prisma — none of it is accessible to Codex or Claude Code unless someone
encodes it into the repository. If we treat these off-repo surfaces as
"documentation", the system slowly loses the ability to reason about itself.

## Decision

Repository content is the only durable agent-visible substrate. We actively
push off-repo knowledge on-repo as it accrues.

Concretely:

- Every architectural decision lives under
  [`docs/design-docs/`](.).
- Every reliability invariant lives in
  [`../RELIABILITY.md`](../RELIABILITY.md), backed by a test.
- Every security boundary lives in [`../SECURITY.md`](../SECURITY.md).
- Every product spec lives under [`../product-specs/`](../product-specs/).
- Every stack dependency has an `llms.txt`-style reference sheet under
  [`../references/`](../references/) so agents never have to guess a shape.
- Every tool/dependency's version pinning and upgrade notes live in-repo.

If the information is not in one of these places, it is fair for an agent to
act as if it doesn't exist.

## Rationale

- Agents make better decisions with fewer bad incentives when their view of
  the world is the same as the repo's view.
- A "new engineer joining in three months" and "a fresh Codex run" are
  topologically equivalent — both benefit from encoded knowledge.
- Encoded knowledge is mechanically verifiable. A stale entry in
  [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md) fails the doc-gardening eval;
  stale Slack can't.

## Consequences

- **Slight friction** on small decisions. The answer is usually to promote
  an ephemeral plan into a design note rather than to delete the design
  note.
- **Comment discipline.** We deliberately don't use code comments to explain
  _what_ code does — that drifts. We use them only for _why_, and only when
  the reason isn't obvious. Standing rules go in
  [`golden-principles.md`](golden-principles.md), not in comments.
- **Docs are part of the product.** When `docs/` is stale, the system is
  stale. The doc-gardening eval
  ([`doc-gardening.md`](doc-gardening.md)) catches this.

## Practices

- **Never answer the same question twice without encoding the answer.** If a
  reviewer or user asks "why do we do X?" for the second time, the answer
  becomes a PR to a design note.
- **Promote lore to code or doc.** An `"this is fine"` comment with context
  becomes either a test asserting the invariant, a design note explaining
  the tradeoff, or both.
- **Link, don't copy.** A doc should link to the canonical answer, not paste
  its contents. Duplication leads to divergence.
- **Prefer repo search over tribal knowledge.** When asked "where is X
  specified?", the correct answer is always a path in this repo.

## Anti-patterns

- Putting design decisions in PR descriptions and trusting them to persist —
  PRs get squashed, descriptions get edited, search is flaky.
- "I'll remember to mention it in standup." Write it down now.
- A code comment reading `// remember to revert after the Linear upgrade`.
  Promote to `TODO(<slug>)` with a tracker row.

## Alternatives considered

- **Wiki / Notion.** Moves the knowledge off-repo and re-introduces the very
  problem this doc is fighting.
- **Code comments as the primary surface.** Too local; no index; fights with
  our "no comments for _what_" policy.
