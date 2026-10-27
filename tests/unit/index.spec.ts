import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import type { SitemapPluginOptions } from '@/index.js'
import { sitemap } from '@/index.js'
import { sitemapFieldPaths } from '@/server/fields/sitemapFieldPaths.js'

describe('sitemap plugin', () => {
  const base = { collections: [], secret: 'x' } as unknown as Config
  const apply = (options: SitemapPluginOptions, config = base) => sitemap(options)(config) as Config

  it('registers the dashboard widget without touching the default layout', () => {
    const defaultLayout = [{ widgetSlug: 'collections', width: 'full' as const }]
    const config = apply(
      { siteUrl: 'https://example.com' },
      { ...base, admin: { dashboard: { defaultLayout, widgets: [] } } },
    )
    const widget = config.admin?.dashboard?.widgets.find(({ slug }) => slug === 'sitemap')
    expect(widget).toMatchObject({
      Component: '@seshuk/payload-plugin-sitemap/rsc#SitemapWidget',
      maxWidth: 'full',
      minWidth: 'medium',
    })
    const label = widget?.label as Record<string, string>
    expect(label.en).toBe('Sitemap')
    expect(label.ru).toBe('Карта сайта')
    expect(config.admin?.dashboard?.defaultLayout).toBe(defaultLayout)
    expect(config.admin?.components?.afterDashboard).toBeUndefined()
  })

  it('registers the sitemap view and nav link by default', () => {
    const config = apply(
      { siteUrl: 'https://example.com' },
      { ...base, admin: { components: { afterNavLinks: ['./Own#Link'], views: { own: { Component: './Own' } } } } },
    )
    expect(config.admin?.components?.views).toEqual({
      own: { Component: './Own' },
      sitemap: {
        Component: '@seshuk/payload-plugin-sitemap/rsc#SitemapView',
        exact: true,
        meta: { title: 'Sitemap' },
        path: '/sitemap',
      },
    })
    expect(config.admin?.components?.afterNavLinks).toEqual([
      './Own#Link',
      '@seshuk/payload-plugin-sitemap/rsc#SitemapNavLink',
    ])
  })

  it('leaves the view, nav link and widget out when turned off', () => {
    const config = apply({ admin: { view: false, widget: false }, siteUrl: 'https://example.com' })
    expect(config.admin?.dashboard).toBeUndefined()
    expect(config.admin?.components).toBeUndefined()
  })

  it('runs the task exclusive and retries it with backoff', () => {
    const task = apply({ siteUrl: 'https://example.com' }).jobs?.tasks?.[0]
    expect(task?.concurrency).toMatchObject({ exclusive: true })
    expect(task?.retries).toEqual({ attempts: 5, backoff: { type: 'exponential', delay: 30_000 } })
  })

  it('keeps the schema and a no-op task when not enabled', async () => {
    const pages = { slug: 'pages', fields: [{ name: 'slug', type: 'text' }] }
    const config = apply(
      {
        enabled: false,
        jobs: { schedule: '0 3 * * *' },
        siteUrl: 'https://example.com',
        sources: [{ type: 'collection', collection: 'pages' }],
      },
      { ...base, collections: [pages] } as Config,
    )
    expect(config.collections?.map(({ slug }) => slug)).toEqual(['pages', 'sitemap-files', 'sitemap-locks'])
    expect(config.collections?.[0]?.hooks).toBeUndefined()
    expect(config.globals?.map(({ slug }) => slug)).toEqual(['sitemap-status'])
    expect(config.endpoints).toBeUndefined()
    expect(config.admin).toBeUndefined()
    expect(config.onInit).toBeUndefined()
    const task = config.jobs?.tasks?.[0]
    expect(task).toMatchObject({ slug: 'sitemap-generate' })
    expect(task?.schedule).toBeUndefined()
    const handler = task?.handler as (args: { req: unknown }) => Promise<unknown>
    expect(await handler({ req: {} })).toEqual({ output: {} })
    expect(apply({ enabled: false, jobs: false, siteUrl: 'https://example.com' }).jobs).toBeUndefined()
  })

  it('adds no task and no hooks without jobs', () => {
    const pages = { slug: 'pages', fields: [{ name: 'slug', type: 'text' }] }
    const config = apply(
      { jobs: false, siteUrl: 'https://example.com', sources: [{ type: 'collection', collection: 'pages' }] },
      { ...base, collections: [pages] } as Config,
    )
    expect(config.jobs).toBeUndefined()
    expect(config.collections?.find(({ slug }) => slug === 'pages')?.hooks).toBeUndefined()
    expect(config.endpoints?.map(({ path }) => path)).toContain('/sitemap/generate')
  })

  describe('enqueue', () => {
    const posts = { slug: 'posts', fields: [{ name: 'slug', type: 'text' }] }
    const withEnqueue = (jobs: Record<string, unknown> = {}, options = {}) => {
      const config = apply(
        {
          jobs: { enqueue: () => 'job', regenerate: { delay: 5 }, ...jobs },
          siteUrl: 'https://example.com',
          sources: [{ type: 'collection', collection: 'posts' }],
          ...options,
        },
        { ...base, collections: [posts] } as Config,
      )
      const hook = config.collections?.find(({ slug }) => slug === 'posts')?.hooks?.afterChange?.[0]
      const generate = config.endpoints?.find(({ path }) => path === '/sitemap/generate')
      return { config, generate, hook }
    }

    it('adds no task but keeps the hooks and the generate endpoint', () => {
      const { config, generate, hook } = withEnqueue()
      expect(config.jobs).toBeUndefined()
      expect(hook).toBeDefined()
      expect(generate).toBeDefined()
    })

    it('adds no hooks with regenerate false', () => {
      const { generate, hook } = withEnqueue({ regenerate: false })
      expect(hook).toBeUndefined()
      expect(generate).toBeDefined()
    })

    it('adds no task, hooks or endpoints when not enabled', () => {
      const { config, generate, hook } = withEnqueue({}, { enabled: false })
      expect(config.jobs).toBeUndefined()
      expect(hook).toBeUndefined()
      expect(generate).toBeUndefined()
    })
  })

  it('leaves the file or generate endpoints out when turned off', () => {
    const paths = (endpoints: { files?: boolean; generate?: boolean }) =>
      apply({ endpoints, siteUrl: 'https://example.com' }).endpoints?.map(({ path }) => path)
    expect(paths({ generate: false })).toEqual([
      '/sitemap.xml',
      '/sitemaps/:filename+',
      '/sitemap/status',
      '/sitemap/files',
    ])
    expect(paths({ files: false })).toEqual(['/sitemap/status', '/sitemap/files', '/sitemap/generate'])
  })

  it('keeps only the file list in the files collection with storage false', () => {
    const files = apply({
      output: { fileUrl: ({ filename }) => `https://cdn.example.com/${filename}` },
      publish: { put: async () => {} },
      siteUrl: 'https://example.com',
      storage: false,
    }).collections?.find(({ slug }) => slug === 'sitemap-files')
    expect(files?.upload).toBe(false)
    expect(files?.fields.map((field) => ('name' in field ? field.name : '')).slice(-2)).toEqual(['filename', 'url'])
  })

  it('adds the sitemap fields and the regenerate hooks to a source collection', () => {
    const posts = { slug: 'posts', fields: [{ name: 'slug', type: 'text' }] }
    const config = apply(
      {
        jobs: {},
        siteUrl: 'https://example.com',
        sources: [{ type: 'collection', collection: 'posts', fields: true }],
      },
      { ...base, collections: [posts] } as Config,
    )
    const collection = config.collections?.find(({ slug }) => slug === 'posts')
    expect(sitemapFieldPaths(collection?.fields ?? []).exclude).toBe('sitemapExclude')
    expect(collection?.hooks?.afterChange).toHaveLength(1)
  })

  it('keeps the locks collection hidden and closed', () => {
    const locks = apply({ siteUrl: 'https://example.com' }).collections?.find(({ slug }) => slug === 'sitemap-locks')
    expect(locks?.admin).toEqual({ hidden: true })
    expect(locks?.versions).toBe(false)
    for (const operation of ['create', 'delete', 'read', 'update'] as const) {
      expect(locks?.access?.[operation]?.({} as never)).toBe(false)
    }
    expect(locks?.fields).toEqual([
      { name: 'key', type: 'text', index: true, required: true, unique: true },
      { name: 'expiresAt', type: 'date' },
      { name: 'owner', type: 'text' },
    ])
  })

  it('applies storage.collection to the files collection', () => {
    const config = apply({
      siteUrl: 'https://example.com',
      storage: {
        collection: {
          slug: 'seo-files',
          admin: { hidden: false },
          fields: ({ defaultFields }) => [...defaultFields, { name: 'note', type: 'text' }],
          upload: { staticDir: 'files' },
        },
      },
    })
    const files = config.collections?.find(({ slug }) => slug === 'seo-files')
    expect(files?.admin).toEqual({ hidden: false })
    expect(files?.upload).toEqual({ staticDir: 'files' })
    expect(files?.fields.map((field) => ('name' in field ? field.name : ''))).toEqual([
      'name',
      'kind',
      'source',
      'urls',
      'locale',
      'size',
      'lastmod',
      'run',
      'hash',
      'published',
      'note',
    ])
    expect(files?.access?.update?.({} as never)).toBe(false)
  })

  it('describes every endpoint for OpenAPI', () => {
    const config = apply({ siteUrl: 'https://example.com' })
    expect(config.endpoints?.map(({ custom, method, path }) => [method, path, custom?.openapi?.summary])).toEqual([
      ['get', '/sitemap.xml', 'Get the sitemap index'],
      ['get', '/sitemaps/:filename+', 'Get a child sitemap'],
      ['get', '/sitemap/status', 'Get the sitemap status'],
      ['get', '/sitemap/files', 'List the sitemap files'],
      ['post', '/sitemap/generate', 'Start a sitemap run'],
    ])
  })

  it('adds the tenant field to the files collection with tenants', () => {
    const config = apply({ siteUrl: 'https://example.com', tenants: true })
    const files = config.collections?.find(({ slug }) => slug === 'sitemap-files')
    const names = files?.fields.map((field) => ('name' in field ? field.name : '')) ?? []
    expect(names.indexOf('tenant')).toBe(names.indexOf('locale') + 1)
  })

  it('rejects locales that are not configured', () => {
    const localized = { ...base, localization: { defaultLocale: 'en', locales: ['en', { code: 'de', label: 'DE' }] } }
    const pages = (source: Record<string, unknown>): SitemapPluginOptions => ({
      siteUrl: 'https://example.com',
      sources: [{ type: 'collection', collection: 'pages', ...source }],
    })
    expect(() => apply(pages({ locales: ['de'] }), localized as Config)).not.toThrow()
    expect(() => apply(pages({ locales: ['fr'] }), localized as Config)).toThrow(
      'sources[0].locales: "fr" is not a configured locale',
    )
    expect(() =>
      apply({
        siteUrl: 'https://example.com',
        sources: [{ entries: () => [], locales: ['en'], name: 'a', type: 'custom' }],
      }),
    ).toThrow('sources[0].locales: "en" is not a configured locale')
    expect(() => apply(pages({ url: '/:locale/:slug' }))).toThrow(
      'sources[0].url uses :locale, but localization is off',
    )
    expect(() => apply(pages({ url: '/:locale/:slug' }), localized as Config)).not.toThrow()
  })
})
