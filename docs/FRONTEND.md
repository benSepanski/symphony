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

| Hash         | Component                               | Purpose                                        |
| ------------ | --------------------------------------- | ---------------------------------------------- |
| `#/`         | [`Dashboard`](../src/web/Dashboard.tsx) | Live run list + status breakdown.              |
| `#/run/<id>` | [`RunDetail`](../src/web/RunDetail.tsx) | Per-turn transcript, rendered prompt, events.  |
| `#/search`   | [`Search`](../src/web/Search.tsx)       | Full-text search across turn content + events. |

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

- Status colors are sourced once from `Dashboard.tsx` and reused; don't duplicate
  the mapping. A new run status (e.g. `cancelled`) requires updating the map
  and its unit coverage.
- Timestamps render as ISO-trimmed text. Agents reading the DOM care about
  exact strings; don't localize them in-component.

## Building

- `pnpm build:web` → `dist/web/` → served by Hono at `/`.
- Dev mode hot-reloads via `pnpm dev:web` against the Hono API on 4000.
- Check in `dist/web/` **is not required**; CI rebuilds on demand.

## Testing

The web UI currently has no component-test suite — it's asserted via the API
layer + manual QA in mock mode. This is tracked as tech debt in
[`docs/exec-plans/tech-debt-tracker.md`](exec-plans/tech-debt-tracker.md). If
you add UI that drifts from the API behavior, add a test then.

## Visual inventory

Before changing a route's layout:

1. Run `pnpm build:web && pnpm dev WORKFLOW.md --mock` and walk the four
   canonical journeys: empty state, live run, failed run, past run.
2. If the change crosses routes, capture screenshots into `.github/media/`.

The canonical demo video (`.github/media/symphony-demo.mp4`) is what linkable
viewers see from the README — keep the UI consistent with that recording or
update both together.
