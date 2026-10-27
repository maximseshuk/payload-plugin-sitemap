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
  endpointsFiles: boolean
  endpointsGenerate: boolean
  jobs: boolean
  jobsEnqueue: boolean
  jobsRegenerate: boolean
  jobsRegenerateTriggers: boolean
  jobsSchedule: boolean
  outputFilename: boolean
  outputFileUrl: boolean
  outputHreflang: boolean
  outputSplitLocales: boolean
  publish: boolean
  publishDelete: boolean
  publishOnly: boolean
  siteUrlFunction: boolean
  sourceKeepOnError: boolean
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
    endpointsFiles: resolved.endpoints.files,
    endpointsGenerate: resolved.endpoints.generate,
    jobs: jobs !== false,
    jobsEnqueue: jobs !== false && jobs.mode === 'enqueue',
    jobsRegenerate: Boolean(regenerate),
    jobsRegenerateTriggers: regenerate ? regenerate.collections.length + regenerate.globals.length > 0 : false,
    jobsSchedule: jobs !== false && jobs.mode === 'payload' && Boolean(jobs.schedule),
    outputFilename: Boolean(options.output?.filename),
    outputFileUrl: Boolean(options.output?.fileUrl),
    outputHreflang: resolved.output.hreflang,
    outputSplitLocales: resolved.output.splitLocales,
    publish: Boolean(resolved.publish),
    publishDelete: Boolean(resolved.publish?.delete),
    publishOnly: !resolved.storage.enabled,
    siteUrlFunction: typeof options.siteUrl === 'function',
    sourceKeepOnError: resolved.sources.some(({ onError }) => onError === 'keep'),
    staticSources: kinds.has('static'),
    storageCollection: Boolean(options.storage && options.storage.collection !== undefined),
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
