import { seoPlugin } from '@payloadcms/plugin-seo'
import { findFieldPaths } from '@seshuk/payload-plugin-tooling/fields'
import type { Payload, PayloadRequest, Plugin } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sitemapFields } from '@/fields/index.js'
import type { SitemapFile, SitemapPluginOptions } from '@/index.js'
import { generateSitemap, LOCKS_SLUG, PLUGIN_NAME, STATUS_SLUG } from '@/index.js'

import { SERVER } from '../helpers/int/boot.js'
import { publicName, read, storedNames } from '../helpers/int/files.js'
import {
  base,
  body,
  bootFails,
  call,
  cleanup,
  custom,
  names,
  optionalSlug,
  publish,
  publishedRead,
  reqOf,
  seed,
  SITE,
  start,
  userReq,
} from '../helpers/int/sitemap.js'

afterEach(cleanup)

describe('generation', () => {
  it('writes the index and child sitemaps into the upload collection', async () => {
    const { dir, payload } = await start()
    await seed(payload)

    const files = await generateSitemap(await reqOf(payload))

    expect(names(files)).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    const docs = await payload.find({ collection: 'sitemap-files', overrideAccess: true })
    expect(docs.docs.map((doc) => doc.name).toSorted()).toEqual(names(files))
    expect(storedNames(dir).map(publicName).toSorted()).toEqual(names(files))

    const index = read(dir, 'sitemap.xml')
    expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(index).toContain(`<loc>${SITE}/sitemaps/pages-1.xml</loc>`)
    const lastmods = [...index.matchAll(/<lastmod>(.+?)<\/lastmod>/g)].map((match) => match[1])
    expect(lastmods).toHaveLength(2)

    const pagesXML = read(dir, 'pages-1.xml')
    expect(pagesXML).toContain(`<loc>${SITE}/en/about</loc>`)
    expect(pagesXML).toContain(`<loc>${SITE}/de/ueber-uns</loc>`)
    expect(pagesXML).toContain(`<xhtml:link rel="alternate" hreflang="de" href="${SITE}/de/ueber-uns"/>`)
    expect(pagesXML).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/about"/>`)
    expect(pagesXML).toContain('<changefreq>weekly</changefreq>')
    expect(pagesXML).not.toContain('hidden')
    expect(pagesXML).not.toContain('draft')

    const postsXML = read(dir, 'posts-1.xml')
    expect(postsXML.match(/<url>/g)).toHaveLength(6)
    expect(postsXML).toContain(`<image:loc>${SITE}/img/1.jpg?a=1&amp;b=2</image:loc>`)

    const status = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    expect(status.urls).toBe(8)
    expect(status.generatedAt).toBeTruthy()
  })

  it('skips unchanged files and uploads only what changed', async () => {
    const { dir, payload } = await start()
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    const snapshot = async () =>
      (await payload.find({ collection: 'sitemap-files', overrideAccess: true, sort: 'name' })).docs.map(
        (doc) => [doc.name, doc.id, doc.updatedAt] as const,
      )
    const before = await snapshot()

    await generateSitemap(await reqOf(payload))
    expect(await snapshot()).toEqual(before)

    await payload.create({
      overrideAccess: true,
      collection: 'posts',
      data: { slug: 'post-4', title: 'Post 4' },
      locale: 'en',
    })
    await generateSitemap(await reqOf(payload))
    const after = await snapshot()
    const changed = after.filter(([, id], index) => id !== before[index]![1]).map(([name]) => name)
    expect(changed).toEqual(['posts-1.xml', 'sitemap.xml'])
    expect(after.map(([name]) => name)).toEqual(before.map(([name]) => name))
    expect(storedNames(dir)).toHaveLength(3)
  })

  it('splits files at maxUrlsPerFile and removes files that are no longer needed', async () => {
    const { dir, payload } = await start({ ...base, output: { maxUrlsPerFile: 2 } })
    await seed(payload)

    expect(names(await generateSitemap(await reqOf(payload)))).toEqual([
      'pages-1.xml',
      'posts-1.xml',
      'posts-2.xml',
      'posts-3.xml',
      'sitemap.xml',
    ])
    expect(read(dir, 'sitemap.xml').match(/<sitemap>/g)).toHaveLength(4)

    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { in: ['post-1', 'post-2'] } } })
    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    const docs = await payload.find({ collection: 'sitemap-files', overrideAccess: true })
    expect(docs.totalDocs).toBe(3)
    expect(storedNames(dir)).toHaveLength(3)
  })

  it('writes one index per locale with splitLocales and a site URL per locale', async () => {
    const { dir, payload } = await start({
      ...base,
      output: { splitLocales: true },
      siteUrl: ({ locale }) => `https://${locale}.example.com`,
    })
    await seed(payload)

    expect(names(await generateSitemap(await reqOf(payload)))).toEqual([
      'de-pages-1.xml',
      'de-posts-1.xml',
      'en-pages-1.xml',
      'en-posts-1.xml',
      'sitemap-de.xml',
      'sitemap-en.xml',
    ])
    expect(read(dir, 'sitemap-de.xml')).toContain('<loc>https://de.example.com/sitemaps/de-pages-1.xml</loc>')
    expect(read(dir, 'de-pages-1.xml')).toContain('<loc>https://de.example.com/de/ueber-uns</loc>')
    expect(read(dir, 'de-pages-1.xml')).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://en.example.com/en/about"/>',
    )

    const response = await call(payload, '/sitemap.xml?locale=de')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(read(dir, 'sitemap-de.xml'))
    expect(await body(payload, '/sitemap.xml?locale=fr')).toBe(read(dir, 'sitemap-en.xml'))
  })

  it('lists a page in a locale only when that locale is published', async () => {
    const { dir, payload } = await start(
      { ...base, output: { splitLocales: true }, siteUrl: ({ locale }) => `https://${locale}.example.com` },
      {},
      [optionalSlug],
    )
    await payload.create({
      collection: 'pages',
      data: { _status: 'published', slug: 'en-only', title: 'En only' },
      locale: 'en',
      overrideAccess: true,
    })
    const draft = await payload.create({
      collection: 'pages',
      data: { _status: 'draft', slug: 'entwurf', title: 'Entwurf' },
      draft: true,
      locale: 'de',
      overrideAccess: true,
    })
    await payload.update({
      collection: 'pages',
      data: { _status: 'published', slug: 'de-draft', title: 'De draft' },
      id: draft.id,
      locale: 'en',
      overrideAccess: true,
    })
    const shared = await payload.create({
      collection: 'pages',
      data: { _status: 'published', slug: 'shared', title: 'Shared' },
      locale: 'en',
      overrideAccess: true,
    })
    await payload.update({
      collection: 'pages',
      data: { _status: 'published', title: 'Geteilt' },
      id: shared.id,
      locale: 'de',
      overrideAccess: true,
    })

    await generateSitemap(await reqOf(payload))

    const en = read(dir, 'en-pages-1.xml')
    expect(en).toContain('<loc>https://en.example.com/en/en-only</loc>')
    expect(en).toContain('<loc>https://en.example.com/en/de-draft</loc>')
    expect(en).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://de.example.com/de/shared"/>')
    expect(en).not.toContain('https://de.example.com/de/en-only')
    expect(en).not.toContain('https://de.example.com/de/de-draft')
    const de = read(dir, 'de-pages-1.xml')
    expect(de.match(/<url>/g)).toHaveLength(1)
    expect(de).toContain('<loc>https://de.example.com/de/shared</loc>')
  })

  it('leaves the alternates out with hreflang off', async () => {
    const { dir, payload } = await start({ ...base, output: { hreflang: false } })
    await seed(payload)
    await generateSitemap(await reqOf(payload))

    const pagesXML = read(dir, 'pages-1.xml')
    expect(pagesXML).toContain(`<loc>${SITE}/de/ueber-uns</loc>`)
    expect(pagesXML).not.toContain('xhtml:link')
  })

  it('lists published pages when read access returns a where on localized fields', async () => {
    const { dir, payload } = await start(base, {}, [publishedRead])
    await seed(payload)

    await generateSitemap(await reqOf(payload))

    const pagesXML = read(dir, 'pages-1.xml')
    expect(pagesXML).toContain(`<loc>${SITE}/en/about</loc>`)
    expect(pagesXML).toContain(`<loc>${SITE}/de/ueber-uns</loc>`)
    expect(pagesXML).not.toContain('draft')
  })

  it('serves the previous files after a failed run and removes what it stored', async () => {
    let fail = false
    const { dir, payload } = await start({
      ...base,
      sources: [
        custom('first', async function* ({ siteUrl }) {
          yield { url: `${siteUrl}/${fail ? 'new' : 'old'}` }
          yield { url: 'ftp://example.com/file' }
        }),
        custom('second', ({ siteUrl }) => {
          if (fail) throw new Error('source broke')
          return [{ url: `${siteUrl}/second` }]
        }),
      ],
    })
    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['first-1.xml', 'second-1.xml', 'sitemap.xml'])
    const served = await body(payload, '/sitemaps/first-1.xml')
    expect(served).toContain(`<loc>${SITE}/old</loc>`)
    expect(served).not.toContain('ftp:')
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).urls).toBe(4)

    fail = true
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('source broke')
    const status = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    expect(status.error).toBe('source broke')
    expect(status.errorAt).toBeTruthy()
    expect(status.urls).toBe(4)
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(3)
    expect(storedNames(dir)).toHaveLength(3)
    expect(await body(payload, '/sitemaps/first-1.xml')).toBe(served)
    expect(read(dir, 'first-1.xml')).toContain(`<loc>${SITE}/old</loc>`)
  })

  it('ignores files of a crashed run and removes them after the next run', async () => {
    const { dir, payload } = await start()
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    const served = await body(payload, '/sitemaps/pages-1.xml')
    const { run: crashed } = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    const data = Buffer.from('<urlset/>')
    await payload.create({
      collection: 'sitemap-files',
      data: { hash: 'crashed', kind: 'file', name: 'pages-1.xml', run: crashed + 1 },
      file: { data, mimetype: 'application/xml', name: 'pages-1.000000000000.xml', size: data.length },
      overrideAccess: true,
    })
    expect(await body(payload, '/sitemaps/pages-1.xml')).toBe(served)

    const remove = vi.spyOn(payload, 'delete').mockRejectedValueOnce(new Error('database down'))
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('could not delete the files of an earlier')
    remove.mockRestore()
    expect(await body(payload, '/sitemaps/pages-1.xml')).toBe(served)

    await generateSitemap(await reqOf(payload))
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).run).toBeGreaterThan(crashed + 1)
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(3)
    expect(storedNames(dir)).toHaveLength(3)
    expect(await body(payload, '/sitemaps/pages-1.xml')).toBe(served)
  })

  it('drops a run when another run takes over its expired lock and finishes first', async () => {
    let nested = false
    const { dir, payload } = await start({
      ...base,
      sources: [
        custom('first', ({ siteUrl }) => [{ url: `${siteUrl}/${nested ? 'outer' : 'first'}` }]),
        custom('second', async ({ req, siteUrl }) => {
          if (!nested) {
            nested = true
            await req.payload.update({
              collection: LOCKS_SLUG,
              data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
              overrideAccess: true,
              where: { key: { equals: 'run' } },
            })
            await generateSitemap(await reqOf(req.payload))
          }
          return [{ url: `${siteUrl}/second` }]
        }),
      ],
    })
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('another run finished first')
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBeFalsy()
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(3)
    expect(storedNames(dir)).toHaveLength(3)
    expect(read(dir, 'first-1.xml')).toContain(`<loc>${SITE}/outer</loc>`)
    for (const name of ['first-1.xml', 'second-1.xml']) {
      expect((await call(payload, `/sitemaps/${name}`)).status).toBe(200)
    }
    expect((await payload.find({ collection: LOCKS_SLUG, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('fails a run whose expired lock was taken over before it switches', async () => {
    let calls = 0
    let nested = false
    let taker: Promise<SitemapFile[]> | undefined
    let ready!: () => void
    let done!: () => void
    const takerStarted = new Promise<void>((resolve) => (ready = resolve))
    const outerDone = new Promise<void>((resolve) => (done = resolve))
    const { dir, payload } = await start({
      ...base,
      sources: [
        {
          type: 'custom',
          name: 'first',
          locales: ['en'],
          entries: async ({ siteUrl }) => {
            calls++
            if (calls === 2) {
              ready()
              await outerDone
            }
            return [{ url: `${siteUrl}/${calls === 1 ? 'outer' : 'first'}` }]
          },
        },
        {
          type: 'custom',
          name: 'second',
          locales: ['en'],
          entries: async ({ req, siteUrl }) => {
            if (!nested) {
              nested = true
              await req.payload.update({
                collection: LOCKS_SLUG,
                data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
                overrideAccess: true,
                where: { key: { equals: 'run' } },
              })
              taker = generateSitemap(await reqOf(req.payload))
              await takerStarted
            }
            return [{ url: `${siteUrl}/second` }]
          },
        },
      ],
    })
    const outer = generateSitemap(await reqOf(payload))
    await expect(outer).rejects.toThrow('the run lock expired and another run took it over')
    done()
    expect(names(await taker!)).toEqual(['first-1.xml', 'second-1.xml', 'sitemap.xml'])
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBeFalsy()
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(3)
    expect(storedNames(dir)).toHaveLength(3)
    expect(read(dir, 'first-1.xml')).toContain(`<loc>${SITE}/first</loc>`)
    for (const name of ['sitemap.xml', 'sitemaps/first-1.xml', 'sitemaps/second-1.xml']) {
      expect((await call(payload, `/${name}`)).status).toBe(200)
    }
    expect((await payload.find({ collection: LOCKS_SLUG, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('fills placeholders and images from every field shape', async () => {
    const shapes: Plugin = (config) => ({
      ...config,
      collections: [
        ...(config.collections ?? []),
        { slug: 'brands', access: { read: () => true }, fields: [{ name: 'slug', type: 'text' }] },
        {
          slug: 'products',
          access: { read: () => true },
          fields: [
            { name: 'sku', type: 'number' },
            { name: 'brand', type: 'relationship', relationTo: 'brands' },
            { name: 'vendor', type: 'relationship', relationTo: ['brands'] },
            { name: 'meta', type: 'group', fields: [{ name: 'handle', type: 'text' }] },
            {
              type: 'tabs',
              tabs: [
                { name: 'seo', fields: [{ name: 'path', type: 'text' }] },
                { label: 'Main', fields: [{ name: 'code', type: 'text' }] },
              ],
            },
            { name: 'photos', type: 'upload', hasMany: true, relationTo: 'media' },
            { name: 'assets', type: 'upload', hasMany: true, relationTo: ['media'] },
            {
              name: 'variants',
              type: 'array',
              fields: [
                { name: 'media', type: 'group', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
              ],
            },
            {
              name: 'layout',
              type: 'blocks',
              blocks: [{ slug: 'hero', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] }],
            },
          ],
        },
      ],
    })
    const source = {
      type: 'collection' as const,
      collection: 'products' as never,
      images: ['photos', 'assets', 'variants.media.image', 'layout.image'],
      locales: ['en'],
      url: '/:brand.slug/:vendor.slug/:meta.handle/:seo.path/:code/:{sku}.html',
    }
    const { dir, payload } = await start(
      {
        jobs: { regenerate: false },
        siteUrl: SITE,
        sources: [source, { ...source, name: 'selected', query: { select: { sku: true } } }],
      },
      {},
      [shapes],
    )
    const file = (name: string) => ({ data: Buffer.from(name), mimetype: 'text/plain', name, size: name.length })
    const upload = (name: string) =>
      payload.create({ collection: 'media', data: {}, file: file(`${name}.txt`), overrideAccess: true })
    const [h1, h2, p1, v1, b1] = await Promise.all(['h1', 'h2', 'p1', 'v1', 'b1'].map(upload))
    const brand = await payload.create({ collection: 'brands' as never, data: { slug: 'acme' }, overrideAccess: true })
    const product = (data: Record<string, unknown>) =>
      payload.create({ collection: 'products' as never, data, overrideAccess: true })
    await product({
      assets: [{ relationTo: 'media', value: p1!.id }],
      brand: brand.id,
      code: 'A 1',
      layout: [{ blockType: 'hero', image: b1!.id }],
      meta: { handle: 'gold-ring' },
      photos: [h1!.id, h2!.id],
      seo: { path: 'rings/gold' },
      sku: 7,
      variants: [{ media: { image: v1!.id } }],
      vendor: { relationTo: 'brands', value: brand.id },
    })
    await product({ code: 'B', meta: { handle: 'no-brand' }, seo: { path: 'x' }, sku: 8 })

    await generateSitemap(await reqOf(payload))

    for (const name of ['products-1.xml', 'selected-1.xml']) {
      const xml = read(dir, name)
      expect(xml.match(/<url>/g)).toHaveLength(1)
      expect(xml).not.toContain('no-brand')
      expect(xml).toContain(`<loc>${SITE}/acme/acme/gold-ring/rings/gold/A%201/7.html</loc>`)
      expect(xml.match(/<image:image>/g)).toHaveLength(5)
      for (const image of ['h1', 'h2', 'p1', 'v1', 'b1']) expect(xml).toContain(`${SERVER}/api/media/file/${image}`)
    }
  })

  it('builds URLs from patterns and reads upload images and the sitemap fields', async () => {
    const { dir, payload } = await start({
      jobs: { regenerate: false },
      siteUrl: SITE,
      sources: [
        { type: 'static', entries: [{ url: '/', priority: 1 }, { url: 'https://shop.example.com/' }] },
        {
          type: 'collection',
          collection: 'posts',
          changefreq: 'weekly',
          fields: true,
          images: ['cover', 'gallery.image', ({ doc }) => (doc.image ? [doc.image] : [])],
          locales: ['en'],
          url: '/blog/:category.slug/:slug',
          priority: ({ doc }) => (doc.featured ? 1 : 0.6),
        },
      ],
    })
    const file = (name: string) => ({ data: Buffer.from(name), mimetype: 'text/plain', name, size: name.length })
    const cover = await payload.create({ collection: 'media', data: {}, file: file('cover.txt'), overrideAccess: true })
    const extra = await payload.create({ collection: 'media', data: {}, file: file('extra.txt'), overrideAccess: true })
    const post = (slug: string, data: Record<string, unknown> = {}) =>
      payload.create({
        collection: 'posts',
        data: { category: { slug: 'news' }, slug, title: slug, ...data },
        overrideAccess: true,
      })
    await post('featured', {
      cover: cover.id,
      featured: true,
      gallery: [{ image: extra.id }, { image: cover.id }],
      image: `${SITE}/photo.jpg`,
    })
    await post('plain', { sitemapChangefreq: 'yearly', sitemapPriority: 0.2 })
    await post('hidden', { sitemapExclude: true })
    await post('no-category', { category: { slug: '' } })

    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['posts-1.xml', 'sitemap.xml', 'static-1.xml'])
    expect(read(dir, 'sitemap.xml').indexOf('static-1.xml')).toBeLessThan(
      read(dir, 'sitemap.xml').indexOf('posts-1.xml'),
    )

    const xml = read(dir, 'posts-1.xml')
    const entry = (slug: string) => xml.split('<url>').find((part) => part.includes(`/news/${slug}</loc>`))
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml).not.toContain('hidden')
    expect(xml).not.toContain('no-category')
    expect(xml).not.toContain('hreflang')
    expect(entry('featured')).toContain(`<loc>${SITE}/blog/news/featured</loc>`)
    expect(entry('featured')).toContain('<priority>1</priority>')
    expect(entry('featured')).toContain('<changefreq>weekly</changefreq>')
    expect(entry('featured')).toContain(`<image:loc>${SERVER}/api/media/file/cover-original.txt</image:loc>`)
    expect(entry('featured')).toContain(`<image:loc>${SERVER}/api/media/file/extra-original.txt</image:loc>`)
    expect(entry('featured')).toContain(`<image:loc>${SITE}/photo.jpg</image:loc>`)
    expect(entry('featured')?.match(/<image:image>/g)).toHaveLength(3)
    expect(entry('plain')).toContain('<priority>0.2</priority>')
    expect(entry('plain')).toContain('<changefreq>yearly</changefreq>')
    expect(entry('plain')).not.toContain('image:image')
  })

  it('inserts the sitemap fields into the SEO tab by path and reads them from there', async () => {
    const seo = seoPlugin({ collections: ['posts'], tabbedUI: true })
    const placed: Plugin = (config) => ({
      ...config,
      collections: config.collections?.map((collection) =>
        collection.slug === 'pages'
          ? {
              ...collection,
              fields: [
                ...collection.fields,
                { name: 'visibility', type: 'group', fields: sitemapFields({ exclude: true }) } as const,
              ],
            }
          : collection,
      ),
    })
    const { dir, payload } = await start(
      {
        jobs: { regenerate: false },
        siteUrl: SITE,
        sources: [
          {
            type: 'collection',
            collection: 'posts',
            fields: { changefreq: true, exclude: true, position: { after: 'meta.description' }, priority: true },
            locales: ['en'],
            query: { select: { title: true } },
            url: '/:slug',
          },
          { type: 'collection', collection: 'pages', locales: ['en'], url: '/pages/:slug' },
        ],
      },
      {},
      [seo, placed],
    )
    const paths = findFieldPaths(payload.collections.posts!.config.fields, () => true)
    expect(paths.indexOf('meta.sitemapExclude')).toBe(paths.indexOf('meta.description') + 1)
    const post = (slug: string, meta: Record<string, unknown>) =>
      payload.create({ collection: 'posts', data: { meta, slug, title: slug }, overrideAccess: true })
    await post('shown', { sitemapChangefreq: 'daily', sitemapPriority: 0.3 })
    await post('hidden', { sitemapExclude: true })
    await publish(payload, 'kept')
    await payload.create({
      collection: 'pages',
      data: { _status: 'published', slug: 'dropped', title: 'dropped', visibility: { sitemapExclude: true } },
      locale: 'en',
      overrideAccess: true,
    })
    await generateSitemap(await reqOf(payload))

    const xml = read(dir, 'posts-1.xml')
    expect(xml).toContain(`<loc>${SITE}/shown</loc>`)
    expect(xml).toContain('<changefreq>daily</changefreq>')
    expect(xml).toContain('<priority>0.3</priority>')
    expect(xml).not.toContain('hidden')
    const pagesXML = read(dir, 'pages-1.xml')
    expect(pagesXML).toContain(`<loc>${SITE}/pages/kept</loc>`)
    expect(pagesXML).not.toContain('dropped')
  })

  it('calls static entries and sources per locale and applies the query', async () => {
    const { dir, payload } = await start({
      jobs: { regenerate: false },
      siteUrl: SITE,
      sources: [
        { type: 'collection', collection: 'posts', url: '/:slug', query: { where: { featured: { equals: true } } } },
        { type: 'static', entries: ({ locale }) => [{ url: `/${locale}` }] },
        {
          type: 'custom',
          entries: ({ locale, siteUrl }) => [{ url: `${siteUrl}/${locale}/filters` }],
          locales: ['de'],
          name: 'filters',
        },
      ],
    })
    await payload.create({ collection: 'posts', data: { featured: true, slug: 'a', title: 'A' }, overrideAccess: true })
    await payload.create({ collection: 'posts', data: { slug: 'b', title: 'B' }, overrideAccess: true })
    await generateSitemap(await reqOf(payload))

    expect(read(dir, 'static-1.xml')).toContain(`<loc>${SITE}/en</loc>`)
    expect(read(dir, 'static-1.xml')).toContain(`<loc>${SITE}/de</loc>`)
    expect(read(dir, 'filters-1.xml')).toContain(`<loc>${SITE}/de/filters</loc>`)
    expect(read(dir, 'filters-1.xml')).not.toContain('/en/')
    expect(read(dir, 'posts-1.xml')).toContain(`<loc>${SITE}/a</loc>`)
    expect(read(dir, 'posts-1.xml')).not.toContain(`<loc>${SITE}/b</loc>`)
  })

  it('reads as an anonymous visitor unless query.overrideAccess is set', async () => {
    const restrict: Plugin = (config) => ({
      ...config,
      collections: config.collections?.map((collection) =>
        collection.slug === 'posts'
          ? { ...collection, access: { read: ({ req }) => (req.user ? true : { featured: { equals: true } }) } }
          : collection,
      ),
    })
    const { dir, payload } = await start(
      {
        jobs: { regenerate: false },
        siteUrl: SITE,
        sources: [{ type: 'collection', collection: 'posts', locales: ['en'] }],
      },
      {},
      [restrict],
    )
    const req = await userReq(payload)
    await payload.create({
      collection: 'posts',
      data: { featured: true, slug: 'public', title: 'P' },
      overrideAccess: true,
    })
    await payload.create({ collection: 'posts', data: { slug: 'members', title: 'M' }, overrideAccess: true })

    await generateSitemap(req)
    expect(read(dir, 'posts-1.xml')).toContain(`<loc>${SITE}/public</loc>`)
    expect(read(dir, 'posts-1.xml')).not.toContain('members')

    const options = payload.config.custom![PLUGIN_NAME] as {
      sources: { collection: { query: { overrideAccess: boolean } } }[]
    }
    options.sources[0]!.collection.query.overrideAccess = true
    await generateSitemap(req)
    expect(read(dir, 'posts-1.xml')).toContain(`<loc>${SITE}/members</loc>`)
  })

  it('uploads through a custom function and keeps only the registry in the files collection', async () => {
    const uploaded = new Map<string, string>()
    const upload = vi.fn(async ({ body: data, filename }: { body: Buffer; filename: string }) => {
      uploaded.set(filename, data.toString())
      return { url: `https://cdn.example.com/${filename}` }
    })
    const { payload } = await start({ ...base, storage: { collection: { slug: 'seo-files' }, upload } })
    await seed(payload)

    expect(payload.collections['sitemap-files']).toBeUndefined()
    expect(payload.collections['seo-files']?.config.upload).toBeFalsy()
    await generateSitemap(await reqOf(payload))
    expect([...uploaded.keys()].map(publicName).toSorted()).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    expect(upload).toHaveBeenCalledTimes(3)

    await generateSitemap(await reqOf(payload))
    expect(upload).toHaveBeenCalledTimes(3)

    const fetch = vi.fn(async (url: string) => {
      const text = uploaded.get(new URL(url).pathname.slice(1))
      return text === undefined ? new Response('missing', { status: 404 }) : new Response(text)
    })
    vi.stubGlobal('fetch', fetch)
    const response = await call(payload, '/sitemaps/posts-1.xml')
    expect(response.status).toBe(200)
    expect(publicName(new URL(fetch.mock.calls[0]![0]).pathname.slice(1))).toBe('posts-1.xml')
    expect(await response.text()).toContain(`<loc>${SITE}/en/blog/post-1</loc>`)
  })

  it('deletes files a run no longer writes through a custom function and logs its errors', async () => {
    const stored = new Set<string>()
    const upload = async ({ filename }: { filename: string }) => {
      stored.add(filename)
      return { url: `https://cdn.example.com/${filename}` }
    }
    const runs: unknown[] = []
    const remove = vi.fn(async ({ filename, req }: { filename: string; req: PayloadRequest; url: string }) => {
      const status = await req.payload.findGlobal({ slug: 'sitemap-status', overrideAccess: true, req })
      runs.push(status.run)
      if (publicName(filename) === 'posts-3.xml') throw new Error('bucket down')
      stored.delete(filename)
    })
    const { payload } = await start({ ...base, output: { maxUrlsPerFile: 2 }, storage: { delete: remove, upload } })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    expect(remove).not.toHaveBeenCalled()
    const error = vi.spyOn(payload.logger, 'error').mockImplementation(() => undefined)

    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { in: ['post-1', 'post-2'] } } })
    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    const removed = remove.mock.calls.map(([args]) => args)
    expect(removed.map(({ filename }) => publicName(filename)).toSorted()).toEqual([
      'posts-1.xml',
      'posts-2.xml',
      'posts-3.xml',
      'sitemap.xml',
    ])
    expect(removed.every(({ filename, url }) => url === `https://cdn.example.com/${filename}`)).toBe(true)
    const { run } = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    expect(runs).toEqual([run, run, run, run])
    expect([...stored].map(publicName).toSorted()).toEqual(['pages-1.xml', 'posts-1.xml', 'posts-3.xml', 'sitemap.xml'])
    const failed = removed.find(({ filename }) => publicName(filename) === 'posts-3.xml')!.filename
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: `sitemap: could not delete ${failed} through storage.delete` }),
    )
    expect((await call(payload, '/sitemaps/posts-2.xml')).status).toBe(404)
  })

  it('fails the run when a custom upload returns a relative URL without serverURL', async () => {
    const remove = vi.fn()
    const { payload } = await start(
      { ...base, storage: { delete: remove, upload: async ({ filename }) => ({ url: `/files/${filename}` }) } },
      { serverURL: '' },
    )
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('set serverURL')
    expect(remove).toHaveBeenCalledOnce()
    expect(await payload.count({ collection: 'sitemap-files', overrideAccess: true })).toEqual({ totalDocs: 0 })
  })

  it('names the file when a custom upload returns no URL', async () => {
    const { payload } = await start({ ...base, storage: { upload: async () => ({}) as never } })
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'sitemap: storage.upload must return { url } with a non-empty string for pages-1.xml',
    )
  })
})

describe('sort', () => {
  const sorted = (sort: string, extra: Record<string, unknown> = {}): SitemapPluginOptions => ({
    jobs: { regenerate: false },
    siteUrl: SITE,
    sources: [{ type: 'collection', collection: 'posts', locales: ['en'], query: { sort }, ...extra }],
  })
  const locs = (xml: string) => [...xml.matchAll(/<loc>(.+?)<\/loc>/g)].map((match) => match[1]!.slice(SITE.length + 1))
  const post = (payload: Payload, slug: string, data: Record<string, unknown> = {}) =>
    payload.create({ collection: 'posts', data: { slug, title: slug, ...data }, overrideAccess: true })
  const resort = async (payload: Payload, dir: string, sort: string) => {
    const options = payload.config.custom![PLUGIN_NAME] as {
      sources: { collection: { query: { sort: string } } }[]
    }
    options.sources[0]!.collection.query.sort = sort
    await generateSitemap(await reqOf(payload))
    return locs(read(dir, 'posts-1.xml'))
  }

  it('orders by a date or a text field in both directions with empty values last', async () => {
    const { dir, payload } = await start(sorted('publishedAt'))
    await post(payload, 'b', { image: 'm', publishedAt: '2026-02-01T00:00:00.000Z' })
    await post(payload, 'none')
    await post(payload, 'a', { image: 'z', publishedAt: '2026-01-01T00:00:00.000Z' })
    await post(payload, 'c', { image: 'a', publishedAt: '2026-03-01T00:00:00.000Z' })
    await post(payload, 'blank', { image: null, publishedAt: null })
    const run = (sort: string) => resort(payload, dir, sort)

    expect(await run('publishedAt')).toEqual(['a', 'b', 'c', 'none', 'blank'])
    expect(await run('-publishedAt')).toEqual(['c', 'b', 'a', 'none', 'blank'])
    expect(await run('image')).toEqual(['c', 'b', 'a', 'none', 'blank'])
    expect(await run('-image')).toEqual(['a', 'b', 'c', 'none', 'blank'])
    expect(await run('-id')).toEqual(['blank', 'c', 'a', 'none', 'b'])
    expect(await run('-featured')).toHaveLength(5)
  })

  it('keeps every document once past the page size by id and by a field with ties and empty values', async () => {
    const { dir, payload } = await start(sorted('id', { locales: undefined, url: '/:locale/:slug' }))
    for (let index = 0; index < 260; index++) {
      await post(payload, `same${index}`, { publishedAt: '2026-01-01T00:00:00.000Z' })
    }
    await post(payload, 'newest', { publishedAt: '2026-06-01T00:00:00.000Z' })
    await post(payload, 'oldest', { publishedAt: '2025-01-01T00:00:00.000Z' })
    for (let index = 0; index < 3; index++) await post(payload, `none${index}`)

    const byId = await resort(payload, dir, 'id')
    expect(byId).toHaveLength(530)
    expect(new Set(byId).size).toBe(530)
    expect(byId).toContain('de/none2')
    expect(read(dir, 'posts-1.xml')).toContain(`hreflang="de" href="${SITE}/de/same0"`)

    const order = (await resort(payload, dir, '-publishedAt'))
      .filter((loc) => loc.startsWith('en/'))
      .map((loc) => loc.slice(3))
    expect(order).toHaveLength(265)
    expect(new Set(order).size).toBe(265)
    expect(order[0]).toBe('newest')
    expect(order[261]).toBe('oldest')
    expect(order.slice(262)).toEqual(['none0', 'none1', 'none2'])
  })

  it('fails to start for a sort field it cannot page by', async () => {
    const fails = (sort: string, message: string) => expect(bootFails(sorted(sort))).rejects.toThrow(message)
    await fails('nope', 'sources[0].query.sort: "nope" is not a top-level field of posts')
    await fails('-title', 'sources[0].query.sort: "title" is localized')
    await fails('author', 'sources[0].query.sort: "author" is a relationship field')
    await fails('category', 'sources[0].query.sort: "category" is a group field')
  })
})

describe('filename', () => {
  const named = (filename: NonNullable<SitemapPluginOptions['output']>['filename']): SitemapPluginOptions => ({
    ...base,
    output: { filename },
  })

  it('writes files into folders and serves them by their nested path', async () => {
    const { dir, payload } = await start(
      named(({ kind, part, source }) => (kind === 'index' ? 'maps/index.xml' : `maps/${source}/part-${part}.xml`)),
    )
    await seed(payload)

    expect(names(await generateSitemap(await reqOf(payload)))).toEqual([
      'maps/index.xml',
      'maps/pages/part-1.xml',
      'maps/posts/part-1.xml',
    ])
    expect(storedNames(dir).map(publicName).toSorted()).toEqual([
      'maps_index.xml',
      'maps_pages_part-1.xml',
      'maps_posts_part-1.xml',
    ])
    expect(read(dir, 'maps_index.xml')).toContain(`<loc>${SITE}/sitemaps/maps/pages/part-1.xml</loc>`)
    expect(await body(payload, '/sitemap.xml')).toBe(read(dir, 'maps_index.xml'))
    expect(await body(payload, '/sitemaps/maps/posts/part-1.xml')).toBe(read(dir, 'maps_posts_part-1.xml'))
    expect((await call(payload, '/sitemaps/maps/posts/part-9.xml')).status).toBe(404)
    expect((await call(payload, '/sitemaps/maps/../index.xml')).status).toBe(404)
  })

  it('keeps folders in the names a custom upload gets', async () => {
    const upload = vi.fn(async ({ filename }: { filename: string }) => ({ url: `https://cdn.example.com/${filename}` }))
    const { payload } = await start({
      ...named(({ kind, part, source }) => (kind === 'index' ? 'sitemap.xml' : `parts/${source}-${part}.xml`)),
      storage: { upload },
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    expect(upload.mock.calls.map(([{ filename }]) => publicName(filename)).toSorted()).toEqual([
      'parts/pages-1.xml',
      'parts/posts-1.xml',
      'sitemap.xml',
    ])
  })

  it('rejects files outside the folder of their index, invalid names and collisions', async () => {
    const { payload } = await start(
      named(({ kind, source }) => (kind === 'index' ? 'en/sitemap.xml' : `${source}.xml`)),
    )
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'output.filename: pages.xml must be in the folder of its index en/sitemap.xml',
    )
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(0)

    const options = payload.config.custom![PLUGIN_NAME] as {
      output: { filename: (args: { kind: string; part?: number }) => string }
    }
    options.output.filename = ({ kind }) => (kind === 'index' ? 'sitemap.xml' : 'all.xml')
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'two sitemap files can get the name all.xml, rename a source or change output.filename',
    )
    options.output.filename = ({ kind, part }) => (kind === 'index' ? 'sitemap.xml' : `posts-${part! > 1 ? 1 : 2}.xml`)
    const split = payload.config.custom![PLUGIN_NAME] as { output: { maxUrls: number } }
    split.output.maxUrls = 2
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('two sitemap files can get the name')
    options.output.filename = () => '../x.xml'
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('output.filename returned "../x.xml"')
    expect((await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs).toBe(0)
  })
})
