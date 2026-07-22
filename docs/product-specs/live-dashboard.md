# live-dashboard: the operator's view

_Last reviewed:_ 2026-07-22

The dashboard is the only UI Symphony ships. It surfaces every past and
in-flight run so an operator (or reviewer) can audit what the agents did.

Frontend: [`src/web/`](../../src/web/). Backend: [`src/api/server.ts`](../../src/api/server.ts).

## Users

- **Operator** — watches live runs; diagnoses stuck issues.
- **Reviewer** — opens `#/runs/<id>` after a PR lands; reads the transcript
  before approving.
- **Agent loops** (future) — could `curl /api/search` or `/api/runs/:id` to
  reason about prior work.

## Routes

| Hash          | Component                                      | Purpose                                     |
| ------------- | ---------------------------------------------- | ------------------------------------------- |
| `#/`          | [`Dashboard.tsx`](../../src/web/Dashboard.tsx) | List of all runs + live indicator.          |
| `#/runs/<id>` | [`RunDetail.tsx`](../../src/web/RunDetail.tsx) | Turn transcript + events + rendered prompt. |
| `#/search`    | [`Search.tsx`](../../src/web/Search.tsx)       | Text search across turn content + events.   |

## HTTP surface

| Verb / path                   | Purpose                                                                                         | Shape                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GET /api/runs`               | List of runs (for the dashboard).                                                               | `RunLog[]`                                      |
| `GET /api/runs/:id`           | One run with its turns + events.                                                                | `{ run, turns: TurnLog[], events: EventLog[] }` |
| `GET /api/search?q=`          | Text search; returns a ranked-ish match list.                                                   | `{ query, matches: SearchMatch[] }`             |
| `GET /api/events`             | SSE stream of `runStarted`/`turn`/`runFinished`/`usageUpdated`/`tick`/`settingsUpdated`.        | Server-Sent Events                              |
| `GET /api/events/recent`      | Last N events matching `?types=` (default: the error-shaped types feeding the ErrorFeed).       | `{ events: EventLog[] }`                        |
| `GET /api/usage`              | Latest usage snapshot + `rateLimitedWindow` from the Claude OAuth checker.                      | `{ snapshot, rateLimitedWindow }`               |
| `GET /api/health`             | Orchestrator state + latest usage snapshot (drives HealthStrip).                                | `{ orchestrator, usage }`                       |
| `GET /api/settings`           | Live orchestrator settings + the immutable workflow summary (drives SettingsPanel).             | `{ settings, workflow }`                        |
| `PATCH /api/settings`         | Merge a validated partial settings patch (poll interval, concurrency, etc.); returns new state. | `{ settings }`                                  |
| `POST /api/orchestrator/tick` | Ask the orchestrator to run a tick immediately; returns after the tick promise settles.         | `{ ok, state }`                                 |
| `GET /`                       | The web bundle (`dist/web/index.html` if present).                                              | HTML                                            |
| `GET /favicon.ico`            | 204 no-content (avoids browser 404 noise).                                                      | —                                               |

## Invariants

- The API is stateless. Every endpoint operates off `SymphonyLogger` + the
  shared `EventEmitter`.
- The HTTP layer does not mutate anything. All writes come from the
  orchestrator.
- `createServer` accepts any `EventEmitter` — live orchestrator _and_
  replay reuse this surface byte-for-byte.

## Conventions

- Tailwind utilities inline. No CSS-in-JS.
- Real `<button>` / `<a>` for interactions (keyboard nav works).
- Monospace for identifiers + timestamps.
- Status mapping lives in one place (`shared.tsx`) — don't duplicate.
- Hash routing: no React Router, no history API.

## Failure modes

| Failure                    | Surface                                                 | Recovery                  |
| -------------------------- | ------------------------------------------------------- | ------------------------- |
| `dist/web/` missing        | Served a placeholder HTML page with a `/api/runs` link. | Run `pnpm build:web`.     |
| SSE client disconnects     | `stream.onAbort` cleans up listeners.                   | Client reconnects.        |
| API 404 on `/api/runs/:id` | JSON `{ error: "not found" }`.                          | UI shows "run not found". |

## Non-goals

- Authentication. The dashboard is loopback-only; running it exposed to a
  network is out of scope.
- Interactive run control (start/stop). The runtime owns lifecycle.
- Rich filtering (priority, owner, label). We have `/api/search`.

## Changelog

- 2026-07-22 — Fix stale `Dashboard.tsx` reference (status map lives in
  `shared.tsx`); document the health / usage / settings / orchestrator-tick
  endpoints that shipped after the initial spec.
- 2026-04-18 — `/api/search` + `#/search` route with highlighting.
- 2026-04-18 — Live indicators on in-flight runs + `--no-demo`.
- 2026-04-18 — `RunDetail` surfaces error + elapsed time + rendered prompt.
