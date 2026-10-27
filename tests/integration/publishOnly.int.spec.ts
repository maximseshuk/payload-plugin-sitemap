import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SitemapSource } from '@/index.js'
import { generateSitemap, STATUS_SLUG } from '@/index.js'

import {
  base,
  bootFails,
  call,
  cleanup,
  custom,
  pages,
  posts,
  reqOf,
  seed,
  SITE,
  start,
} from '../helpers/int/sitemap.js'

afterEach(cleanup)

const fileUrl = ({ filename }: { filename: string }) => `${SITE}/sitemaps/${filename}`

const flaky = (state: { broken: boolean; extra?: boolean }): SitemapSource => ({
  ...custom('extra', ({ siteUrl }) => {
    if (state.broken) throw new Error('feed down')
    return [{ url: `${siteUrl}/extra` }, ...(state.extra ? [{ url: `${siteUrl}/more` }] : [])]
  }),
  onError: 'keep',
})

describe('storage false', () => {
  it('puts only changed files after the run, children first, and redirects the file endpoints', async () => {
    const puts: string[] = []
    const bodies = new Map<string, string>()
    const put = vi.fn(async ({ body, filename }: { body: Buffer; filename: string }) => {
      puts.push(filename)
      bodies.set(filename, body.toString())
    })
    const { payload } = await start({ ...base, output: { fileUrl }, publish: { put }, storage: false })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    expect(puts.at(-1)).toBe('sitemap.xml')
    expect(puts.toSorted()).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    expect(bodies.get('pages-1.xml')).toContain('<urlset')

    const docs = (await payload.find({ collection: 'sitemap-files', overrideAccess: true })).docs
    expect(docs).toHaveLength(3)
    expect(docs.every((doc) => doc.published === doc.hash)).toBe(true)
    expect(docs.find((doc) => doc.filename === 'pages-1.xml')?.url).toBe(`${SITE}/sitemaps/pages-1.xml`)
    expect(docs.every((doc) => !('mimeType' in doc) || !doc.mimeType)).toBe(true)

    const index = await call(payload, '/sitemap.xml')
    expect(index.status).toBe(302)
    expect(index.headers.get('location')).toBe(`${SITE}/sitemaps/sitemap.xml`)
    expect((await call(payload, '/sitemaps/posts-1.xml')).headers.get('location')).toBe(`${SITE}/sitemaps/posts-1.xml`)

    puts.length = 0
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual([])

    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { equals: 'post-1' } } })
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['posts-1.xml'])
  })

  it('puts nothing when the run fails and deletes nothing without publish.delete', async () => {
    const state = { broken: false }
    const puts: string[] = []
    const { payload } = await start({
      ...base,
      output: { fileUrl, maxUrlsPerFile: 2 },
      publish: { put: async ({ filename }) => void puts.push(filename) },
      sources: [
        pages,
        posts,
        {
          ...custom('feed', ({ siteUrl }) => {
            if (state.broken) throw new Error('feed down')
            return [{ url: `${siteUrl}/feed` }]
          }),
        },
      ],
      storage: false,
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))

    puts.length = 0
    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { in: ['post-1', 'post-2'] } } })
    state.broken = true
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('feed down')
    expect(puts).toEqual([])
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBe('feed down')

    state.broken = false
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['posts-1.xml', 'sitemap.xml'])
  })

  it('puts a file again from the buffer after a failed put, with no change in between', async () => {
    let broken = true
    const puts: string[] = []
    const put = async ({ filename }: { filename: string }) => {
      if (broken && filename === 'posts-1.xml') throw new Error('cdn down')
      puts.push(filename)
    }
    const { payload } = await start({ ...base, output: { fileUrl }, publish: { put }, storage: false })
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('cdn down')
    expect(puts).toEqual(['pages-1.xml'])

    broken = false
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
  })

  it('removes its temporary folder after a run and after a failed run', async () => {
    const previous = process.env.TMPDIR
    const dir = mkdtempSync(path.join(tmpdir(), 'sitemap-test-'))
    process.env.TMPDIR = dir
    try {
      const state = { broken: false }
      const { payload } = await start({
        ...base,
        output: { fileUrl },
        publish: { put: async () => {} },
        sources: [
          pages,
          custom('feed', ({ siteUrl }) => {
            if (state.broken) throw new Error('feed down')
            return [{ url: `${siteUrl}/feed` }]
          }),
        ],
        storage: false,
      })
      await seed(payload)
      const before = readdirSync(dir)
      await generateSitemap(await reqOf(payload))
      expect(readdirSync(dir)).toEqual(before)
      state.broken = true
      await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('feed down')
      expect(readdirSync(dir)).toEqual(before)
    } finally {
      process.env.TMPDIR = previous
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('moves the redirect of an unchanged file to a new fileUrl', async () => {
    let host = SITE
    const { payload } = await start({
      ...base,
      output: { fileUrl: ({ filename }) => `${host}/sitemaps/${filename}` },
      publish: { put: async () => {} },
      storage: false,
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    host = 'https://cdn.example.com'
    await generateSitemap(await reqOf(payload))
    expect((await call(payload, '/sitemaps/pages-1.xml')).headers.get('location')).toBe(
      'https://cdn.example.com/sitemaps/pages-1.xml',
    )
  })

  it('needs publish', async () => {
    await expect(bootFails({ ...base, storage: false })).rejects.toThrow(
      'storage: false needs publish, the only place the files go',
    )
  })
})

describe('onError keep', () => {
  it('keeps the files of a failing source from the last run and succeeds', async () => {
    const state = { broken: false, extra: false }
    const { payload } = await start({ ...base, sources: [pages, posts, flaky(state)] })
    await seed(payload)
    const first = await generateSitemap(await reqOf(payload))
    const kept = first.find((file) => file.filename === 'extra-1.xml')
    expect((await call(payload, '/sitemaps/extra-1.xml')).status).toBe(200)

    state.broken = true
    const warn = vi.spyOn(payload.logger, 'warn')
    const files = await generateSitemap(await reqOf(payload))
    expect(files.find((file) => file.filename === 'extra-1.xml')).toMatchObject({ hash: kept?.hash, urls: kept?.urls })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'sitemap: source extra failed, kept its files from the last run' }),
    )
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBeFalsy()
    const index = await (await call(payload, '/sitemap.xml')).text()
    expect(index).toContain('extra-1.xml')
    expect(await (await call(payload, '/sitemaps/extra-1.xml')).text()).toContain(`${SITE}/extra`)

    state.broken = false
    state.extra = true
    await generateSitemap(await reqOf(payload))
    expect(await (await call(payload, '/sitemaps/extra-1.xml')).text()).toContain(`${SITE}/more`)
  })

  it('fails the run when the source has no files from a last run', async () => {
    const { payload } = await start({ ...base, sources: [pages, posts, flaky({ broken: true })] })
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('feed down')
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBe('feed down')
  })

  it('drops the parts a failing source already stored and keeps the last run', async () => {
    const state = { broken: false }
    const source: SitemapSource = {
      ...custom('feed', async function* ({ siteUrl }) {
        yield { url: `${siteUrl}/feed-1` }
        yield { url: `${siteUrl}/feed-2` }
        if (state.broken) throw new Error('feed down')
        yield { url: `${siteUrl}/feed-3` }
      }),
      onError: 'keep',
    }
    const { payload } = await start({ ...base, output: { maxUrlsPerFile: 1 }, sources: [pages, source] })
    await seed(payload)
    const first = await generateSitemap(await reqOf(payload))
    const feed = (files: { filename: string }[]) =>
      files.map(({ filename }) => filename).filter((name) => name.startsWith('feed-'))
    expect(feed(first)).toHaveLength(6)

    state.broken = true
    const second = await generateSitemap(await reqOf(payload))
    expect(feed(second)).toEqual(feed(first))
    const docs = (await payload.find({ collection: 'sitemap-files', limit: 0, overrideAccess: true })).docs
    expect(docs.filter(({ name }) => String(name).startsWith('feed-'))).toHaveLength(6)
  })

  it('keeps only the failing locale of a source with splitLocales', async () => {
    const state = { broken: false }
    const source: SitemapSource = {
      ...custom('feed', ({ locale, siteUrl }) => {
        if (state.broken && locale === 'de') throw new Error('feed down')
        return [{ url: `${siteUrl}/feed${state.broken ? '-new' : ''}` }]
      }),
      onError: 'keep',
    }
    const { payload } = await start({
      ...base,
      output: { splitLocales: true },
      siteUrl: ({ locale }) => `${SITE}/${locale}`,
      sources: [source],
    })
    await generateSitemap(await reqOf(payload))
    state.broken = true
    await generateSitemap(await reqOf(payload))
    expect(await (await call(payload, '/sitemaps/en-feed-1.xml')).text()).toContain(`${SITE}/en/feed-new`)
    const de = await (await call(payload, '/sitemaps/de-feed-1.xml')).text()
    expect(de).toContain(`${SITE}/de/feed`)
    expect(de).not.toContain('feed-new')
  })

  it('fails instead of keeping files that were never published with storage false', async () => {
    const state = { broken: false }
    let cdn = false
    const put = async ({ filename }: { filename: string }) => {
      if (cdn && filename === 'extra-1.xml') throw new Error('cdn down')
    }
    const { payload } = await start({
      ...base,
      output: { fileUrl },
      publish: { put },
      sources: [pages, posts, flaky(state)],
      storage: false,
    })
    await seed(payload)
    cdn = true
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('cdn down')

    cdn = false
    state.broken = true
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('feed down')
  })

  it('does not put the kept files again with storage false', async () => {
    const state = { broken: false }
    const puts: string[] = []
    const { payload } = await start({
      ...base,
      output: { fileUrl },
      publish: { put: async ({ filename }) => void puts.push(filename) },
      sources: [pages, posts, flaky(state)],
      storage: false,
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    expect(puts).toContain('extra-1.xml')

    puts.length = 0
    state.broken = true
    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { equals: 'post-1' } } })
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['posts-1.xml'])
    const docs = (await payload.find({ collection: 'sitemap-files', overrideAccess: true })).docs
    expect(docs.map((doc) => doc.filename).toSorted()).toEqual([
      'extra-1.xml',
      'pages-1.xml',
      'posts-1.xml',
      'sitemap.xml',
    ])
  })
})
