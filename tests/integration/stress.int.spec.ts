import { sql } from '@payloadcms/db-sqlite'
import type { Payload, PayloadRequest } from 'payload'
import { createLocalReq } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { SitemapFile, SitemapPluginOptions } from '@/index.js'
import { generateSitemap, TASK_SLUG } from '@/index.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'
import { MAX_BYTES, MAX_URLS, PLUGIN_NAME } from '@/shared/constants.js'

import { boot } from '../helpers/int/boot.js'
import { read } from '../helpers/int/files.js'

const FULL = process.env.STRESS === 'full'
const SIZE = FULL
  ? { entries: 5_000, pages: 120_000, posts: 60_000, saves: 500, source: 30_000 }
  : { entries: 500, pages: 12_000, posts: 8_000, saves: 500, source: 5_000 }
const SITE = 'https://example.com'
const BATCH = 500
const sqlite = !process.env.TEST_DB || process.env.TEST_DB === 'sqlite'

type Drizzle = {
  drizzle: {
    insert: (table: unknown) => { values: (rows: object[]) => Promise<unknown> }
    run: (query: unknown) => Promise<unknown>
  }
  tables: Record<string, unknown>
}

const optionsFor = (maxUrlsPerFile: number, splitLocales: boolean): SitemapPluginOptions => ({
  jobs: { regenerate: { delay: 60_000 } },
  output: { maxUrlsPerFile, splitLocales },
  siteUrl: splitLocales ? ({ locale }) => `https://${locale}.example.com` : SITE,
  sources: [
    { type: 'static', entries: Array.from({ length: SIZE.entries }, (_, index) => ({ url: `/static/${index}` })) },
    {
      type: 'collection',
      collection: 'pages',
      changefreq: 'weekly',
      url: ({ doc, locale }) => `/${locale}/${doc.slug}`,
    },
    {
      type: 'collection',
      collection: 'posts',
      images: ['image'],
      locales: ['en'],
      priority: ({ doc }) => (doc.featured ? 1 : 0.5),
      url: '/blog/:slug',
    },
    {
      type: 'custom',
      entries: async function* ({ locale }) {
        for (let index = 0; index < SIZE.source; index++) yield { url: `/${locale}/filters/${index}` }
      },
      name: 'filters',
    },
  ],
})

const insert = async (payload: Payload, table: string, count: number, row: (id: number) => object[]) => {
  const db = payload.db as unknown as Drizzle
  for (let start = 1; start <= count; start += BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, count - start + 1) }, (_, index) => start + index)
    await db.drizzle.insert(db.tables[table]).values(ids.flatMap(row))
  }
}

const seed = async (payload: Payload) => {
  const now = new Date().toISOString()
  await insert(payload, 'pages', SIZE.pages, (id) => [{ _status: 'published', createdAt: now, id, updatedAt: now }])
  await insert(payload, 'pages_locales', SIZE.pages, (id) =>
    ['en', 'de'].map((locale) => ({
      _locale: locale,
      _parentID: id,
      slug: `${locale}-page-${id}`,
      title: `Page ${id}`,
    })),
  )
  await insert(payload, 'posts', SIZE.posts, (id) => [
    {
      createdAt: now,
      featured: id % 10 === 0,
      id,
      image: id % 2 === 0 ? `${SITE}/img/${id}.jpg` : null,
      slug: `post-${id}`,
      updatedAt: now,
    },
  ])
  await insert(payload, 'posts_locales', SIZE.posts, (id) => [{ _locale: 'en', _parentID: id, title: `Post ${id}` }])
  const { drizzle } = payload.db as unknown as Drizzle
  for (const table of ['pages_locales', 'posts_locales']) {
    await drizzle.run(sql.raw(`CREATE INDEX ${table}_parent_id_idx ON ${table} (_parent_id)`))
  }
}

const measure = async (payload: Payload, options: SitemapPluginOptions) => {
  ;(payload.config.custom as Record<string, unknown>)[PLUGIN_NAME] = resolveOptions(options)
  const find = vi.spyOn(payload.db, 'find')
  const start = process.memoryUsage().rss
  let peak = start
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss)
  }, 10)
  const began = performance.now()
  const files = await generateSitemap((await createLocalReq({}, payload)) as PayloadRequest)
  const ms = Math.round(performance.now() - began)
  clearInterval(timer)
  const queries = find.mock.calls.length
  find.mockRestore()
  return { files, ms, peakMB: Math.round((peak - start) / 1_048_576), queries }
}

const report = (label: string, run: Awaited<ReturnType<typeof measure>>) => {
  const sizes = run.files.map(({ filename, size, urls }) => `${filename} ${urls} urls ${(size / 1024).toFixed(0)} KB`)
  process.stdout.write(
    `\n[stress] ${label}: ${run.files.length} files, ${run.ms} ms, +${run.peakMB} MB peak rss, ${run.queries} db.find\n  ${sizes.join('\n  ')}\n`,
  )
}

const checkFiles = (dir: string, files: SitemapFile[]) => {
  const children = files.filter(({ filename }) => /-\d+\.xml$/.test(filename))
  for (const file of children) {
    expect(file.urls).toBeLessThanOrEqual(MAX_URLS)
    expect(file.size).toBeLessThanOrEqual(MAX_BYTES)
    const xml = read(dir, file.filename)
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      ),
    ).toBe(true)
    expect(xml.endsWith('</urlset>\n')).toBe(true)
    expect(xml.match(/<url>/g)).toHaveLength(file.urls)
    expect(xml.match(/<loc>https?:\/\/[^<]+<\/loc>/g)).toHaveLength(file.urls)
  }
  const indexes = files.filter(({ filename }) => /^sitemap(-[\w-]+)?\.xml$/.test(filename))
  const listed = indexes.flatMap(({ filename }) => {
    const xml = read(dir, filename)
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    return [...xml.matchAll(/<loc>[^<]*\/sitemaps\/([^<]+)<\/loc>/g)].map(([, name]) => name)
  })
  expect(listed.toSorted()).toEqual(children.map(({ filename }) => filename).toSorted())
  return children
}

describe.skipIf(!sqlite)('stress', () => {
  let payload: Payload
  let dir: string
  let teardown: () => Promise<void>

  beforeAll(async () => {
    ;({ dir, payload, teardown } = await boot(optionsFor(MAX_URLS, false)))
    await seed(payload)
  }, 600_000)

  afterAll(async () => {
    await teardown()
  })

  it(
    'splits large collections into files within the limits, with batched queries',
    { timeout: 1_800_000 },
    async () => {
      const perFile = FULL ? MAX_URLS : 5_000
      const run = await measure(payload, optionsFor(perFile, false))
      report(`maxUrlsPerFile ${perFile}, one index`, run)
      const children = checkFiles(dir, run.files)
      const urls = (name: string) =>
        children.filter(({ filename }) => filename.startsWith(`${name}-`)).reduce((sum, file) => sum + file.urls, 0)
      expect(urls('pages')).toBe(SIZE.pages * 2)
      expect(urls('posts')).toBe(SIZE.posts)
      expect(urls('filters')).toBe(SIZE.source * 2)
      expect(urls('static')).toBe(SIZE.entries)
      expect(children.filter(({ filename }) => filename.startsWith('posts-'))).toHaveLength(
        Math.ceil(SIZE.posts / perFile),
      )
      const pages = Math.ceil(SIZE.pages / 250)
      const posts = Math.ceil(SIZE.posts / 250)
      expect(run.queries).toBeLessThanOrEqual(pages * 2 * 3 + posts + 10)
    },
  )

  it('writes dozens of small files per locale with split locales', { timeout: 1_800_000 }, async () => {
    const run = await measure(payload, optionsFor(1_000, true))
    report('maxUrlsPerFile 1000, split locales', run)
    const children = checkFiles(dir, run.files)
    expect(children.filter(({ filename }) => filename.startsWith('de-pages-'))).toHaveLength(SIZE.pages / 1_000)
    expect(run.files.map(({ filename }) => filename)).toEqual(
      expect.arrayContaining(['sitemap-en.xml', 'sitemap-de.xml']),
    )
  })

  it('queues one run for a burst of saves', { timeout: 600_000 }, async () => {
    const { docs } = await payload.find({ collection: 'posts', depth: 0, limit: SIZE.saves, overrideAccess: true })
    for (const doc of docs) {
      await payload.update({ collection: 'posts', data: { featured: true }, id: doc.id, overrideAccess: true })
    }
    const { totalDocs } = await payload.count({
      collection: 'payload-jobs',
      overrideAccess: true,
      where: { and: [{ taskSlug: { equals: TASK_SLUG } }, { completedAt: { exists: false } }] },
    })
    expect(totalDocs).toBe(1)
  })
})
