import { definePlugin } from 'payload'
import type { PayloadRequest } from 'payload'

import { adminConfig } from '@/server/admin/adminConfig.js'
import { adminEndpoints } from '@/server/endpoints/adminEndpoints.js'
import { fileEndpoints } from '@/server/endpoints/fileEndpoints.js'
import { addSitemapFields } from '@/server/fields/sitemapFields.js'
import { queueRegeneration } from '@/server/jobs/queue.js'
import { addRegenerateHooks, watchedSlugs } from '@/server/jobs/regenerateHooks.js'
import { runGeneration } from '@/server/jobs/runGeneration.js'
import { sitemapTask } from '@/server/jobs/sitemapTask.js'
import { locksCollection } from '@/server/lock/locksCollection.js'
import { checkLocales } from '@/server/options/checkLocales.js'
import { checkSlugs } from '@/server/options/checkSlugs.js'
import { checkSort } from '@/server/options/checkSort.js'
import { checkTenants } from '@/server/options/checkTenants.js'
import { fail } from '@/server/options/fail.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'
import { statusGlobal } from '@/server/status/statusGlobal.js'
import { filesCollection } from '@/server/storage/filesCollection.js'
import { buildFeatures, reportSitemapTelemetry } from '@/server/telemetry.js'
import { PLUGIN_NAME } from '@/shared/constants.js'
import { mergeTranslations } from '@/shared/translations/index.js'
import type { ResolvedOptions, SitemapFile, SitemapPluginOptions } from '@/shared/types/index.js'

export const sitemap = definePlugin<SitemapPluginOptions>({
  slug: PLUGIN_NAME,
  plugin: ({ config, plugins: _plugins, ...pluginOptions }) => {
    const options = resolveOptions(pluginOptions)
    checkLocales(config, options)
    const schema = {
      collections: [
        ...addSitemapFields(config.collections ?? [], options),
        filesCollection(options),
        locksCollection(),
      ],
      globals: [...(config.globals ?? []), statusGlobal(options)],
      i18n: { ...config.i18n, translations: mergeTranslations(config.i18n?.translations) },
    }
    const concurrency = Boolean(config.jobs?.enableConcurrencyControl)
    const tasks = (enabled: boolean) =>
      options.jobs
        ? {
            jobs: {
              ...config.jobs,
              tasks: [...(config.jobs?.tasks ?? []), sitemapTask(options, concurrency, enabled)],
            },
          }
        : {}
    if (pluginOptions.enabled === false) return { ...config, ...schema, ...tasks(false) }

    const watched = watchedSlugs(options)
    const features = buildFeatures({ options: pluginOptions, resolved: options })

    return {
      ...config,
      ...schema,
      ...addRegenerateHooks(schema.collections, schema.globals, options, watched),
      admin: adminConfig(config.admin, options),
      custom: { ...config.custom, [PLUGIN_NAME]: options },
      endpoints: [...(config.endpoints ?? []), ...fileEndpoints(options), ...adminEndpoints(options)],
      ...tasks(true),
      onInit: async (payload) => {
        checkSlugs(payload, watched)
        checkSort(payload, options)
        checkTenants(payload, options)
        await config.onInit?.(payload)
        void reportSitemapTelemetry({ features, options: pluginOptions, payload })
      },
    }
  },
})

const optionsOf = (req: PayloadRequest): ResolvedOptions =>
  (req.payload.config.custom?.[PLUGIN_NAME] as ResolvedOptions | undefined) ?? fail('the plugin is not enabled')

export const queueSitemap = (req: PayloadRequest, delay = 0): Promise<number | string> =>
  queueRegeneration(req, optionsOf(req), delay)

export const generateSitemap = async (req: PayloadRequest): Promise<SitemapFile[]> => runGeneration(req, optionsOf(req))

export { escapeXML, sitemapIndex, urlEntry } from '@/server/generate/xml.js'
export type { InsertPosition } from '@seshuk/payload-plugin-tooling/fields'
export { DEFAULT_FILES_SLUG, LOCKS_SLUG, PLUGIN_NAME, STATUS_SLUG, TASK_SLUG } from '@/shared/constants.js'
export type {
  Changefreq,
  CollectionOverride,
  FromDoc,
  SitemapAccess,
  SitemapAdminOptions,
  SitemapCollectionQuery,
  SitemapCollectionSource,
  SitemapCustomSource,
  SitemapDelete,
  SitemapDoc,
  SitemapDocArgs,
  SitemapFieldsOptions,
  SitemapFilenameArgs,
  SitemapEntry,
  SitemapFile,
  SitemapFilesGroup,
  SitemapFilesGroupBy,
  SitemapFilesPage,
  SitemapImageData,
  SitemapImageField,
  SitemapImagesFn,
  SitemapJobsOptions,
  SitemapOutputOptions,
  SitemapPluginOptions,
  SitemapPublishOptions,
  SitemapRegenerateOptions,
  SitemapSortField,
  SitemapSource,
  SitemapStaticEntries,
  SitemapStaticEntry,
  SitemapStaticSource,
  SitemapStatus,
  SitemapStorageOptions,
  SitemapTenant,
  SitemapTenantsOptions,
  SitemapUpload,
} from '@/shared/types/index.js'
