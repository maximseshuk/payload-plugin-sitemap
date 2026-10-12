import type { SelectType } from 'payload'

import { absoluteURL } from '@/server/generate/absoluteURL.js'
import { fillPath, pathFields } from '@/server/generate/fillPath.js'
import { FIELD_KINDS } from '@/shared/constants.js'
import type {
  ResolvedCollection,
  SitemapCollectionSource,
  SitemapFieldsOptions,
  SitemapImageField,
  SitemapImagesFn,
} from '@/shared/types/index.js'

import { checkChangefreq, checkPriority } from './checkEntry.js'
import { checkKeys } from './checkKeys.js'
import { fail } from './fail.js'

const COLLECTION_KEYS = [
  'type',
  'collection',
  'name',
  'url',
  'locales',
  'lastmod',
  'changefreq',
  'priority',
  'images',
  'fields',
  'query',
] as const
const QUERY_KEYS = ['where', 'depth', 'select', 'overrideAccess', 'sort'] as const
const SORT = /^-?[^-.\s][^.\s]*$/
const IMAGE_KEYS = ['field', 'url'] as const
const FIELDS_KEYS = [...FIELD_KINDS, 'position'] as const
const DEFAULT_URL = '/:slug'

const rootField = (path: string): string => path.split('.')[0]!

const resolveImages = (images: SitemapCollectionSource['images'], where: string): ResolvedCollection['images'] => {
  if (images === undefined) return undefined
  if (typeof images === 'function') return [images as SitemapImagesFn]
  if (!Array.isArray(images)) return fail(`${where}.images must be an array or a function`)
  return images.map((image, index): SitemapImageField | SitemapImagesFn => {
    if (typeof image === 'function') return image as SitemapImagesFn
    const field = typeof image === 'string' ? { field: image } : image
    checkKeys(field, IMAGE_KEYS, `${where}.images[${index}]`)
    if (typeof field.field !== 'string' || !field.field) fail(`${where}.images[${index}].field must be a field path`)
    if (field.url !== undefined && typeof field.url !== 'function')
      fail(`${where}.images[${index}].url must be a function`)
    return field
  })
}

const resolveFields = (value: unknown, where: string): ResolvedCollection['fields'] => {
  if (value === undefined || value === false) return false
  if (value === true) return { changefreq: true, exclude: true, position: 'sidebar', priority: true }
  const fields = checkKeys(value, FIELDS_KEYS, where) as SitemapFieldsOptions
  for (const kind of FIELD_KINDS) {
    if (fields[kind] !== undefined && typeof fields[kind] !== 'boolean') fail(`${where}.${kind} must be true or false`)
  }
  if (!FIELD_KINDS.some((kind) => fields[kind])) {
    fail(`${where} needs at least one of ${FIELD_KINDS.join(', ')} set to true`)
  }
  return {
    changefreq: fields.changefreq ?? false,
    exclude: fields.exclude ?? false,
    position: fields.position ?? 'sidebar',
    priority: fields.priority ?? false,
  }
}

export const resolveCollection = (value: unknown, where: string): ResolvedCollection => {
  const collection = checkKeys(value, COLLECTION_KEYS, where) as SitemapCollectionSource
  const url = collection.url ?? DEFAULT_URL
  if ((typeof url !== 'string' || !url) && typeof url !== 'function') {
    fail(`${where}.url must be a URL pattern such as '/blog/:slug' or a function`)
  }

  const query = checkKeys(collection.query ?? {}, QUERY_KEYS, `${where}.query`) as NonNullable<
    SitemapCollectionSource['query']
  >
  if (query.overrideAccess !== undefined && typeof query.overrideAccess !== 'boolean') {
    fail(`${where}.query.overrideAccess must be true or false`)
  }
  const sort = query.sort ?? 'id'
  if (typeof sort !== 'string' || !SORT.test(sort)) {
    fail(`${where}.query.sort must be a top-level field name with an optional "-", got ${JSON.stringify(sort)}`)
  }
  const images = resolveImages(collection.images, where)
  const lastmod = collection.lastmod ?? 'updatedAt'
  if (typeof lastmod !== 'string' && typeof lastmod !== 'function' && lastmod !== false) {
    fail(`${where}.lastmod must be a field name, false or a function`)
  }
  if (typeof collection.priority !== 'function') checkPriority(collection.priority, `${where}.priority`)
  if (typeof collection.changefreq !== 'function') checkChangefreq(collection.changefreq, `${where}.changefreq`)
  if (collection.locales !== undefined && !Array.isArray(collection.locales)) fail(`${where}.locales must be an array`)
  const fields = resolveFields(collection.fields, `${where}.fields`)

  const placeholders = typeof url === 'string' ? pathFields(url) : []
  const fieldImages = (images ?? []).filter((image): image is SitemapImageField => typeof image !== 'function')
  const include = query.select && !Object.values(query.select).includes(false)
  const select = include && {
    ...query.select,
    ...Object.fromEntries(
      [
        ...placeholders.map(rootField),
        ...(typeof lastmod === 'string' ? [rootField(lastmod)] : []),
        ...fieldImages.map(({ field }) => rootField(field)),
        sort.replace(/^-/, ''),
      ].map((field) => [field, true]),
    ),
  }
  const nested = placeholders.some((field) => field.includes('.'))

  return {
    changefreq: collection.changefreq as ResolvedCollection['changefreq'],
    fields,
    images,
    lastmod: lastmod as ResolvedCollection['lastmod'],
    locales: collection.locales,
    pattern: typeof url === 'string' ? url : undefined,
    priority: collection.priority as ResolvedCollection['priority'],
    query: {
      depth: query.depth ?? (fieldImages.length > 0 || nested ? 1 : 0),
      overrideAccess: query.overrideAccess ?? false,
      select: (select || query.select) as SelectType | undefined,
      sort,
      where: query.where,
    },
    url: async (args: Parameters<ResolvedCollection['url']>[0]) => {
      const result = typeof url === 'string' ? fillPath(url, args.doc, args.locale) : await url(args)
      return typeof result === 'string' && result ? absoluteURL(result, args.siteUrl) : undefined
    },
  }
}
