import { handleEndpoints } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SitemapFile } from '@/index.js'
import { generateSitemap } from '@/index.js'

import { SERVER } from '../helpers/int/boot.js'
import { read } from '../helpers/int/files.js'
import { base, body, call, cleanup, login, names, reqOf, seed, start } from '../helpers/int/sitemap.js'

afterEach(cleanup)

describe('endpoints', () => {
  it('sends the stored files with cache headers and answers 304 for a known ETag', async () => {
    const { dir, payload } = await start()
    await seed(payload)
    await generateSitemap(await reqOf(payload))

    const index = await call(payload, '/sitemap.xml')
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(index.headers.get('cache-control')).toBe('public, max-age=300')
    const etag = index.headers.get('etag')!
    expect(etag).toMatch(/^"[\da-f]{64}"$/)
    expect(await index.text()).toBe(read(dir, 'sitemap.xml'))

    const cached = await call(payload, '/sitemap.xml', { headers: { 'If-None-Match': etag } })
    expect(cached.status).toBe(304)
    expect(cached.headers.get('etag')).toBe(etag)
    expect(await cached.text()).toBe('')
    expect((await call(payload, '/sitemap.xml', { headers: { 'If-None-Match': '"other"' } })).status).toBe(200)

    expect(await body(payload, '/sitemaps/pages-1.xml')).toBe(read(dir, 'pages-1.xml'))
    expect((await call(payload, '/sitemaps/nope-1.xml')).status).toBe(404)
    expect((await call(payload, '/sitemaps/pages-1.txt')).status).toBe(404)
  })

  it('guards status and generate with access', async () => {
    const { payload } = await start()

    expect((await call(payload, '/sitemap/status')).status).toBe(403)
    expect((await call(payload, '/sitemap/generate', { method: 'POST' })).status).toBe(403)
    expect((await call(payload, '/sitemap/files')).status).toBe(403)

    const headers = await login(payload)
    const status = await call(payload, '/sitemap/status', { headers })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ files: 0, state: 'idle' })
    expect(await (await call(payload, '/sitemap/files', { headers })).json()).toEqual({
      docs: [],
      limit: 100,
      locales: [],
      page: 1,
      sources: ['pages', 'posts'],
      totalDocs: 0,
      totalPages: 0,
    })

    const generate = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(generate.status).toBe(202)
    expect(await (await call(payload, '/sitemap/status', { headers })).json()).toMatchObject({ state: 'queued' })
  })

  it('filters, searches and groups the live files', async () => {
    const source = (name: string, length: number) => ({
      type: 'custom' as const,
      entries: ({ siteUrl }: { siteUrl: string }) =>
        Array.from({ length }, (_, index) => ({ url: `${siteUrl}/${name}/${index}` })),
      locales: ['en'],
      name,
    })
    const { payload } = await start({
      ...base,
      output: { maxUrlsPerFile: 1 },
      sources: [source('alpha', 3), source('beta', 2)],
    })
    await generateSitemap(await reqOf(payload))
    const headers = await login(payload)
    const files = async (query: string) => (await call(payload, `/sitemap/files?${query}`, { headers })).json()

    const beta = await files('source=beta')
    expect(beta).toMatchObject({ limit: 100, source: 'beta', sources: ['alpha', 'beta'], totalDocs: 2 })
    expect(names(beta.docs)).toEqual(['beta-1.xml', 'beta-2.xml'])
    expect(beta.docs[0]).toMatchObject({ kind: 'file', source: 'beta', urls: 1 })
    expect(names((await files('search=alpha-2')).docs)).toEqual(['alpha-2.xml'])
    expect(await files('limit=2')).toMatchObject({ limit: 2, totalDocs: 6, totalPages: 3 })
    expect(await files('limit=500')).toMatchObject({ limit: 100, totalPages: 1 })
    const rest = await files('limit=4&page=2')
    expect(rest).toMatchObject({ page: 2, totalPages: 2 })
    expect(rest.docs).toHaveLength(2)
    const clamped = await files('page=0')
    expect(clamped).toMatchObject({ page: 1 })
    expect(clamped.docs[0]).toMatchObject({ filename: 'sitemap.xml', kind: 'index', urls: 0 })
    const order = async (query: string) => ((await files(query)).docs as SitemapFile[]).map(({ filename }) => filename)
    expect(await files('sort=-filename')).toMatchObject({ sort: '-filename' })
    expect(await order('sort=-filename')).toEqual([
      'sitemap.xml',
      'beta-2.xml',
      'beta-1.xml',
      'alpha-3.xml',
      'alpha-2.xml',
      'alpha-1.xml',
    ])
    expect((await order('sort=urls'))[0]).toBe('sitemap.xml')
    expect(await files('sort=hash')).not.toHaveProperty('sort')
    expect((await order('sort=hash'))[0]).toBe('sitemap.xml')

    const grouped = await files('groupBy=source&limit=2')
    expect(grouped).toMatchObject({ docs: [], groupBy: 'source', page: 1, totalDocs: 3, totalPages: 2 })
    expect(grouped.groups.map(({ value }: { value: null | string }) => value)).toEqual([null, 'alpha'])
    expect(names(grouped.groups[0].docs)).toEqual(['sitemap.xml'])
    expect(grouped.groups[1]).toMatchObject({ page: 1, totalDocs: 3, totalPages: 2 })
    expect(names(grouped.groups[1].docs)).toEqual(['alpha-1.xml', 'alpha-2.xml'])
    const groups = await files('groupBy=source&limit=2&page=2')
    expect(groups.groups.map(({ value }: { value: null | string }) => value)).toEqual(['beta'])
    expect(names((await files('groupBy=source&group=alpha&limit=2&page=2')).docs)).toEqual(['alpha-3.xml'])
    expect(names((await files('groupBy=source&group=')).docs)).toEqual(['sitemap.xml'])

    const unknown = await files('groupBy=tenant')
    expect(unknown).not.toHaveProperty('groups')
    expect(unknown).not.toHaveProperty('groupBy')
    expect(unknown.docs).toHaveLength(6)
  })

  it('filters and groups the live files by locale and sorts them by number', async () => {
    const { payload } = await start({
      ...base,
      output: { splitLocales: true },
      siteUrl: ({ locale }) => `https://${locale}.example.com`,
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    const headers = await login(payload)
    const files = async (query: string) => (await call(payload, `/sitemap/files?${query}`, { headers })).json()

    const de = await files('locale=de')
    expect(de).toMatchObject({ locale: 'de', totalDocs: 3 })
    expect(de.locales.toSorted()).toEqual(['de', 'en'])
    expect(names(de.docs)).toEqual(['de-pages-1.xml', 'de-posts-1.xml', 'sitemap-de.xml'])

    const grouped = await files('groupBy=locale')
    expect(grouped).toMatchObject({ groupBy: 'locale', totalDocs: 2 })
    for (const group of grouped.groups as { docs: SitemapFile[]; value: string }[]) {
      expect(group.docs.map(({ locale }) => locale)).toEqual([group.value, group.value, group.value])
    }
    expect(names((await files('groupBy=locale&group=en')).docs)).toEqual([
      'en-pages-1.xml',
      'en-posts-1.xml',
      'sitemap-en.xml',
    ])

    for (const field of ['size', 'urls'] as const) {
      const values = ((await files(`sort=-${field}`)).docs as SitemapFile[]).map((doc) => doc[field])
      expect(values).toEqual(values.toSorted((a, b) => b - a))
    }
  })

  it.each([
    ['NEXT_BASE_PATH', '/cms', /^\/cms\/api\/sitemap-files\/file\//, '/cms/api/sitemap.xml'],
    ['NEXT_TRAILING_SLASH', 'true', /^\/api\/sitemap-files\/file\/.+\/$/, '/api/sitemap.xml'],
  ])('reads a disk file with %s without fetching its own file route', async (name, value, stored, path) => {
    vi.stubEnv(name, value)
    try {
      const { dir, payload } = await start()
      await seed(payload)
      await generateSitemap(await reqOf(payload))
      const index = await payload.find({
        collection: 'sitemap-files',
        overrideAccess: true,
        where: { kind: { equals: 'index' } },
      })
      expect(new URL(String(index.docs[0]?.url)).pathname).toMatch(stored)

      const fetch = vi.fn(async () => new Response('Forbidden', { status: 403 }))
      vi.stubGlobal('fetch', fetch)
      const response = await handleEndpoints({ config: payload.config, request: new Request(`${SERVER}${path}`) })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(read(dir, 'sitemap.xml'))
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('answers 502 and logs when an upload handler sends a partial answer', async () => {
    const { payload } = await start({
      ...base,
      storage: {
        collection: { upload: { handlers: [() => new Response('<sitemap', { status: 206 })] } },
      },
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))

    const error = vi.spyOn(payload.logger, 'error')
    const broken = await call(payload, '/sitemap.xml', { headers: { Range: 'bytes=0-9' } })
    expect(broken.status).toBe(502)
    expect(error).toHaveBeenCalledWith({ msg: 'sitemap: could not read sitemap.xml, storage answered 206' })
  })
})
