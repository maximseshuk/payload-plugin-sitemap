import type { FlattenedField, PayloadRequest, Where } from 'payload'

import { fail } from '@/server/options/fail.js'
import type { ResolvedOptions, SitemapTenant } from '@/shared/types/index.js'

const KEY = /^[\w-]+$/

export const hasTenantField = (fields: FlattenedField[], tenants: ResolvedOptions['tenants']): boolean =>
  Boolean(tenants) &&
  fields.some(
    (field) =>
      field.name === tenants!.field && field.type === 'relationship' && field.relationTo === tenants!.collection,
  )

export const tenantsOf = async (
  req: PayloadRequest,
  options: ResolvedOptions,
): Promise<(SitemapTenant | undefined)[]> => {
  if (!options.tenants) return [undefined]
  const { collection, where } = options.tenants
  const drafts = Boolean(req.payload.collections[collection]?.config.versions?.drafts)
  const filters = [where, drafts ? { _status: { equals: 'published' } } : undefined].filter((filter): filter is Where =>
    Boolean(filter),
  )
  const { docs } = await req.payload.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    sort: 'id',
    where: filters.length ? { and: filters } : undefined,
  })
  for (const { id } of docs) {
    if (!KEY.test(String(id))) fail(`tenant id ${JSON.stringify(id)} may only use letters, digits, "-" and "_"`)
  }
  return docs as SitemapTenant[]
}
