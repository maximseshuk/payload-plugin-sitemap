import { reportTelemetry } from '@seshuk/payload-plugin-tooling/telemetry'
import type { Config, Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { sitemap } from '@/index.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'
import { buildFeatures } from '@/server/telemetry.js'
import type { SitemapPluginOptions } from '@/shared/types/index.js'

vi.mock('@seshuk/payload-plugin-tooling/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@seshuk/payload-plugin-tooling/telemetry')>()),
  reportTelemetry: vi.fn(async () => {}),
}))

const SITE = 'https://example.com'

const features = (options: Omit<SitemapPluginOptions, 'siteUrl'> & { siteUrl?: SitemapPluginOptions['siteUrl'] }) => {
  const full = { siteUrl: SITE, ...options }
  return buildFeatures({ options: full, resolved: resolveOptions(full) })
}

describe('buildFeatures', () => {
  it('sets only the defaults for the minimal options', () => {
    expect(features({ sources: [{ type: 'collection', collection: 'posts' }] })).toEqual({
      adminAccess: false,
      adminView: true,
      adminWidget: true,
      collectionFields: false,
      collectionImages: false,
      collectionQuery: false,
      collectionSort: false,
      collectionUrlFunction: false,
      customSources: false,
      endpointsFiles: true,
      endpointsGenerate: true,
      jobs: true,
      jobsEnqueue: false,
      jobsRegenerate: true,
      jobsRegenerateTriggers: false,
      jobsSchedule: false,
      outputFilename: false,
      outputFileUrl: false,
      outputHreflang: true,
      outputSplitLocales: false,
      publish: false,
      publishDelete: false,
      publishOnly: false,
      siteUrlFunction: false,
      sourceKeepOnError: false,
      staticSources: false,
      storageCollection: false,
      storageDelete: false,
      storageUpload: false,
      tenants: false,
    })
  })

  it('sets collection, source and output features from the options', () => {
    const result = features({
      jobs: { regenerate: { globals: ['settings'] }, schedule: '0 3 * * *' },
      output: {
        filename: ({ kind }) => `${kind}.xml`,
        fileUrl: ({ filename }) => `/${filename}`,
        hreflang: false,
        splitLocales: true,
      },
      publish: { delete: async () => {}, put: async () => {} },
      siteUrl: ({ locale }) => `https://${locale}.example.com`,
      sources: [
        { type: 'static', entries: [{ url: '/' }] },
        { type: 'collection', collection: 'pages', fields: { exclude: true }, url: ({ doc }) => `/${doc.slug}` },
        { type: 'collection', collection: 'posts', images: ['cover'], query: { sort: '-id' }, url: '/blog/:slug' },
        { type: 'custom', entries: () => [], name: 'filters' },
      ],
      tenants: true,
    })

    expect(result).toMatchObject({
      collectionFields: true,
      collectionImages: true,
      collectionQuery: true,
      collectionSort: true,
      collectionUrlFunction: true,
      customSources: true,
      jobsRegenerate: true,
      jobsRegenerateTriggers: true,
      jobsSchedule: true,
      outputFilename: true,
      outputFileUrl: true,
      outputHreflang: false,
      outputSplitLocales: true,
      publish: true,
      publishDelete: true,
      siteUrlFunction: true,
      staticSources: true,
      tenants: true,
    })
  })

  it('sets storage, admin and jobs features from the options', () => {
    const upload = async () => ({ url: 'https://cdn.example.com/a.xml' })
    expect(
      features({
        admin: { access: () => true, view: false, widget: false },
        jobs: { regenerate: false },
        storage: { delete: async () => {}, upload },
      }),
    ).toMatchObject({
      adminAccess: true,
      adminView: false,
      adminWidget: false,
      jobs: true,
      jobsRegenerate: false,
      jobsRegenerateTriggers: false,
      storageCollection: false,
      storageDelete: true,
      storageUpload: true,
    })
    expect(features({ storage: { collection: { slug: 'seo-files' } } })).toMatchObject({
      storageCollection: true,
      storageUpload: false,
    })
    expect(features({ jobs: false })).toMatchObject({ jobs: false, jobsRegenerate: false, jobsSchedule: false })
  })

  it('reports enqueue, endpoints, publish only and kept sources', () => {
    expect(
      features({
        endpoints: { files: false, generate: false },
        jobs: { enqueue: () => 'job' },
        output: { fileUrl: ({ filename }) => `https://cdn.example.com/${filename}` },
        publish: { put: async () => {} },
        sources: [{ type: 'custom', entries: () => [], name: 'filters', onError: 'keep' }],
        storage: false,
      }),
    ).toMatchObject({
      endpointsFiles: false,
      endpointsGenerate: false,
      jobs: true,
      jobsEnqueue: true,
      publishOnly: true,
      sourceKeepOnError: true,
      storageCollection: false,
    })
  })
})

describe('telemetry onInit', () => {
  const payload = { collections: {}, config: {}, globals: { config: [] } } as unknown as Payload
  const init = (options: Partial<SitemapPluginOptions> = {}, onInit?: Config['onInit']) =>
    (
      sitemap({ siteUrl: SITE, ...options })({ collections: [], onInit, secret: 'x' } as unknown as Config) as Config
    ).onInit?.(payload)

  it('reports after the existing onInit resolves', async () => {
    const order: string[] = []
    const onInit = vi.fn(async () => {
      await Promise.resolve()
      order.push('onInit')
    })
    vi.mocked(reportTelemetry).mockImplementationOnce(async () => {
      order.push('telemetry')
    })

    await init({}, onInit)

    expect(onInit).toHaveBeenCalledWith(payload)
    expect(order).toEqual(['onInit', 'telemetry'])
    expect(reportTelemetry).toHaveBeenLastCalledWith(expect.objectContaining({ payload }))
  })

  it.each([
    [{}, undefined],
    [{ telemetry: false }, false],
    [
      { telemetry: { url: 'https://telemetry.example.com/v1/collect' } },
      { url: 'https://telemetry.example.com/v1/collect' },
    ],
  ] as const)('passes the opt-out env and option %j to the tooling', async (options, option) => {
    await init(options)

    expect(vi.mocked(reportTelemetry).mock.lastCall![0]).toMatchObject({
      disableEnv: 'SITEMAP_TELEMETRY_DISABLED',
      docsUrl: 'https://github.com/maximseshuk/payload-plugin-sitemap#telemetry',
      option,
      packageName: '@seshuk/payload-plugin-sitemap',
      product: 'payload-plugin-sitemap',
    })
  })
})
