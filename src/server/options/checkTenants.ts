import type { Payload } from 'payload'

import { hasTenantField } from '@/server/generate/tenants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { fail } from './fail.js'

export const checkTenants = (payload: Payload, { sources, tenants }: ResolvedOptions): void => {
  if (!tenants || !sources.some(({ kind }) => kind === 'collection')) return
  const scoped = sources.some(
    (source) =>
      source.kind === 'collection' &&
      hasTenantField(payload.collections[source.slug]?.config.flattenedFields ?? [], tenants),
  )
  if (!scoped) {
    fail(`tenants.field "${tenants.field}" is not a relationship to ${tenants.collection} in any listed collection`)
  }
}
