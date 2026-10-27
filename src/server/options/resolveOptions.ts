import { DEFAULT_FILES_SLUG, MAX_BYTES, MAX_URLS, STATIC_SOURCE } from '@/shared/constants.js'
import type {
  CollectionOverride,
  ResolvedOptions,
  ResolvedRegenerate,
  ResolvedSource,
  SitemapAdminOptions,
  SitemapCollectionSource,
  SitemapCustomSource,
  SitemapEndpointsOptions,
  SitemapFilenameArgs,
  SitemapJobsOptions,
  SitemapOutputOptions,
  SitemapPluginOptions,
  SitemapPublishOptions,
  SitemapRegenerateOptions,
  SitemapSourceOnError,
  SitemapStaticSource,
  SitemapStorageOptions,
  SitemapTenantsOptions,
} from '@/shared/types/index.js'

import { checkEntry } from './checkEntry.js'
import { checkKeys, checkObject } from './checkKeys.js'
import { checkSiteUrl } from './checkSiteUrl.js'
import { fail } from './fail.js'
import { resolveCollection } from './resolveCollection.js'

const PLUGIN_KEYS = [
  'siteUrl',
  'sources',
  'output',
  'storage',
  'publish',
  'endpoints',
  'jobs',
  'tenants',
  'admin',
  'enabled',
  'telemetry',
] as const
const SOURCE_TYPES = ['collection', 'custom', 'static'] as const
const CUSTOM_KEYS = ['type', 'name', 'locales', 'entries', 'onError'] as const
const STATIC_KEYS = ['type', 'name', 'entries', 'onError'] as const
const ON_ERROR = ['fail', 'keep'] as const
const OUTPUT_KEYS = ['maxUrlsPerFile', 'filename', 'fileUrl', 'hreflang', 'splitLocales'] as const
const STORAGE_KEYS = ['collection', 'upload', 'delete'] as const
const PUBLISH_KEYS = ['put', 'delete'] as const
const ENDPOINTS_KEYS = ['files', 'generate'] as const
const JOBS_KEYS = ['regenerate', 'schedule', 'queue', 'enqueue'] as const
const REGENERATE_KEYS = ['delay', 'collections', 'globals'] as const
const ADMIN_KEYS = ['access', 'view', 'widget'] as const
const TENANTS_KEYS = ['collection', 'field', 'where'] as const
const TELEMETRY_KEYS = ['url'] as const

const NAME = /^[\w-]+$/

const checkName = (name: unknown, where: string): string => {
  if (typeof name !== 'string' || !NAME.test(name)) {
    fail(`${where} name ${JSON.stringify(name)} may only use letters, digits, "-" and "_"`)
  }
  return name as string
}

const checkFunction = (value: unknown, where: string): void => {
  if (value !== undefined && typeof value !== 'function') fail(`${where} must be a function`)
}

const checkBoolean = (value: unknown, where: string): void => {
  if (value !== undefined && typeof value !== 'boolean') fail(`${where} must be true or false`)
}

const resolveOnError = (value: unknown, where: string): SitemapSourceOnError => {
  if (value !== undefined && !ON_ERROR.includes(value as never)) fail(`${where}.onError must be "fail" or "keep"`)
  return (value as SitemapSourceOnError | undefined) ?? 'fail'
}

const resolveSource = (value: unknown, where: string): ResolvedSource => {
  const { onError, type } = checkObject(value, where)
  if (!SOURCE_TYPES.includes(type as never)) fail(`${where}.type must be "collection", "custom" or "static"`)
  if (type === 'collection') {
    const source = value as SitemapCollectionSource
    if (typeof source.collection !== 'string' || !source.collection) {
      fail(`${where}.collection must be a collection slug`)
    }
    const collection = resolveCollection(source, where)
    return {
      collection,
      kind: 'collection',
      locales: collection.locales,
      name: checkName(source.name ?? source.collection, where),
      onError: resolveOnError(onError, where),
      slug: source.collection,
    }
  }
  if (type === 'custom') {
    const source = checkKeys(value, CUSTOM_KEYS, where) as SitemapCustomSource
    if (typeof source.entries !== 'function') fail(`${where}.entries must be a function`)
    if (source.locales !== undefined && !Array.isArray(source.locales)) fail(`${where}.locales must be an array`)
    return {
      entries: source.entries,
      kind: 'custom',
      locales: source.locales,
      name: checkName(source.name, where),
      onError: resolveOnError(onError, where),
    }
  }
  const source = checkKeys(value, STATIC_KEYS, where) as SitemapStaticSource
  const { entries } = source
  if (Array.isArray(entries)) entries.forEach((entry, index) => checkEntry(entry, `${where}.entries[${index}]`))
  else if (typeof entries !== 'function') fail(`${where}.entries must be an array or a function`)
  return {
    entries,
    kind: 'static',
    name: checkName(source.name ?? STATIC_SOURCE, where),
    onError: resolveOnError(onError, where),
  }
}

const resolveSources = (value: unknown): ResolvedSource[] => {
  if (value !== undefined && !Array.isArray(value)) fail('sources must be an array')
  const sources = ((value ?? []) as unknown[]).map((source, index) => resolveSource(source, `sources[${index}]`))
  const names = new Map<string, number>()
  const fields = new Map<string, number>()
  sources.forEach((source, index) => {
    const named = names.get(source.name)
    if (named !== undefined) fail(`sources[${named}] and sources[${index}] both write files named "${source.name}"`)
    names.set(source.name, index)
    if (source.kind !== 'collection' || !source.collection.fields) return
    const field = fields.get(source.slug)
    if (field !== undefined) {
      fail(`sources[${field}] and sources[${index}] both set fields for "${source.slug}", only one may`)
    }
    fields.set(source.slug, index)
  })
  return sources
}

const defaultFilename = ({ kind, locale, part, source, tenant }: SitemapFilenameArgs): string =>
  `${(kind === 'index' ? ['sitemap', tenant?.id, locale] : [tenant?.id, locale, source, part])
    .filter((value) => value !== undefined)
    .join('-')}.xml`

const resolveOutput = (value: unknown): ResolvedOptions['output'] => {
  const output = checkKeys(value ?? {}, OUTPUT_KEYS, 'output') as SitemapOutputOptions
  const maxUrls = output.maxUrlsPerFile ?? MAX_URLS
  if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > MAX_URLS) {
    fail(`output.maxUrlsPerFile must be an integer from 1 to ${MAX_URLS}`)
  }
  checkFunction(output.filename, 'output.filename')
  checkFunction(output.fileUrl, 'output.fileUrl')
  checkBoolean(output.hreflang, 'output.hreflang')
  checkBoolean(output.splitLocales, 'output.splitLocales')
  return {
    filename: output.filename ?? defaultFilename,
    fileUrl: output.fileUrl ?? (({ filename, siteUrl }) => `${siteUrl}/sitemaps/${filename}`),
    hreflang: output.hreflang ?? true,
    maxBytes: MAX_BYTES,
    maxUrls,
    splitLocales: output.splitLocales ?? false,
  }
}

const resolveStorage = (value: unknown, publish: unknown): ResolvedOptions['storage'] => {
  if (value === false) {
    if (publish === undefined) fail('storage: false needs publish, the only place the files go')
    return { collection: DEFAULT_FILES_SLUG, enabled: false, overrides: {} }
  }
  const storage = checkKeys(value ?? {}, STORAGE_KEYS, 'storage') as SitemapStorageOptions
  const overrides = (
    storage.collection === undefined ? {} : checkObject(storage.collection, 'storage.collection')
  ) as CollectionOverride
  if (overrides.slug !== undefined) checkName(overrides.slug, 'storage.collection.slug')
  checkFunction(overrides.fields, 'storage.collection.fields')
  checkFunction(storage.upload, 'storage.upload')
  checkFunction(storage.delete, 'storage.delete')
  if (overrides.upload !== undefined && storage.upload) {
    fail('storage.collection.upload cannot be set with storage.upload')
  }
  if (storage.delete && !storage.upload) fail('storage.delete needs storage.upload')
  return {
    collection: overrides.slug ?? DEFAULT_FILES_SLUG,
    delete: storage.delete,
    enabled: true,
    overrides,
    upload: storage.upload,
  }
}

const resolvePublish = (value: unknown, output: unknown): ResolvedOptions['publish'] => {
  if (value === undefined) return undefined
  const publish = checkKeys(value, PUBLISH_KEYS, 'publish') as SitemapPublishOptions
  if (typeof publish.put !== 'function') fail('publish.put must be a function')
  checkFunction(publish.delete, 'publish.delete')
  if (!(output as SitemapOutputOptions | undefined)?.fileUrl) {
    fail('publish needs output.fileUrl, the public URL of the published files')
  }
  return { delete: publish.delete, put: publish.put }
}

const resolveRegenerate = (value: unknown): ResolvedRegenerate => {
  if (value === false) return false
  const regenerate = checkKeys(value ?? {}, REGENERATE_KEYS, 'jobs.regenerate') as SitemapRegenerateOptions
  const delay = regenerate.delay ?? 300_000
  if (!Number.isFinite(delay) || delay < 0) fail('jobs.regenerate.delay must be a number of milliseconds')
  for (const key of ['collections', 'globals'] as const) {
    if (regenerate[key] !== undefined && !Array.isArray(regenerate[key])) {
      fail(`jobs.regenerate.${key} must be an array`)
    }
  }
  return { collections: regenerate.collections ?? [], delay, globals: regenerate.globals ?? [] }
}

const resolveJobs = (value: unknown): ResolvedOptions['jobs'] => {
  if (value === false) return false
  const jobs = checkKeys(value ?? {}, JOBS_KEYS, 'jobs') as SitemapJobsOptions
  if (jobs.schedule !== undefined && typeof jobs.schedule !== 'string') fail('jobs.schedule must be a cron string')
  if (jobs.queue !== undefined && typeof jobs.queue !== 'string') fail('jobs.queue must be a string')
  checkFunction(jobs.enqueue, 'jobs.enqueue')
  if (jobs.enqueue && jobs.schedule !== undefined) {
    fail('jobs.schedule needs the Payload jobs queue, schedule runs in your own scheduler with jobs.enqueue')
  }
  if (jobs.enqueue && jobs.queue !== undefined) {
    fail('jobs.queue names a Payload jobs queue, not used with jobs.enqueue')
  }
  const regenerate = resolveRegenerate(jobs.regenerate)
  return jobs.enqueue
    ? { enqueue: jobs.enqueue, mode: 'enqueue', regenerate }
    : { mode: 'payload', queue: jobs.queue ?? 'default', regenerate, schedule: jobs.schedule }
}

const resolveEndpoints = (value: unknown): ResolvedOptions['endpoints'] => {
  const endpoints = checkKeys(value ?? {}, ENDPOINTS_KEYS, 'endpoints') as SitemapEndpointsOptions
  checkBoolean(endpoints.files, 'endpoints.files')
  checkBoolean(endpoints.generate, 'endpoints.generate')
  return { files: endpoints.files ?? true, generate: endpoints.generate ?? true }
}

const resolveAdmin = (value: unknown): ResolvedOptions['admin'] => {
  const admin = checkKeys(value ?? {}, ADMIN_KEYS, 'admin') as SitemapAdminOptions
  checkFunction(admin.access, 'admin.access')
  checkBoolean(admin.view, 'admin.view')
  checkBoolean(admin.widget, 'admin.widget')
  return {
    access: admin.access ?? (({ req }) => req.user?.collection === req.payload.config.admin.user),
    view: admin.view ?? true,
    widget: admin.widget ?? true,
  }
}

const resolveTenants = (value: unknown): ResolvedOptions['tenants'] => {
  if (value === undefined || value === false) return undefined
  const tenants = (value === true ? {} : checkKeys(value, TENANTS_KEYS, 'tenants')) as SitemapTenantsOptions
  for (const key of ['collection', 'field'] as const) {
    if (tenants[key] !== undefined && (typeof tenants[key] !== 'string' || !tenants[key])) {
      fail(`tenants.${key} must be a non-empty string`)
    }
  }
  const { where } = tenants
  if (where !== undefined && (typeof where !== 'object' || where === null || Array.isArray(where))) {
    fail('tenants.where must be an object')
  }
  return { collection: tenants.collection ?? 'tenants', field: tenants.field ?? 'tenant', where }
}

const checkTelemetry = (value: unknown): void => {
  if (value === undefined || typeof value === 'boolean') return
  const { url } = checkKeys(value, TELEMETRY_KEYS, 'telemetry')
  if (url !== undefined && (typeof url !== 'string' || !url)) fail('telemetry.url must be a URL')
}

export const resolveOptions = (value: SitemapPluginOptions): ResolvedOptions => {
  const options = checkKeys(value, PLUGIN_KEYS, 'sitemap options') as SitemapPluginOptions
  const { siteUrl } = options
  if (typeof siteUrl === 'string') checkSiteUrl(siteUrl)
  else if (typeof siteUrl !== 'function') fail('siteUrl is required')
  checkBoolean(options.enabled, 'enabled')
  checkTelemetry(options.telemetry)

  return {
    admin: resolveAdmin(options.admin),
    endpoints: resolveEndpoints(options.endpoints),
    jobs: resolveJobs(options.jobs),
    output: resolveOutput(options.output),
    publish: resolvePublish(options.publish, options.output),
    siteUrl: async ({ locale, req, tenant }) =>
      checkSiteUrl(
        typeof siteUrl === 'function' ? await siteUrl({ locale, req, tenant }) : siteUrl,
        locale,
        tenant?.id,
      ),
    sources: resolveSources(options.sources),
    storage: resolveStorage(options.storage, options.publish),
    tenants: resolveTenants(options.tenants),
  }
}
