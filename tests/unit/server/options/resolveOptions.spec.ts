import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import type { SitemapPluginOptions, SitemapSource } from '@/index.js'
import { checkSiteUrl } from '@/server/options/checkSiteUrl.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'
import type { ResolvedCollection } from '@/shared/types/index.js'

const SITE = 'https://example.com'

const resolve = (options: Partial<SitemapPluginOptions>) => resolveOptions({ siteUrl: SITE, ...options })

const posts = (source: Record<string, unknown> = {}) =>
  ({ type: 'collection', collection: 'posts', url: '/:slug', ...source }) as SitemapSource

const collectionOf = (source: Record<string, unknown>): ResolvedCollection => {
  const [resolved] = resolve({ sources: [posts(source)] }).sources
  if (resolved?.kind !== 'collection') throw new Error('no collection')
  return resolved.collection
}

const req = {} as PayloadRequest

describe('site URL', () => {
  it('checks the site URL', () => {
    expect(checkSiteUrl('https://example.com/')).toBe('https://example.com')
    expect(() => checkSiteUrl('example.com')).toThrow(/absolute/)
    expect(() => checkSiteUrl('https://undefined/')).toThrow(/absolute/)
    expect(() => checkSiteUrl(undefined, 'de')).toThrow(/siteUrl for locale "de"/)
  })

  it('resolves the site URL per locale from a sync or async function with req', async () => {
    const options = resolveOptions({ siteUrl: ({ locale }) => `https://${locale}.example.com/` })
    expect(await options.siteUrl({ locale: 'de', req })).toBe('https://de.example.com')
    await expect(
      resolveOptions({ siteUrl: ({ locale }) => `https://${locale}.example.com` }).siteUrl({ req }),
    ).rejects.toThrow(/undefined/)
    const fromReq = resolveOptions({
      siteUrl: async ({ req: request }) => `https://${String(request.context.host)}`,
    })
    expect(await fromReq.siteUrl({ req: { context: { host: 'tenant.example.com' } } as never })).toBe(
      'https://tenant.example.com',
    )
  })
})

describe('defaults', () => {
  it('fills every group from the minimal options', async () => {
    const options = resolveOptions({
      siteUrl: `${SITE}/`,
      sources: [{ type: 'collection', collection: 'posts', url: '/blog/:slug' }],
    })
    expect(options.output).toMatchObject({ hreflang: true, maxUrls: 50_000, splitLocales: false })
    expect(options.output.fileUrl({ filename: 'posts-1.xml', siteUrl: SITE })).toBe(`${SITE}/sitemaps/posts-1.xml`)
    expect(options.storage).toEqual({ collection: 'sitemap-files', enabled: true, overrides: {}, upload: undefined })
    expect(options.endpoints).toEqual({ files: true, generate: true })
    expect(options.sources[0]).toMatchObject({ onError: 'fail' })
    expect(options.jobs).toEqual({
      mode: 'payload',
      queue: 'default',
      regenerate: { collections: [], delay: 300_000, globals: [] },
      schedule: undefined,
    })
    expect(options.publish).toBeUndefined()
    expect(options.admin).toMatchObject({ view: true, widget: true })
    const adminReq = (user?: { collection: string }) =>
      ({ req: { payload: { config: { admin: { user: 'users' } } }, user } }) as never
    expect(options.admin.access(adminReq({ collection: 'users' }))).toBe(true)
    expect(options.admin.access(adminReq({ collection: 'customers' }))).toBe(false)
    expect(options.admin.access(adminReq())).toBe(false)
    expect(options.tenants).toBeUndefined()
  })

  it('names files by default', () => {
    const { filename } = resolve({}).output
    expect(filename({ kind: 'index' })).toBe('sitemap.xml')
    expect(filename({ kind: 'index', locale: 'de', tenant: { id: 7 } })).toBe('sitemap-7-de.xml')
    expect(filename({ kind: 'file', part: 2, source: 'posts' })).toBe('posts-2.xml')
    expect(filename({ kind: 'file', locale: 'de', part: 1, source: 'posts', tenant: { id: 'a' } })).toBe(
      'a-de-posts-1.xml',
    )
  })

  it('fills the tenants defaults and passes the tenant to siteUrl', async () => {
    expect(resolve({ tenants: true }).tenants).toEqual({ collection: 'tenants', field: 'tenant' })
    expect(resolve({ tenants: false }).tenants).toBeUndefined()
    expect(
      resolve({ tenants: { collection: 'sites', field: 'site', where: { active: { equals: true } } } }).tenants,
    ).toEqual({ collection: 'sites', field: 'site', where: { active: { equals: true } } })
    const options = resolve({ siteUrl: ({ tenant }) => `https://${tenant?.domain}`, tenants: true })
    expect(await options.siteUrl({ req, tenant: { domain: 'gold.example.com', id: 1 } })).toBe(
      'https://gold.example.com',
    )
    await expect(options.siteUrl({ locale: 'de', req, tenant: { id: 2 } })).rejects.toThrow(
      'siteUrl for tenant 2 and locale "de" must be an absolute http(s) URL',
    )
  })

  it('reads every group', async () => {
    const upload = async () => ({ url: 'https://cdn.example.com/x' })
    const access = () => true
    const remove = async () => {}
    const filename = () => 'a.xml'
    const put = async () => {}
    const options = resolve({
      admin: { access, view: false, widget: false },
      endpoints: { files: false, generate: false },
      jobs: {
        queue: 'seo',
        regenerate: { collections: ['pages'], delay: 5, globals: ['settings'] },
        schedule: '0 3 * * *',
      },
      output: {
        filename,
        fileUrl: ({ filename: name }) => `https://cdn.example.com/${name}`,
        hreflang: false,
        maxUrlsPerFile: 10,
        splitLocales: true,
      },
      publish: { delete: remove, put },
      storage: { collection: { admin: { hidden: false } }, delete: remove, upload },
    })
    expect(options.admin).toEqual({ access, view: false, widget: false })
    expect(options.endpoints).toEqual({ files: false, generate: false })
    expect(options.jobs).toEqual({
      mode: 'payload',
      queue: 'seo',
      regenerate: { collections: ['pages'], delay: 5, globals: ['settings'] },
      schedule: '0 3 * * *',
    })
    expect(options.output).toMatchObject({ filename, hreflang: false, maxUrls: 10, splitLocales: true })
    expect(options.output.fileUrl({ filename: 'a.xml', siteUrl: SITE })).toBe('https://cdn.example.com/a.xml')
    expect(options.publish).toEqual({ delete: remove, put })
    expect(options.storage).toEqual({
      collection: 'sitemap-files',
      delete: remove,
      enabled: true,
      overrides: { admin: { hidden: false } },
      upload,
    })
    expect(resolve({ jobs: { regenerate: false } }).jobs).toMatchObject({ regenerate: false })
    expect(resolve({ jobs: false }).jobs).toBe(false)
    const enqueue = () => 'job'
    expect(resolve({ jobs: { enqueue } }).jobs).toEqual({
      enqueue,
      mode: 'enqueue',
      regenerate: { collections: [], delay: 300_000, globals: [] },
    })
    expect(
      resolve({ output: { fileUrl: () => 'https://cdn.example.com/a.xml' }, publish: { put }, storage: false }).storage,
    ).toEqual({
      collection: 'sitemap-files',
      enabled: false,
      overrides: {},
    })
    expect(resolve({ sources: [posts({ onError: 'keep' })] }).sources[0]).toMatchObject({ onError: 'keep' })
  })

  it('keeps the order of the sources and names them', () => {
    const options = resolve({
      sources: [
        posts(),
        { type: 'static', entries: [{ url: '/' }] },
        { type: 'custom', entries: () => [], locales: ['en'], name: 'filters' },
        posts({ name: 'news', query: { where: { featured: { equals: true } } } }),
      ],
    })
    expect(options.sources.map(({ kind, locales, name }) => [kind, name, locales])).toEqual([
      ['collection', 'posts', undefined],
      ['static', 'static', undefined],
      ['custom', 'filters', ['en']],
      ['collection', 'news', undefined],
    ])
    expect(options.sources[3]).toMatchObject({ name: 'news', slug: 'posts' })
    expect(resolve({}).sources).toEqual([])
  })

  it('takes the default url pattern', async () => {
    const collection = collectionOf({ url: undefined })
    expect(collection.pattern).toBe('/:slug')
    expect(await collection.url({ doc: { id: 1, slug: 'a' }, req, siteUrl: SITE })).toBe(`${SITE}/a`)
  })
})

describe('collections', () => {
  it('builds the URL from a pattern, fills :locale and keeps absolute and //host URLs', async () => {
    const { url } = collectionOf({ url: '/blog/:category.slug/:slug' })
    const doc = { category: { slug: 'news' }, id: 1, slug: 'a b/c' }
    expect(await url({ doc, req, siteUrl: SITE })).toBe(`${SITE}/blog/news/a%20b/c`)
    expect(await url({ doc: { ...doc, slug: '' }, req, siteUrl: SITE })).toBeUndefined()
    expect(await url({ doc: { id: 2, slug: 'x' }, req, siteUrl: SITE })).toBeUndefined()
    const shop = collectionOf({ url: 'https://shop.example.com/p/:slug' })
    expect(await shop.url({ doc, req, siteUrl: SITE })).toBe('https://shop.example.com/p/a%20b/c')
    const localized = collectionOf({ url: '/:locale/blog/:slug' })
    expect(await localized.url({ doc: { id: 1, slug: 'a' }, locale: 'de', req, siteUrl: SITE })).toBe(
      `${SITE}/de/blog/a`,
    )
    expect(await localized.url({ doc: { id: 1, slug: 'a' }, req, siteUrl: SITE })).toBeUndefined()
    const html = collectionOf({ url: '/:{slug}.html' })
    expect(await html.url({ doc: { id: 1, slug: 'a' }, req, siteUrl: SITE })).toBe(`${SITE}/a.html`)
    const cdn = collectionOf({ url: '//cdn.example.com/:slug' })
    expect(await cdn.url({ doc: { id: 1, slug: 'a' }, req, siteUrl: SITE })).toBe('https://cdn.example.com/a')
  })

  it('uses the url function and joins a relative result to the site URL', async () => {
    const { url } = collectionOf({
      url: ({ doc, siteUrl }: { doc: { id: number }; siteUrl: string }) => `${siteUrl}/p/${doc.id}`,
    })
    expect(await url({ doc: { id: 7 }, req, siteUrl: SITE })).toBe(`${SITE}/p/7`)
    const relative = collectionOf({ url: ({ doc }: { doc: { id: number } }) => (doc.id === 1 ? null : `p/${doc.id}`) })
    expect(await relative.url({ doc: { id: 7 }, req, siteUrl: SITE })).toBe(`${SITE}/p/7`)
    expect(await relative.url({ doc: { id: 1 }, req, siteUrl: SITE })).toBeUndefined()
  })

  it('fills query defaults and sets depth 1 for field images and nested paths', () => {
    expect(collectionOf({}).query).toEqual({
      depth: 0,
      overrideAccess: false,
      select: undefined,
      sort: 'id',
      where: undefined,
    })
    expect(collectionOf({ images: ['cover'] }).query.depth).toBe(1)
    expect(collectionOf({ url: '/:category.slug/:slug' }).query.depth).toBe(1)
    expect(collectionOf({ images: () => [] }).query.depth).toBe(0)
    expect(collectionOf({ images: [() => [], 'cover'] }).query.depth).toBe(1)
    expect(collectionOf({ images: ['cover'], query: { depth: 2 } }).query.depth).toBe(2)
    const where = { featured: { equals: true } }
    expect(collectionOf({ query: { overrideAccess: true, sort: '-publishedAt', where } }).query).toMatchObject({
      overrideAccess: true,
      sort: '-publishedAt',
      where,
    })
  })

  it('adds the fields it needs to select', () => {
    const { query } = collectionOf({
      images: ['hero.image', { field: 'gallery.image' }],
      lastmod: 'meta.publishedAt',
      url: '/:category.slug/:slug',
      query: { select: { title: true }, sort: '-publishedAt' },
    })
    expect(query.select).toEqual({
      category: true,
      gallery: true,
      hero: true,
      meta: true,
      publishedAt: true,
      slug: true,
      title: true,
    })
    const exclude = { body: false } as const
    expect(collectionOf({ query: { select: exclude } }).query.select).toEqual(exclude)
  })
})

describe('validation', () => {
  const run = (options: Partial<SitemapPluginOptions>) => () => resolve(options)

  it('rejects unknown keys and names their group', () => {
    expect(run({ regenerate: false } as Partial<SitemapPluginOptions>)).toThrow(
      'unknown option "regenerate" in sitemap options',
    )
    expect(run({ sources: [posts({ where: {} })] })).toThrow('unknown option "where" in sources[0]')
    expect(run({ sources: [posts({ query: { limit: 1 } })] })).toThrow('in sources[0].query')
    expect(run({ sources: [posts({ images: [{ alt: 'x', field: 'a' }] })] })).toThrow('images[0]')
    expect(run({ sources: [{ entries: () => [], name: 'a', priority: 1, type: 'custom' } as never] })).toThrow(
      'in sources[0]',
    )
    expect(run({ output: { maxURLsPerFile: 1 } as never })).toThrow('in output')
    expect(run({ storage: { serve: 'stream' } as never })).toThrow('unknown option "serve" in storage')
    expect(run({ jobs: { cron: 'x' } as never })).toThrow('in jobs')
    expect(run({ jobs: { regenerate: { wait: 1 } as never } })).toThrow('in jobs.regenerate')
    expect(run({ admin: { hidden: true } as never })).toThrow('in admin')
    expect(run({ publish: { put: async () => {}, upload: 1 } as never })).toThrow('in publish')
    expect(run({ sources: [{ entries: [{ title: 'x', url: '/' } as never], type: 'static' }] })).toThrow(
      'in sources[0].entries[0]',
    )
  })

  it('checks the source type', () => {
    expect(run({ sources: [{ collection: 'posts' } as never] })).toThrow(
      'sources[0].type must be "collection", "custom" or "static"',
    )
    expect(run({ sources: {} as never })).toThrow('sources must be an array')
    expect(run({ sources: [{ type: 'collection' } as never] })).toThrow('sources[0].collection must be a collection')
  })

  it('checks the url and the query', () => {
    expect(run({ sources: [posts({ url: '' })] })).toThrow('sources[0].url must be a URL pattern')
    expect(run({ sources: [posts({ url: 1 })] })).toThrow('sources[0].url must be a URL pattern')
    expect(run({ sources: [posts({ query: { overrideAccess: 'yes' } })] })).toThrow(
      'sources[0].query.overrideAccess must be true or false',
    )
    for (const sort of ['meta.date', '', '-', 1]) {
      expect(run({ sources: [posts({ query: { sort } })] })).toThrow('sources[0].query.sort must be a top-level field')
    }
  })

  it('checks the fields option', () => {
    const fieldsOf = (fields: unknown) => collectionOf({ fields }).fields
    expect(() => fieldsOf({ exclude: true, hidden: true })).toThrow(
      'unknown option "hidden" in sources[0].fields. Allowed: exclude, priority, changefreq, position',
    )
    expect(() => fieldsOf({ position: 'sidebar' })).toThrow('sources[0].fields needs at least one of')
    expect(() => fieldsOf({ exclude: 'yes' })).toThrow('sources[0].fields.exclude must be true or false')
  })

  it('checks source names', () => {
    const custom = (name: string) => ({ entries: () => [], name, type: 'custom' }) as const
    expect(run({ sources: [custom('a b')] })).toThrow(/letters/)
    expect(run({ sources: [posts(), custom('posts')] })).toThrow(
      'sources[0] and sources[1] both write files named "posts"',
    )
    expect(() => resolve({ sources: [posts(), posts({ name: 'news' })] })).not.toThrow()
    expect(run({ sources: [{ entries: [] as never, name: 'a', type: 'custom' }] })).toThrow(
      'sources[0].entries must be a function',
    )
    expect(run({ sources: [{ entries: 'x' as never, type: 'static' }] })).toThrow(
      'sources[0].entries must be an array or a function',
    )
  })

  it('allows fields on one source per collection', () => {
    expect(run({ sources: [posts({ fields: true }), posts({ fields: { exclude: true }, name: 'news' })] })).toThrow(
      'sources[0] and sources[1] both set fields for "posts", only one may',
    )
    expect(() => resolve({ sources: [posts({ fields: true }), posts({ name: 'news' })] })).not.toThrow()
  })

  it('checks priority and changefreq', () => {
    expect(run({ sources: [posts({ priority: 1.5 })] })).toThrow(/priority/)
    expect(run({ sources: [posts({ changefreq: 'sometimes' })] })).toThrow(/changefreq/)
    expect(run({ sources: [{ entries: [{ priority: 2, url: '/' }], type: 'static' }] })).toThrow(
      /sources\[0\]\.entries\[0\]\.priority/,
    )
    expect(() => resolve({ sources: [posts({ priority: () => 5 })] })).not.toThrow()
  })

  it('checks jobs, images and locales', () => {
    expect(run({ jobs: { schedule: 5 as never } })).toThrow('jobs.schedule must be a cron string')
    expect(run({ jobs: { queue: 5 as never } })).toThrow('jobs.queue must be a string')
    expect(run({ jobs: { enqueue: 'bull' as never } })).toThrow('jobs.enqueue must be a function')
    expect(run({ jobs: { enqueue: () => 'job', schedule: '0 3 * * *' } })).toThrow(
      'jobs.schedule needs the Payload jobs queue',
    )
    expect(run({ jobs: { enqueue: () => 'job', queue: 'seo' } })).toThrow(
      'jobs.queue names a Payload jobs queue, not used with jobs.enqueue',
    )
    expect(run({ endpoints: { files: 'no' as never } })).toThrow('endpoints.files must be true or false')
    expect(run({ endpoints: { generate: 1 as never } })).toThrow('endpoints.generate must be true or false')
    expect(run({ endpoints: { serve: true } as never })).toThrow('unknown option "serve" in endpoints')
    expect(run({ storage: false })).toThrow('storage: false needs publish')
    expect(run({ sources: [posts({ onError: 'skip' as never })] })).toThrow(
      'sources[0].onError must be "fail" or "keep"',
    )
    expect(run({ sources: [{ type: 'static', entries: [], onError: 'x' as never }] })).toThrow(
      'sources[0].onError must be "fail" or "keep"',
    )
    expect(run({ sources: [posts({ images: 'cover' })] })).toThrow('sources[0].images must be an array or a function')
    expect(run({ sources: [posts({ images: [{ field: '' }] })] })).toThrow(
      'sources[0].images[0].field must be a field path',
    )
    expect(run({ sources: [posts({ images: [{ field: 'cover', url: 'x' }] })] })).toThrow(
      'sources[0].images[0].url must be a function',
    )
    expect(run({ sources: [posts({ locales: 'en' })] })).toThrow('sources[0].locales must be an array')
    expect(run({ sources: [{ entries: () => [], locales: 'en' as never, name: 'a', type: 'custom' }] })).toThrow(
      'sources[0].locales must be an array',
    )
  })

  it('checks publish', () => {
    const put = async () => {}
    expect(run({ publish: { put } })).toThrow('publish needs output.fileUrl')
    expect(run({ output: { fileUrl: () => 'x' }, publish: {} as never })).toThrow('publish.put must be a function')
    expect(run({ output: { fileUrl: () => 'x' }, publish: { delete: 1 as never, put } })).toThrow(
      'publish.delete must be a function',
    )
    expect(() => resolve({ output: { fileUrl: () => 'x' }, publish: { put } })).not.toThrow()
  })

  it('checks the other groups', () => {
    const upload = async () => ({ url: '' })
    expect(run({ siteUrl: undefined })).toThrow('siteUrl is required')
    expect(run({ output: { maxUrlsPerFile: 50_001 } })).toThrow(/maxUrlsPerFile/)
    expect(run({ output: { filename: 'x' as never } })).toThrow('output.filename must be a function')
    expect(run({ jobs: { regenerate: { delay: -1 } } })).toThrow(/delay/)
    expect(run({ storage: { collection: { upload: true }, upload } })).toThrow(
      'storage.collection.upload cannot be set with storage.upload',
    )
    expect(resolve({ storage: { collection: { slug: 'seo-files' }, upload } }).storage).toMatchObject({
      collection: 'seo-files',
      upload,
    })
    expect(run({ storage: { delete: async () => {} } })).toThrow('storage.delete needs storage.upload')
    expect(run({ storage: { delete: 'x' as never, upload } })).toThrow('storage.delete must be a function')
    expect(run({ storage: { collection: { slug: 'a b' } } })).toThrow(/storage.collection.slug/)
    expect(run({ storage: { collection: { fields: [] as never } } })).toThrow(
      'storage.collection.fields must be a function',
    )
    expect(run({ sources: [posts({ fields: 'yes' })] })).toThrow(/fields/)
    expect(run({ sources: [posts({ lastmod: 1 })] })).toThrow(/lastmod/)
    expect(run({ telemetry: { url: '' } })).toThrow('telemetry.url must be a URL')
    expect(run({ telemetry: { endpoint: 'x' } as never })).toThrow('unknown option "endpoint" in telemetry')
    expect(run({ telemetry: 'off' as never })).toThrow('telemetry must be an object')
    expect(run({ tenants: { slug: 'x' } as never })).toThrow('unknown option "slug" in tenants')
    expect(run({ tenants: { field: '' } })).toThrow('tenants.field must be a non-empty string')
    expect(run({ tenants: 'yes' as never })).toThrow('tenants must be an object')
    expect(run({ tenants: { where: [] as never } })).toThrow('tenants.where must be an object')
  })
})
