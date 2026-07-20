# docs/FRONTEND.md

The dashboard at `src/web/` is a zero-build-runtime Vite + React 19 + Tailwind v4
app. It has one job: surface every past and in-flight run so a human can audit
what the agents are doing.

---

## Stack

- **Vite 8** — dev server + production bundle. Build output at `dist/web/`.
- **React 19** — function components only, Suspense where useful.
- **Tailwind v4** via `@tailwindcss/vite` — utility classes; no custom CSS
  outside `index.css`.
- **Hash-based routing** — `location.hash` drives the route; no React Router.

## Routes

| Hash          | Component                               | Purpose                                        |
| ------------- | --------------------------------------- | ---------------------------------------------- |
| `#/`          | [`Dashboard`](../src/web/Dashboard.tsx) | Live run list + status breakdown.              |
| `#/runs/<id>` | [`RunDetail`](../src/web/RunDetail.tsx) | Per-turn transcript, rendered prompt, events.  |
| `#/search`    | [`Search`](../src/web/Search.tsx)       | Full-text search across turn content + events. |

Add a route by adding a branch in `App.tsx`'s switch and a single component
file. Don't install a router.

## Data sources

- `GET /api/runs` — list of runs.
- `GET /api/runs/:id` — one run with turns + events.
- `GET /api/search?q=...` — `SearchMatch[]`.
- `GET /api/events` — Server-Sent Events stream, consumed via
  [`useEventStream`](../src/web/useEventStream.ts).

All fetches live in [`src/web/api.ts`](../src/web/api.ts). Never call `fetch`
from a component.

### SSE → state updates

The dashboard does **not** refetch `/api/runs` on every `turn` event. The
in-memory runs list is patched from the SSE payload via the pure helpers in
[`dashboardEvents.ts`](../src/web/dashboardEvents.ts):

- `turn` → `applyTurnEvent` increments `turnCount` on the matching row.
- `runFinished` → `applyRunFinishedEvent` stamps `status` + `finishedAt`
  immediately, then a single `GET /api/runs/:id` (`replaceRun`) fills in
  authoritative token totals + cost.
- `runStarted` → falls back to `GET /api/runs` (rare event, payload is
  `Issue`-shaped not `ApiRun`-shaped).
- A `turn` event for an unknown `runId` (stale tab, missed `runStarted`)
  falls back to a full `GET /api/runs`.

This keeps a live run from triggering a full table refetch per turn.

## Conventions

- **Accessibility first.** Every interactive element is a real `<button>` or
  `<a>`. Keyboard navigation works. Color is never the sole signal of status.
- **No ambient state.** Components receive props; top-level state lives in
  `App.tsx` and is passed down.
- **Tailwind utilities inline.** Don't invent class abstractions. If a pattern
  repeats three times, promote to a tiny component.
- **No CSS-in-JS, no styled-components.** Tailwind is enough.
- **Monospace for identifiers.** Issue IDs, run IDs, timestamps use
  `font-mono`.

## Styling conventions

- Status colors are sourced once from the `STATUS_STYLES` map + `StatusBadge`
  component in [`shared.tsx`](../src/web/shared.tsx) and reused across
  Dashboard, RunDetail, MetricsPanel, and Search. Don't duplicate the mapping.
  A new run status (e.g. `cancelled`) requires updating that map.
- Timestamps render through the helpers in
  [`shared.tsx`](../src/web/shared.tsx) — don't call `toLocaleTimeString` or
  reformat dates ad-hoc in components:
  - `formatTs` — time-only, for in-run surfaces (events log, error rows) where
    the date is already fixed by the surrounding run context.
  - `formatRunTimestamp(iso, now)` — time-only for today, `MMM D · HH:MM AM/PM`
    for earlier calendar days, wrapped in `<time dateTime={iso}>` at the
    callsite so the exact ISO stays available on hover / to screen readers.
    Use this on any cross-run surface (RunDetail header, Dashboard runs table)
    so cross-day audits keep the date visible.

## Building

- `pnpm build:web` → `dist/web/` → served by Hono at `/`.
- Dev mode hot-reloads via `pnpm dev:web` against the Hono API on 4000.
- Check in `dist/web/` **is not required**; CI rebuilds on demand.

## Testing

Web logic is extracted into small helper modules (`appRoute.ts`,
`appHeader.ts`, `dashboardEvents.ts`, `dashboardLoadUtils.ts`,
`runDetailUtils.ts`, `errorFeedUtils.ts`, `metricsPanelUtils.ts`,
`runsTable.ts`, `searchUtils.ts`, `settingsPanelUtils.ts`, `shared.tsx`) and
unit-tested in Vitest alongside the API and orchestrator suites. When a
component grows a non-trivial branch — a reducer over SSE events, a route
parser, a label formatter, a threshold decision — extract it to a pure
helper first, then test the helper. This is why `runDetailUtils.ts` and
`dashboardEvents.ts` exist as siblings of their components.

There is still no jsdom + `@testing-library/react` suite, so cross-component
render + interaction behavior relies on the API layer + manual QA in mock
mode. That remaining gap is tracked in
[`docs/exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md).

## Visual inventory

Before changing a route's layout:

1. Run `pnpm build:web && pnpm dev WORKFLOW.md --mock` and walk the four
   canonical journeys: empty state, live run, failed run, past run.
2. If the change crosses routes, capture screenshots into `.github/media/`.

The canonical demo video (`.github/media/symphony-demo.mp4`) is what linkable
viewers see from the README — keep the UI consistent with that recording or
update both together.
