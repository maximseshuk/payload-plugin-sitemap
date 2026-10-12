import { findFieldPaths, insertField } from '@seshuk/payload-plugin-tooling/fields'
import type { CollectionConfig, Field } from 'payload'

import { sitemapFields } from '@/fields/index.js'
import { fail } from '@/server/options/fail.js'
import { FIELD_MARKER } from '@/shared/constants.js'
import { label } from '@/shared/translations/index.js'
import type { ResolvedCollection, ResolvedOptions } from '@/shared/types/index.js'

export const isSitemapField = (field: Field): boolean =>
  Boolean((field as { custom?: Record<string, unknown> }).custom?.[FIELD_MARKER])

const ORDER_HINT =
  'A field added by another plugin, such as the meta group of seoPlugin, exists only when that plugin comes before sitemap in plugins.'

const placeFields = (
  collection: CollectionConfig,
  fields: Exclude<ResolvedCollection['fields'], false>,
  index: number,
): Field[] => {
  const where = `sources[${index}].fields`
  if (findFieldPaths(collection.fields, isSitemapField).length > 0) {
    fail(
      `${where}: the collection already has sitemap fields. Leave "fields" out when you place sitemapFields() yourself`,
    )
  }
  const list = sitemapFields(fields)
  const unit: Field = list.length === 1 ? list[0]! : { type: 'group', fields: list, label: label('title') }
  try {
    return insertField(collection.fields, fields.position, unit)
  } catch (error) {
    const message = (error as Error).message
    const hint = message.endsWith('not found') ? ` ${ORDER_HINT}` : ''
    return fail(`${where}.position: ${message} in collection "${collection.slug}".${hint}`)
  }
}

export const addSitemapFields = (collections: CollectionConfig[], options: ResolvedOptions): CollectionConfig[] => {
  const wanted = new Map(
    options.sources.flatMap((source) =>
      source.kind === 'collection' && source.collection.fields
        ? [[source.slug, [source.collection.fields, options.sources.indexOf(source)] as const] as const]
        : [],
    ),
  )
  for (const [slug, [, index]] of wanted) {
    if (!collections.some((collection) => collection.slug === slug)) {
      fail(`sources[${index}].fields: collection "${slug}" does not exist`)
    }
  }
  return collections.map((collection) => {
    const found = wanted.get(collection.slug)
    return found ? { ...collection, fields: placeFields(collection, ...found) } : collection
  })
}
