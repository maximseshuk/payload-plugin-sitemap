import { findFieldPaths } from '@seshuk/payload-plugin-tooling/fields'
import type { Field, SelectType } from 'payload'

import { FIELD_KINDS, FIELD_MARKER } from '@/shared/constants.js'

export type SitemapFieldPaths = Partial<Record<(typeof FIELD_KINDS)[number], string>>

const cache = new WeakMap<Field[], SitemapFieldPaths>()

export const sitemapFieldPaths = (fields: Field[]): SitemapFieldPaths => {
  const cached = cache.get(fields)
  if (cached) return cached
  const paths = Object.fromEntries(
    FIELD_KINDS.flatMap((kind) => {
      const [path] = findFieldPaths(
        fields,
        (field) => (field as { custom?: Record<string, unknown> }).custom?.[FIELD_MARKER] === kind,
      )
      return path ? [[kind, path]] : []
    }),
  )
  cache.set(fields, paths)
  return paths
}

const selectPath = (select: SelectType, [head, ...rest]: string[]): SelectType => {
  const current = select[head!]
  if (current === true) return select
  const inner = typeof current === 'object' && current ? (current as SelectType) : {}
  return { ...select, [head!]: rest.length > 0 ? selectPath(inner, rest) : true } as SelectType
}

export const selectWithPaths = (select: SelectType | undefined, paths: string[]): SelectType | undefined =>
  select && !Object.values(select).includes(false)
    ? paths.reduce((result, path) => selectPath(result, path.split('.')), select)
    : select
