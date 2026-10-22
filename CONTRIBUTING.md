# Contributing

Thanks for helping with the sitemap plugin for Payload. This guide covers the setup, the rules the code follows, and how pull requests get reviewed.

## Before you start

- For a bug, open an issue with steps to reproduce first, unless the fix is small and obvious.
- For a new feature or a change to the public options, open an issue first and describe the use case. It saves you work if the idea doesn't fit the plugin.
- For security problems, don't open an issue. Follow [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 24.22.1+ and pnpm 12.

```bash
pnpm install
pnpm test:unit
```

## Test setup

Tests and the dev app need no accounts and no `.env` file. Tests run on an in-memory SQLite database. To run them on Postgres or MongoDB, set `TEST_DB=postgres` (in-memory PGlite) or `TEST_DB=mongodb` (in-memory MongoDB server). `pnpm dev` starts the dev Payload app from `tests/payload.config.ts` on port 3104 and keeps its data in `tests/payload.db`. Log in with `dev@payloadcms.com` / `test`. `pnpm dev:tanstack` starts the same app on TanStack Start, on the same port and database.

## Commands

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # oxlint
pnpm format         # oxfmt
pnpm test:unit      # tests/unit, no database
pnpm test:int       # tests/integration, in-memory database
pnpm test:stress    # full-size stress run, takes minutes
pnpm build          # tsdown
pnpm dev            # dev Payload app
pnpm dev:tanstack   # same app on TanStack Start
```

Run `pnpm typecheck && pnpm lint && pnpm format && pnpm test:unit && pnpm test:int` before you push.

## Code rules

- **Keep defaults in `resolveOptions`.** Every default lives in `src/server/options/resolveOptions.ts`. The rest of the code takes `ResolvedOptions`, never the raw options.
- **Document every new public option.** Add it to its group type in `src/shared/types/options.ts` (with JSDoc and `@default`), to the key list and defaults in `src/server/options/`, then to `README.md`, and cover it and its validation with a test.
- **Keep the output valid.** Every file must stay within 50,000 URLs and 50 MB, and every value goes through `escapeXML`. Write XML only in `src/server/generate/xml.ts`.
- **A run is all or nothing.** If one source fails, the run fails and the previous files stay. Never write a partial sitemap.
- **Pass `req` in every Local API call the plugin makes**, so transactions behave the same on Payload 3 and 4. Use `overrideAccess: true` for the plugin's own data (files, status, jobs). Documents for the sitemap are read as an anonymous visitor, with `overrideAccess` from `query.overrideAccess`.
- **No comments in code.** Name things so the code explains itself. The only exception is the JSDoc on the public option types in `src/shared/types/`, with `@default` where there is one.
- **Match the surrounding code.** Follow the naming and patterns already used in the file you change. Imports end in `.js`. Import from another folder through `@/` (`@/server/generate/xml.js`), and use `./` only inside the same folder.
- **Ask before adding a runtime dependency.** There are none today, only Payload peers. Say why in the issue or PR.

## Tests

- Add or update tests for every behavior change.
- Unit tests live in `tests/unit/` and need no database. They mirror `src/`, one spec per module: `tests/unit/server/generate/xml.spec.ts` covers `src/server/generate/xml.ts`, `tests/unit/index.spec.ts` covers the plugin wiring. Fixtures shared by several specs live in `tests/helpers/unit/`. `server/telemetry.spec.ts` covers the feature flags and when the report is sent, with the tooling mocked.
- Integration tests live in `tests/integration/`. One file per feature: `generation`, `publish`, `jobs`, `lock`, `endpoints` and `admin` boot Payload with the plugin through the shared helpers in `tests/helpers/int/`; `retry`, `s3` and `tenants` cover job retries, S3 storage and multi-tenant sites. `stress.int.spec.ts` seeds 20,000 documents on SQLite and checks the limits, the index, query batching and debouncing. `pnpm test:stress` runs it at full size. The seed creates the `_parent_id` index on the locales tables, as the README advises for large sites.
- Tests import the source through `@/`.
- Get the database from `testDatabase()` in `@seshuk/payload-plugin-tooling/test-database`, not from a hard-coded adapter.
- Name a `describe` after the function or feature under test. Start an `it` name with a present-tense verb and write it in plain English: `splits files at maxUrlsPerFile`, not `should split…`.
- A bug fix should come with a test that fails without the fix.
- Don't commit `.only`, `.skip` or placeholder tests.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a short, one-line subject, for example `fix: keep x-default when a locale has no URL` or `feat: add images option`. The release changelog is built from these.
- Keep each PR focused on one change. Open it against `main`, which holds 1.x for Payload 4. The `0.x` branch (Payload 3) only takes critical and high-severity security fixes, which are cherry-picked from `main` where possible.
- Fill in the PR template: what changed, why, and how you tested it. Link the issue (`Closes #123`).
- CI must pass. It runs lint, format check, typecheck, unit and integration tests and the build on Node 24 (`0.x`: Node 22 and 24).
- All review threads need to be resolved before merge.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
