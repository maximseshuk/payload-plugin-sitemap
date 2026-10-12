import type { PayloadRequest, Where } from 'payload'

import { liveWhere, toFile } from '@/server/storage/storedFiles.js'
import { FILES_LIMIT } from '@/shared/constants.js'
import type { ResolvedOptions, SitemapFilesGroupBy, SitemapFilesPage } from '@/shared/types/index.js'

import { sitemapTenants } from './sitemapTenants.js'
import { readStatus } from './statusStore.js'

export type SitemapFilesQuery = {
  group?: null | string
  groupBy?: string
  limit?: number
  locale?: string
  page?: number
  search?: string
  sort?: string
  source?: string
  tenant?: string
}

const GROUP_BATCH = 10

const sortFields: Record<string, string> = {
  filename: 'name',
  lastmod: 'lastmod',
  locale: 'locale',
  size: 'size',
  source: 'source',
  urls: 'urls',
}

export const groupByFields = (req: PayloadRequest, options: ResolvedOptions): SitemapFilesGroupBy[] => [
  ...(options.tenants ? (['tenant'] as const) : []),
  ...(options.output.splitLocales && req.payload.config.localization ? (['locale'] as const) : []),
  ...(options.sources.length > 1 ? (['source'] as const) : []),
]

const groupWhere = (field: string, value: null | string): Where =>
  value === null
    ? { or: [{ [field]: { exists: false } }, { [field]: { equals: null } }] }
    : { [field]: { equals: value } }

export const sitemapFiles = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  { group, groupBy, limit = FILES_LIMIT, locale, page = 1, search, sort, source, tenant }: SitemapFilesQuery,
): Promise<SitemapFilesPage> => {
  const status = await readStatus(req)
  const { localization } = req.payload.config
  const locales = options.output.splitLocales && localization ? localization.localeCodes : []
  const sources = options.sources.map(({ name }) => name)
  const field = groupByFields(req, options).find((name) => name === groupBy)
  const sortField = sort ? sortFields[sort.replace(/^-/, '')] : undefined
  const descending = sort?.startsWith('-') ? '-' : ''
  const fileSort = sortField ? [...new Set([`${descending}${sortField}`, `${descending}name`])] : ['-kind', 'name']
  const filters = {
    limit,
    locales,
    sources,
    ...(field ? { groupBy: field } : {}),
    ...(locale ? { locale } : {}),
    ...(sortField ? { sort } : {}),
    ...(source ? { source } : {}),
  }
  if (!status.run) return { docs: [], page: 1, totalDocs: 0, totalPages: 0, ...filters }
  const filter = options.tenants ? tenant : undefined
  const where: Where = {
    and: [
      liveWhere(status),
      ...(filter ? [{ tenant: { equals: filter } }] : []),
      ...(locale ? [{ locale: { equals: locale } }] : []),
      ...(source ? [{ source: { equals: source } }] : []),
      ...(search ? [{ name: { like: search } }] : []),
    ],
  }
  const find = async (filesPage: number, match: Where) => {
    const result = await req.payload.find({
      collection: options.storage.collection,
      depth: 0,
      limit,
      overrideAccess: true,
      page: filesPage,
      req,
      sort: fileSort,
      where: match,
    })
    return {
      docs: result.docs.map((doc) => toFile(doc)),
      page: result.page ?? filesPage,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
    }
  }
  const tenants = options.tenants ? await sitemapTenants(req, options, status) : undefined
  const tenantInfo = tenants ? { tenant: filter, tenants } : {}
  if (!field || group !== undefined) {
    const match = field && group !== undefined ? { and: [where, groupWhere(field, group)] } : where
    return { ...(await find(page, match)), ...filters, ...tenantInfo }
  }
  const { values } = await req.payload.findDistinct({
    collection: options.storage.collection,
    field,
    limit: 0,
    overrideAccess: true,
    req,
    where,
  })
  const known = { locale: locales, source: sources, tenant: tenants?.map(({ id }) => id) ?? [] }[field]
  const order = new Map(known.map((value, index) => [value, index]))
  const keys = values
    .map((row) => (row as Record<string, unknown>)[field])
    .map((value) => (typeof value === 'string' && value ? value : null))
    .toSorted((a, b) =>
      a === null || b === null
        ? Number(b === null) - Number(a === null)
        : (order.get(a) ?? order.size) - (order.get(b) ?? order.size) || a.localeCompare(b, 'en', { numeric: true }),
    )
  const totalPages = Math.ceil(keys.length / limit)
  const groupsPage = Math.min(page, Math.max(totalPages, 1))
  const findGroup = async (value: null | string) => ({
    value,
    ...(await find(1, { and: [where, groupWhere(field, value)] })),
  })
  const pageKeys = keys.slice((groupsPage - 1) * limit, groupsPage * limit)
  const groups: Awaited<ReturnType<typeof findGroup>>[] = []
  for (let index = 0; index < pageKeys.length; index += GROUP_BATCH) {
    groups.push(...(await Promise.all(pageKeys.slice(index, index + GROUP_BATCH).map(findGroup))))
  }
  return {
    docs: [],
    groups,
    page: groupsPage,
    totalDocs: keys.length,
    totalPages,
    ...filters,
    ...tenantInfo,
  }
}
