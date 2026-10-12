# payload-plugin-sitemap

**@seshuk/payload-plugin-sitemap**: Payload plugin. Build sitemap index, child sitemaps from listed
collections, static pages, custom sources. Store in own upload collection (any storage adapter) or own `upload`
function. Serve at stable API URLs. Regenerate through Payload jobs queue. Admin page, nav link and dashboard
widget. `CLAUDE.md` symlink here.

## Environment

- pnpm. Node 24.15+. Payload 4 (`main`); `0.x` Payload 3.83+, Node 22+.
- No secrets, no `.env`. Tests run on in-memory DBs.
- Shared config from `@seshuk/payload-plugin-tooling` (oxlint, oxfmt, tsconfig, tsdown `pluginBuild()`,
  `vitestBase`, `testDatabase()`, `insertField`/`findFieldPaths` from `./fields` (bundled into `dist/_tooling`), CI and
  release workflows), same as `0.x`. CI runs Node 24.

## Commands

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # oxlint
pnpm format        # oxfmt; format:check verify
pnpm build         # tsdown -> dist/
pnpm test:unit     # tests/unit, no DB
pnpm test:int      # tests/integration on SQLite; TEST_DB=postgres|mongodb
pnpm test:stress   # full-size stress run, manual, minutes
pnpm dev           # dev app tests/, port 3104, dev@payloadcms.com / test
pnpm dev:tanstack  # same app on TanStack Start (tests/tanstack/), port 3104
```

Gate: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit && pnpm test:int && pnpm build && npm pack --dry-run`.

## Structure

`client/` never import `server/`. `shared/` import nothing from `server/` or `client/`. Import across folders
through `@/` (`@/server/...`); `./x` only inside same folder. No `../`.

```text
src/
├── index.ts        # sitemap() through definePlugin, queueSitemap, generateSitemap, public exports
├── fields/         # ./fields export: sitemapFields(), one builder per field
├── client/         # ./client: SitemapPanel (page body + widget summary), SitemapFiles (file list grouped by kind/source)
├── rsc/            # ./rsc: SitemapView, SitemapNavLink, SitemapWidget
├── site/           # ./proxy: sitemapProxy. Never name file proxy.ts (Next 16 middleware)
├── shared/         # constants, filename (name check), types/ (public options JSDoc), translations/ (44 languages)
└── server/
    ├── options/    # resolveOptions, resolveCollection, checkKeys, checkEntry, checkSiteUrl, checkLocales, checkSlugs, checkSort, checkTenants, fail
    ├── fields/     # sitemapFields (placement through tooling insertField), sitemapFieldPaths
    ├── generate/   # generateSitemap, tenants, collectionEntries, sourceEntries, staticEntries, documentTags, documentImages, absoluteURL, fillPath, xml, chunker
    ├── storage/    # sitemap-files collection (registry), storedFiles, storeFile (hash skip), removeFiles, readFile, serveFile, publishFiles
    ├── lock/       # sitemap-locks collection, runLock (acquire, refresh, release)
    ├── status/     # sitemap-status global, statusStore, sitemapStatus, sitemapFiles (paged list)
    ├── jobs/       # sitemapTask, runGeneration, queue (debounce), regenerateHooks
    ├── endpoints/  # fileEndpoints (public), adminEndpoints (status, files, generate), param, openapi (custom.openapi per route)
    ├── telemetry.ts # buildFeatures, reportSitemapTelemetry
    └── admin/      # adminConfig (view, nav link, widget)
tests/
├── unit/           # mirror src/, one spec per module (index.spec.ts = plugin wiring)
├── integration/    # *.int.spec.ts per feature
├── helpers/        # int/ (boot, files, fakeS3, sitemap: shared int fixtures), unit/ (shared unit fixtures)
├── vitest.config.ts
├── tanstack/       # same dev app on TanStack Start (vite.config.ts, router.tsx, app/)
└── payload.config.ts, collections.ts, seed.ts, app/   # dev app
```

## Architecture

`options -> resolveOptions -> config.custom[PLUGIN_NAME] -> job or endpoint -> lock -> generateSitemap -> storeFile ->
registry -> status.run -> publish -> endpoints`

- **All or nothing.** Any source throw: run throw, status get `error`/`errorAt`, old files stay. Old files
  deleted only after every file stored and `status.run` switched (`runGeneration`). Leftovers of crashed or
  failed run (not live: `run > status.previousRun`, `run != status.run`) ignored by endpoints, deleted by next run before
  its switch; that delete fail, run fail (next `previousRun` would make them live). Duplicate names deleted after switch.
- **Spec limits hard.** 50,000 URLs, 50 MB per file (`MAX_URLS`, `MAX_BYTES`), `chunker` roll over before either.
  Max 50,000 files per index, else throw. Max 1000 images per URL.
- **XML only in `xml.ts`.** Every value through `escapeXML`, every URL through `normalizeURL` (absolute http(s)
  or skipped with warning). Output deterministic: `query.sort` then `id`, files in `sources` order.
- **Cursor paging.** `collectionEntries` read 250 docs, `pagination: false`, stop when fewer than 250. Never
  `page` + `pagination: false`: MongoDB ignore `page` then. Sort `id`/`-id`: cursor on `id`. Other sort: phase 1
  docs with value, `sort: [field, 'id']`, cursor `field > v or (field = v and id > last)` (`<` descending); phase 2
  null or missing (`exists: false` or `equals: null`), cursor on `id`. Sort field checked in `onInit` (`checkSort`):
  top-level, not localized, one scalar value.
- **Drafts.** Page query has no `_status` filter: localized `_status` (Payload 4 default) is a join, and SQL adapters
  then run DISTINCT + sort over all remaining rows per page. Per page one `id in` read, `select: { _status: true }`,
  `locale: 'all'`, `overrideAccess: true` (ids already passed access; access Where under `locale: 'all'` match
  nothing on MongoDB). Keep docs whose own-locale status is `published` (string or per-locale object; missing locale:
  not published), no fallback. Same map filter hreflang docs. Cursor and stop on raw page. User `where` on `_status`
  still applied.
- **Public only.** Collection reads use fresh anonymous req (`createPayloadRequest` without user) and
  `overrideAccess: false`. Collection `read` access decide what public. `query.overrideAccess: true` opt-out.
- **siteUrl once per run.** `siteUrl` fn (`{ locale, req, tenant }`, may be async) resolved per tenant and locale
  at run start (`generateSitemap`), then sync `site(locale)` passed down.
- **Sources.** One `sources` array, `type: 'collection' | 'custom' | 'static'`. Names unique (default slug or
  `static`). Same collection may repeat; only one source per collection set `fields`. Hooks, slug checks, tenant
  checks and fields work per deduplicated slug.
- **File names.** `output.filename({ kind, locale, part, source, tenant })`, default `sitemap[-<tenant>][-<locale>].xml`
  and `[<tenant>-][<locale>-]<source>-<part>.xml`. `/` folders allowed, segments `[\w.-]`, ends `.xml`
  (`shared/filename.ts`). File in folder of its index or below. Collisions checked before any store (index + part 1
  per source) and for every stored name. Registry `kind` (`index` | `file`, indexed) and `source`.
- **Tenants.** `tenants` on: read tenants collection (`overrideAccess: true`), one index per tenant, default names
  prefixed with tenant id. Collections with tenant field filtered by it (relationship to tenants collection), others
  listed per tenant. `where` filter tenants; drafts: `_status: published` in where (one query). Endpoint
  `?tenant=`. Tenants collection watched for regenerate.
- **Hash skip.** sha256 per file. Stored name `<name>.<hash 12>.xml`, `/` replaced by `_` in upload collection
  (custom `upload` keep `/`), never overwritten. Same hash as live doc: no upload, doc kept.
- **Debounce through jobs.** Hook find pending `sitemap-generate` job not running: found, nothing; else queue with
  `waitUntil = now + delay`. Manual trigger pull job to now. Hook catch every error: save never fail. Never-published
  draft: no run. Task `concurrency` exclusive, `retries: { attempts: 5, backoff: exponential 30 s }` (6 attempts, about
  15 min), so busy job wait for lock.
- **`jobs: false`.** No task, hooks, schedule (no `payload-jobs` unless user has tasks). `POST /sitemap/generate` run
  in request: 200 `{ files, urls }`, 409 lock busy, 500 `{ message }`. `queueSitemap` throw. Status state from lock.
- **Lock.** Every run (job, endpoint, direct `generateSitemap`) take `sitemap-locks` doc `key: 'run'` (unique), random
  `owner`, `expiresAt` now + 5 min. Own lock matched by `id` and `owner` (ids may be reused). Live lock: throw
  `a sitemap run is already in progress`. Expired lock removed. After insert, any other live lock: delete own, throw busy
  (both may back off, never both win; correct without the unique index, e.g. MongoDB before its index build); own lock
  deleted on every throw after insert. Unique clash on insert: busy. Timer refresh every 60 s (unref, cleared in
  `finally`); refresh finds no own lock: flag set, next store throw. Before switch, each publish `put` and the publish
  `delete` phase, refresh in DB (update own lock): no doc, throw `the run lock expired and another run took it over`.
  Lock calls use own req without caller transaction and `disableTransaction: true`.
- **Registry is truth.** Files collection: one doc per file (`name`, `kind`, `source`, `tenant`, `locale`, `run`,
  `hash`, `published`, ...; `filename`/`url` with custom `upload`). `sitemap-status` hold `run`, `previousRun` and counts.
  Live: `run == status.run` or `run <= status.previousRun`, newest per name. Run number is the largest of status run plus one,
  max doc run plus one, and a time-based number. Re-read `status.run` before deleting leftovers and again before switch:
  changed, run dropped (throw, no status error, own docs deleted). Deletes match `id` and `run`. Switch by
  one `writeStatus({ previousRun: old run, run })`. After switch, if status still this run: publish, then delete replaced and
  stale docs (docs first, then `storage.delete`; errors logged, never thrown). Failed run delete docs it created. Page
  pages through `GET /sitemap/files` (100 per page).
- **Publish.** Optional `publish.put`/`delete`, needs `output.fileUrl`. Child URL same origin and folder as index URL
  (checked per run). After switch: `put` live `file` docs with `published != hash`, then `index` docs, set
  `published: hash`; then `delete` names published before and no longer live (errors logged). `put` error: status
  error, throw, switch stays, old docs kept, next run put again.
- **Endpoints.** Find by indexed `name` (`/sitemaps/:filename+`), index by `kind`, never load all files. Send file
  themselves (`readFile`: upload `handlers` with full doc, redirect followed; `staticDir` on disk; or `fetch` custom
  `upload` URL, relative only with `serverURL`; no self-fetch). Fetch 30 s timeout to headers; storage throw or
  non-200: log, 502.
  `ETag` = hash, `Cache-Control: public, max-age=300`, `If-None-Match` match: 304.
- **Defaults in `resolveOptions`.** Every key checked at start; unknown key, wrong type, bad value throw naming
  option. Rest of code take `ResolvedOptions`.
- **Fields.** Plugin always read fields marked `custom: { sitemap: 'exclude' | 'priority' | 'changefreq' }`,
  anywhere (`sitemapFieldPaths`). `fields` option only add them, placed by `insertField` at `position`. Stored
  names top-level `sitemapExclude|Priority|Changefreq`.
- **Names.** `url`: site or absolute URL (pattern, function, entry). `path`: route mounted on Payload. `enabled`,
  never `disabled`. Field placement: `position` (`InsertPosition`). `Url` casing (`siteUrl`, `fileUrl`,
  `maxUrlsPerFile`, proxy `serverUrl`); Payload's own `serverURL` keep its spelling. No aliases: one name per option.
- **Option shapes.** One key per idea, value or function. Arrays merge (`images: Array<path | fn>`).
  `sources`: typed array, order = index order. `storage.collection`: `CollectionOverride` (`fields({ defaultFields })`),
  with custom `upload` only `collection.upload` rejected.
- **`enabled: false`.** Schema stay (files and locks collections, status global, fields, task when jobs on). Task
  handler no-op, no schedule. No hooks, no endpoints, no view, no widget, no telemetry.
- **Admin.** `admin.view`: page `/admin/sitemap` (`admin.components.views.sitemap`) and `afterNavLinks` link. Custom
  view gets no template and no admin access check from Payload: view render `DefaultTemplate` (`@payloadcms/ui/rsc`)
  itself and check `admin.access`, else not found. Nav link check access server side. Widget: status summary, link to
  page when view on, no file list.
- **Telemetry.** Opt-out, `reportTelemetry` from tooling `./telemetry` (bundled into `dist/_tooling`). Sent from
  `onInit` after user `onInit`, never awaited. `features` booleans from options only: never URLs, hosts, slugs,
  names. Off: `enabled: false`, `telemetry: false`, `SITEMAP_TELEMETRY_DISABLED`, `DO_NOT_TRACK`, CI, `NODE_ENV=test`.

## Rules

- No code comments. Only JSDoc on plugin options types (with `@default`).
- No runtime dependency. Only Payload peers. Ask before any new one.
- Every Local API call pass `req`. Plugin data (files, status, jobs) `overrideAccess: true`. Collection reads for
  sitemap: anonymous req, `overrideAccess: collection.query.overrideAccess` (default false).
- Hook error never fail user save.
- Never edit `dist/` or generated import map by hand.
- Match surrounding naming. One responsibility per file.

## Testing

- `tests/unit/` mirror `src/`, one spec per module (`src/server/generate/xml.ts` ->
  `tests/unit/server/generate/xml.spec.ts`, `src/index.ts` -> `tests/unit/index.spec.ts`). No DB. Fixtures shared by
  specs in `tests/helpers/unit/`. `server/telemetry.spec.ts` mocks tooling.
- `tests/integration/<feature>.int.spec.ts`: `generation`, `publish`, `jobs`, `lock`, `endpoints`, `admin`, `retry`,
  `s3`, `tenants`, `stress`. Real Payload on SQLite (default), `TEST_DB=postgres` (PGlite), `TEST_DB=mongodb`
  (memory server). Helpers in `tests/helpers/int/`: `boot`, `files`, `fakeS3`, `sitemap` (shared options, `start`,
  `seed`, request helpers; each file `afterEach(cleanup)`).
- `stress.int.spec.ts` SQLite only, CI size; `pnpm test:stress` (`STRESS=full`) big size.
- Names: `describe` = function or feature; `it` = present-tense plain verb, never `should`.
- Source imported through `@/`.

## Docs

- `README.md` only user doc. User-facing change: update it in same commit.
- `CONTRIBUTING.md`: dev setup, tests, stress numbers.

## Branches

| Branch | Version | Payload | Node   | npm tag                       |
| ------ | ------- | ------- | ------ | ----------------------------- |
| `main` | 1.x     | 4       | 24.15+ | `beta` now, `latest` at 1.0.0 |
| `0.x`  | 0.x     | 3.83+   | 22+    | `latest` now, `latest-0` then |

New work on `main`. `0.x` same features, diff only what Payload 3 need.

## Releases

`.github/releases/<tag>.md` required for `vX.0.0` and `vX.0.0-<id>.1`: notes above changelog. First release: no
upgrade or migration text.

Bump `version`, commit `chore(release): vX.Y.Z`, tag `vX.Y.Z` on right branch. `release.yml` verify, git-cliff
changelog, GitHub release, publish with provenance. Dist-tag: prerelease id (`beta`); older major than `latest`:
`latest-<major>`; else `latest`. Never publish by hand. Never move tags.

## Commits

- One-line Conventional Commit. No trailers.
- Local only. Push only when asked.

## Boundaries

Ask first: public API change, new dependency, history rewrite. Never: secrets in repo, push or tag unasked,
partial sitemap, deleting old files before new stored.

## References

- `README.md`: options, fields, robots.ts example, storage, endpoints.
- `CONTRIBUTING.md`: setup, tests.
- `SECURITY.md`: supported versions.
