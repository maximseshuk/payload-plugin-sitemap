import type { Payload } from 'payload'

import type { ResolvedOptions } from '@/shared/types/index.js'

import { fail } from './fail.js'

const BUILT_IN = ['id', 'createdAt', 'updatedAt']
const TYPES = ['text', 'textarea', 'email', 'number', 'date', 'select', 'radio', 'checkbox', 'code']

export const checkSort = (payload: Payload, { sources }: ResolvedOptions): void => {
  sources.forEach((source, index) => {
    if (source.kind !== 'collection') return
    const key = source.collection.query.sort.replace(/^-/, '')
    if (BUILT_IN.includes(key)) return
    const where = `sources[${index}].query.sort`
    const field = payload.collections[source.slug]?.config.flattenedFields.find(({ name }) => name === key)
    if (!field) return fail(`${where}: "${key}" is not a top-level field of ${source.slug}`)
    if (!TYPES.includes(field.type)) {
      fail(`${where}: "${key}" is a ${field.type} field, use ${TYPES.join(', ')} or ${BUILT_IN.join(', ')}`)
    }
    if ('hasMany' in field && field.hasMany) fail(`${where}: "${key}" has many values, use a field with one value`)
    if ('localized' in field && field.localized) fail(`${where}: "${key}" is localized, use a field that is not`)
  })
}
