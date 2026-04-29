#### Context

<!-- Why is this change needed? Length <= 240 chars -->

#### TL;DR

_<!-- A short description of what we are changing. Use simple language. Assume the reader is not familiar with this code. Length <= 120 chars -->_

#### Summary

- <!-- Details of the changes in bullet points -->
- <!-- Keep them high level -->
- <!-- Each item <= 120 chars -->

#### Demo

<!--
For UI / user-visible changes: include a screencast (mp4/gif/webm under
`.github/media/`, referenced as `![demo](.github/media/<file>)`) or a
screenshot showing the change in the running app.
For backend / docs / infra / tooling changes with no user-visible surface:
write `n/a — <one-line reason>` (e.g. `n/a — internal refactor, no UI`).
This heading is required by `.github/workflows/pr-description-lint.yml`.
-->

#### Alternatives

- <!-- What alternatives have been considered? Why not? -->

#### Test Plan

- [ ] `pnpm all` — typecheck + fmt:check + lint + test + eval
- [ ] `pnpm build:web` — web bundle builds
- [ ] <!-- Additional targeted checks (list below) -->
