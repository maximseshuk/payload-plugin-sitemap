import type { PayloadRequest } from 'payload'

import { liveWhere } from '@/server/storage/storedFiles.js'
import type { ResolvedOptions, SitemapFilesPage } from '@/shared/types/index.js'

import type { StoredStatus } from './statusStore.js'

export const sitemapTenants = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  status: StoredStatus,
): Promise<NonNullable<SitemapFilesPage['tenants']>> => {
  if (!options.tenants) return []
  const { docs } = await req.payload.find({
    collection: options.storage.collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    select: { tenant: true },
    where: { and: [liveWhere(status), { kind: { equals: 'index' } }] },
  })
  const ids = [...new Set(docs.map((doc) => (doc as { tenant?: null | string }).tenant).filter(Boolean))] as string[]
  if (!ids.length) return []
  const { collection } = options.tenants
  const field = req.payload.collections[collection]?.config.admin?.useAsTitle ?? 'id'
  const { docs: tenants } = await req.payload.find({
    collection,
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    select: { [field]: true },
    where: { id: { in: ids } },
  })
  const titles = new Map(tenants.map((tenant) => [String(tenant.id), (tenant as Record<string, unknown>)[field]]))
  return ids
    .map((id) => {
      const title = titles.get(id)
      return { id, title: typeof title === 'string' && title ? title : id }
    })
    .toSorted((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
}
