import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import type { CollectionConfig, Payload, Plugin } from 'payload'
import { afterEach, describe, expect, it } from 'vitest'

import type { SitemapPluginOptions, SitemapSource } from '@/index.js'
import { generateSitemap } from '@/index.js'
import { sitemapFiles } from '@/server/status/sitemapFiles.js'
import { PLUGIN_NAME } from '@/shared/constants.js'

import { publicName, read, storedNames } from '../helpers/int/files.js'
import { body, bootFails, call, cleanup, names, pendingJobs, reqOf, start } from '../helpers/int/sitemap.js'

const tenantsCollection: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'domain', type: 'text', required: true },
  ],
}

const namedTenants: CollectionConfig = {
  ...tenantsCollection,
  fields: [{ name: 'id', type: 'text', required: true }, ...tenantsCollection.fields],
}

const draftTenants: CollectionConfig = {
  ...tenantsCollection,
  fields: [...tenantsCollection.fields, { name: 'active', type: 'checkbox', defaultValue: true }],
  versions: { drafts: true },
}

const addTenants =
  (collection: CollectionConfig): Plugin =>
  (config) => ({ ...config, collections: [...(config.collections ?? []), collection] })

const about: SitemapSource = { type: 'static', entries: ({ tenant }) => [{ url: `/about-${String(tenant?.name)}` }] }
const pages: SitemapSource = { type: 'collection', collection: 'pages', locales: ['en'], url: '/:slug' }
const posts: SitemapSource = { type: 'collection', collection: 'posts', locales: ['en'], url: '/blog/:slug' }
const shop: SitemapSource = {
  type: 'custom',
  entries: ({ siteUrl, tenant }) => [{ url: `${siteUrl}/shop/${String(tenant?.name)}` }],
  locales: ['en'],
  name: 'shop',
}

const base: SitemapPluginOptions = {
  jobs: { regenerate: false },
  siteUrl: ({ tenant }) => `https://${String(tenant?.domain)}`,
  sources: [about, pages, posts, shop],
  tenants: true,
}

afterEach(cleanup)

const plugins = (collection = tenantsCollection) => [
  addTenants(collection),
  multiTenantPlugin({ collections: { pages: {} } }),
]

const seed = async (payload: Payload) => {
  const gold = await payload.create({
    collection: 'tenants',
    data: { domain: 'gold.example.com', name: 'gold' },
    overrideAccess: true,
  })
  const blue = await payload.create({
    collection: 'tenants',
    data: { domain: 'blue.example.com', name: 'blue' },
    overrideAccess: true,
  })
  for (const [tenant, slug] of [
    [gold, 'gold-home'],
    [gold, 'gold-team'],
    [blue, 'blue-home'],
  ] as const) {
    await payload.create({
      collection: 'pages',
      data: { _status: 'published', slug, tenant: tenant.id, title: slug },
      locale: 'en',
      overrideAccess: true,
    })
  }
  await payload.create({
    collection: 'posts',
    data: { slug: 'shared', title: 'Shared' },
    locale: 'en',
    overrideAccess: true,
  })
  return { blue: String(blue.id), gold: String(gold.id) }
}

describe('tenants', () => {
  it('writes, serves and lists one index per tenant with only that tenant documents', async () => {
    const { dir, payload } = await start(base, {}, plugins())
    const { blue, gold } = await seed(payload)
    const req = await reqOf(payload)

    const files = await generateSitemap(req)
    expect(names(files)).toEqual(
      [
        `${blue}-pages-1.xml`,
        `${blue}-posts-1.xml`,
        `${blue}-shop-1.xml`,
        `${blue}-static-1.xml`,
        `${gold}-pages-1.xml`,
        `${gold}-posts-1.xml`,
        `${gold}-shop-1.xml`,
        `${gold}-static-1.xml`,
        `sitemap-${blue}.xml`,
        `sitemap-${gold}.xml`,
      ].toSorted(),
    )
    expect(files.find(({ filename }) => filename === `sitemap-${gold}.xml`)?.tenant).toBe(gold)

    const goldPages = read(dir, `${gold}-pages-1.xml`)
    expect(goldPages).toContain('<loc>https://gold.example.com/gold-home</loc>')
    expect(goldPages).toContain('<loc>https://gold.example.com/gold-team</loc>')
    expect(goldPages).not.toContain('blue-home')
    const bluePages = read(dir, `${blue}-pages-1.xml`)
    expect(bluePages).toContain('<loc>https://blue.example.com/blue-home</loc>')
    expect(bluePages).not.toContain('gold')

    expect(read(dir, `${gold}-posts-1.xml`)).toContain('<loc>https://gold.example.com/blog/shared</loc>')
    expect(read(dir, `${blue}-posts-1.xml`)).toContain('<loc>https://blue.example.com/blog/shared</loc>')
    expect(read(dir, `${gold}-static-1.xml`)).toContain('<loc>https://gold.example.com/about-gold</loc>')
    expect(read(dir, `${blue}-shop-1.xml`)).toContain('<loc>https://blue.example.com/shop/blue</loc>')
    expect(read(dir, `sitemap-${gold}.xml`)).toContain(
      `<loc>https://gold.example.com/sitemaps/${gold}-pages-1.xml</loc>`,
    )
    expect(read(dir, `sitemap-${gold}.xml`)).not.toContain(`/sitemaps/${blue}-`)

    const response = await call(payload, `/sitemap.xml?tenant=${blue}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(read(dir, `sitemap-${blue}.xml`))
    expect((await call(payload, '/sitemap.xml')).status).toBe(404)
    expect((await call(payload, '/sitemap.xml?tenant=nope')).status).toBe(404)
    expect(await body(payload, `/sitemaps/${blue}-pages-1.xml`)).toBe(read(dir, `${blue}-pages-1.xml`))
    expect((await call(payload, `/sitemaps/${blue}-pages-1.xml?tenant=${blue}`)).status).toBe(200)
    expect((await call(payload, `/sitemaps/${blue}-pages-1.xml?tenant=${gold}`)).status).toBe(404)

    const options = payload.config.custom?.[PLUGIN_NAME]
    const all = await sitemapFiles(req, options, {})
    expect(all.totalDocs).toBe(10)
    expect(all.tenant).toBeUndefined()
    expect(all.tenants).toEqual([
      { id: blue, title: 'blue' },
      { id: gold, title: 'gold' },
    ])
    const listed = await sitemapFiles(req, options, { tenant: gold })
    expect(listed.totalDocs).toBe(5)
    expect(listed.tenant).toBe(gold)
    expect(listed.docs.every((file) => file.tenant === gold)).toBe(true)
    expect(listed.docs[0]).toMatchObject({ filename: `sitemap-${gold}.xml`, kind: 'index' })
  })

  it('splits every tenant by locale and passes the tenant to fileUrl', async () => {
    const { dir, payload } = await start(
      {
        ...base,
        output: {
          fileUrl: ({ filename, siteUrl, tenant }) => `${siteUrl}/maps/${String(tenant?.name)}/${filename}`,
          splitLocales: true,
        },
        siteUrl: ({ locale, tenant }) => `https://${String(locale)}.${String(tenant?.domain)}`,
        sources: [{ type: 'collection', collection: 'pages', locales: ['en'], url: '/:locale/:slug' }],
      },
      {},
      plugins(),
    )
    const { blue, gold } = await seed(payload)

    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(
      [
        `${blue}-en-pages-1.xml`,
        `${gold}-en-pages-1.xml`,
        `sitemap-${blue}-en.xml`,
        `sitemap-${gold}-en.xml`,
      ].toSorted(),
    )
    expect(await body(payload, `/sitemap.xml?tenant=${gold}&locale=en`)).toBe(read(dir, `sitemap-${gold}-en.xml`))
    expect(read(dir, `sitemap-${gold}-en.xml`)).toContain(
      `<loc>https://en.gold.example.com/maps/gold/${gold}-en-pages-1.xml</loc>`,
    )
  })

  it('removes the files of a deleted tenant', async () => {
    const { dir, payload } = await start(base, {}, plugins())
    const { blue, gold } = await seed(payload)
    const req = await reqOf(payload)
    await generateSitemap(req)

    await payload.delete({ collection: 'pages', overrideAccess: true, where: { tenant: { equals: blue } } })
    await payload.delete({ collection: 'tenants', id: blue, overrideAccess: true })
    const files = await generateSitemap(req)

    expect(names(files).some((name) => name.includes(blue))).toBe(false)
    expect(names(files)).toContain(`sitemap-${gold}.xml`)
    expect(
      storedNames(dir)
        .map(publicName)
        .some((name) => name.includes(blue)),
    ).toBe(false)
  })

  it('skips draft tenants and tenants left out by where', async () => {
    const { payload } = await start(
      { ...base, sources: [pages, posts], tenants: { where: { active: { equals: true } } } },
      {},
      plugins(draftTenants),
    )
    const tenant = (name: string, data: Record<string, unknown>) =>
      payload.create({
        collection: 'tenants',
        data: { domain: `${name}.example.com`, name, ...data },
        overrideAccess: true,
      })
    const live = await tenant('live', { _status: 'published' })
    await tenant('draft', { _status: 'draft' })
    await tenant('closed', { _status: 'published', active: false })
    await payload.create({
      collection: 'pages',
      data: { _status: 'published', slug: 'home', tenant: live.id, title: 'Home' },
      locale: 'en',
      overrideAccess: true,
    })

    const files = await generateSitemap(await reqOf(payload))
    expect(names(files)).toEqual([`${String(live.id)}-pages-1.xml`, `sitemap-${String(live.id)}.xml`])
  })

  it('fails on a tenant id that cannot be a file name', async () => {
    const { payload } = await start(base, {}, plugins(namedTenants))
    await payload.create({
      collection: 'tenants',
      data: { id: 'gold coast', domain: 'gold.example.com', name: 'gold' },
      overrideAccess: true,
    })

    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'sitemap: tenant id "gold coast" may only use letters',
    )
  })

  it('fails when an index and a child file get the same name', async () => {
    const { payload } = await start(
      { ...base, sources: [pages, { type: 'custom', entries: () => [{ url: '/x' }], name: 'x' }] },
      {},
      plugins(namedTenants),
    )
    for (const id of ['sitemap', 'x-1']) {
      await payload.create({
        collection: 'tenants',
        data: { id, domain: `${id}.example.com`, name: id },
        overrideAccess: true,
      })
    }

    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'sitemap: two sitemap files can get the name sitemap-x-1.xml',
    )
  })

  it('fails to start when no listed collection has the tenant field', async () => {
    await expect(bootFails({ ...base, tenants: { field: 'site' } }, plugins())).rejects.toThrow(
      'sitemap: tenants.field "site" is not a relationship to tenants in any listed collection',
    )
  })

  it('queues a run when a tenant changes', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 60_000 } } }, {}, plugins())
    await payload.create({
      collection: 'tenants',
      data: { domain: 'red.example.com', name: 'red' },
      overrideAccess: true,
    })
    expect(await pendingJobs(payload)).toHaveLength(1)
  })
})
