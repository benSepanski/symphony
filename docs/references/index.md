# docs/references/

Reference sheets for every stack dependency Symphony ships with. Each file is
an `llms.txt`-style dense summary — just enough that an agent can act without
leaving the repo to read upstream docs.

These files are **not** upstream documentation. They're written with the
specific shape of our usage in mind. When we stop using a feature, we drop
its entry.

---

| File                                                   | Covers                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| [`stack-llms.txt`](stack-llms.txt)                     | One-page index of every pinned version in `package.json`.  |
| [`hono-llms.txt`](hono-llms.txt)                       | Hono request/response, SSE streaming, static serving.      |
| [`drizzle-llms.txt`](drizzle-llms.txt)                 | Drizzle ORM + better-sqlite3 in Symphony.                  |
| [`better-sqlite3-llms.txt`](better-sqlite3-llms.txt)   | The direct API we use (`prepare`, `pragma`, transactions). |
| [`vitest-llms.txt`](vitest-llms.txt)                   | Vitest runner + fast-check + deterministic time.           |
| [`liquidjs-llms.txt`](liquidjs-llms.txt)               | liquid template rendering in Symphony.                     |
| [`zod-llms.txt`](zod-llms.txt)                         | Zod schemas at our boundaries.                             |
| [`commander-llms.txt`](commander-llms.txt)             | `commander` CLI wiring.                                    |
| [`linear-graphql-llms.txt`](linear-graphql-llms.txt)   | Linear's GraphQL API, the slice we use.                    |
| [`claude-code-cli-llms.txt`](claude-code-cli-llms.txt) | The `claude` CLI + stream-json output shape.               |
| [`react-llms.txt`](react-llms.txt)                     | React 19 conventions in our dashboard.                     |
| [`tailwind-llms.txt`](tailwind-llms.txt)               | Tailwind v4 via `@tailwindcss/vite`.                       |
| [`vite-llms.txt`](vite-llms.txt)                       | Vite 8 + our custom config.                                |

## Style

- Dense. Terse. Reference, not tutorial.
- Show the exact shape we use. If a library has 20 features and we use 3,
  document those 3.
- Each file ends with a "gotchas" section listing real issues we hit.

## Status

These are _snapshots_. They do not auto-update. The doc-gardening eval
(proposed) will flag a reference that references a removed API or a pinned
version that no longer matches `package.json`.
