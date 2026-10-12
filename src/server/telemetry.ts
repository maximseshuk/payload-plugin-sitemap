import { reportTelemetry } from '@seshuk/payload-plugin-tooling/telemetry'
import type { Payload } from 'payload'

import { PLUGIN_NAME } from '@/shared/constants.js'
import type { ResolvedOptions, SitemapCollectionSource, SitemapPluginOptions } from '@/shared/types/index.js'

export type TelemetryFeatures = {
  adminAccess: boolean
  adminView: boolean
  adminWidget: boolean
  collectionFields: boolean
  collectionImages: boolean
  collectionQuery: boolean
  collectionSort: boolean
  collectionUrlFunction: boolean
  customSources: boolean
  jobs: boolean
  jobsRegenerate: boolean
  jobsRegenerateTriggers: boolean
  jobsSchedule: boolean
  outputFilename: boolean
  outputFileUrl: boolean
  outputHreflang: boolean
  outputSplitLocales: boolean
  publish: boolean
  publishDelete: boolean
  siteUrlFunction: boolean
  staticSources: boolean
  storageCollection: boolean
  storageDelete: boolean
  storageUpload: boolean
  tenants: boolean
}

export const buildFeatures = ({
  options,
  resolved,
}: {
  options: SitemapPluginOptions
  resolved: ResolvedOptions
}): TelemetryFeatures => {
  const collections = (options.sources ?? []).filter(
    (source): source is SitemapCollectionSource => source.type === 'collection',
  )
  const kinds = new Set(resolved.sources.map(({ kind }) => kind))
  const { jobs } = resolved
  const regenerate = jobs && jobs.regenerate

  return {
    adminAccess: Boolean(options.admin?.access),
    adminView: resolved.admin.view,
    adminWidget: resolved.admin.widget,
    collectionFields: collections.some(({ fields }) => Boolean(fields)),
    collectionImages: collections.some(({ images }) => images !== undefined),
    collectionQuery: collections.some(({ query }) => query !== undefined),
    collectionSort: collections.some(({ query }) => query?.sort !== undefined),
    collectionUrlFunction: collections.some(({ url }) => typeof url === 'function'),
    customSources: kinds.has('custom'),
    jobs: jobs !== false,
    jobsRegenerate: Boolean(regenerate),
    jobsRegenerateTriggers: regenerate ? regenerate.collections.length + regenerate.globals.length > 0 : false,
    jobsSchedule: Boolean(jobs && jobs.schedule),
    outputFilename: Boolean(options.output?.filename),
    outputFileUrl: Boolean(options.output?.fileUrl),
    outputHreflang: resolved.output.hreflang,
    outputSplitLocales: resolved.output.splitLocales,
    publish: Boolean(resolved.publish),
    publishDelete: Boolean(resolved.publish?.delete),
    siteUrlFunction: typeof options.siteUrl === 'function',
    staticSources: kinds.has('static'),
    storageCollection: options.storage?.collection !== undefined,
    storageDelete: Boolean(resolved.storage.delete),
    storageUpload: Boolean(resolved.storage.upload),
    tenants: Boolean(resolved.tenants),
  }
}

export const reportSitemapTelemetry = ({
  features,
  options,
  payload,
}: {
  features: TelemetryFeatures
  options: SitemapPluginOptions
  payload: Payload
}): Promise<void> =>
  reportTelemetry({
    disableEnv: 'SITEMAP_TELEMETRY_DISABLED',
    docsUrl: 'https://github.com/maximseshuk/payload-plugin-sitemap#telemetry',
    features,
    option: options.telemetry,
    packageName: PLUGIN_NAME,
    payload,
    product: 'payload-plugin-sitemap',
  })
