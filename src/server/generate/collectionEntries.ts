import type { PayloadRequest, Where } from 'payload'
import { createLocalReq } from 'payload'

import { selectWithPaths, sitemapFieldPaths } from '@/server/fields/sitemapFieldPaths.js'
import type {
  ResolvedCollection,
  ResolvedOptions,
  SitemapDoc,
  SitemapEntry,
  SitemapTenant,
} from '@/shared/types/index.js'

import type { DocumentOverrides } from './documentTags.js'
import { documentTags } from './documentTags.js'
import { valueAt } from './fillPath.js'
import type { Locales } from './locales.js'
import type { SiteUrls } from './sourceEntries.js'
import { hasTenantField } from './tenants.js'

const PAGE_SIZE = 250

type Alternate = { href: string; hreflang: string }

type Phase = { cursor: (doc: SitemapDoc) => Where; filter: Where[]; sort: string | string[] }

export async function* collectionEntries(
  req: PayloadRequest,
  options: ResolvedOptions,
  slug: string,
  collection: ResolvedCollection,
  locale: string | undefined,
  locales: Locales,
  site: SiteUrls,
  tenant: SitemapTenant | undefined,
): AsyncGenerator<SitemapEntry> {
  const { payload } = req
  const { overrideAccess } = collection.query
  const readReq = overrideAccess
    ? req
    : await createLocalReq({ context: req.context, req: { transactionID: req.transactionID } }, payload)
  const config = payload.collections[slug]!.config
  const drafts = Boolean(config.versions?.drafts)
  const paths = sitemapFieldPaths(config.fields)
  const select = selectWithPaths(collection.query.select, Object.values(paths))
  const field = options.tenants?.field
  const scoped = tenant && field && hasTenantField(config.flattenedFields, options.tenants)
  const filters = [collection.query.where, scoped ? { [field]: { equals: tenant.id } } : undefined].filter(
    (where): where is Where => Boolean(where),
  )
  const find = (code: string | undefined, extra: Where[], limit: number, sort: string | string[] = 'id') =>
    payload.find({
      collection: slug,
      depth: collection.query.depth,
      limit,
      overrideAccess,
      pagination: false,
      req: readReq,
      sort,
      where: { and: [...filters, ...extra] },
      ...(code ? { locale: code } : {}),
      ...(select ? { select } : {}),
    })
  const statusOf = async (ids: (number | string)[]) => {
    if (!drafts || ids.length === 0) return undefined
    const { docs } = await payload.find({
      collection: slug,
      depth: 0,
      limit: ids.length,
      overrideAccess: true,
      pagination: false,
      req: readReq,
      select: { _status: true },
      where: { id: { in: ids } },
      ...(locale ? { locale: 'all' } : {}),
    })
    return new Map(docs.map((doc) => [doc.id, doc._status as unknown]))
  }

  const written = locales.all.filter((code) => !code || !collection.locales || collection.locales.includes(code))
  const others = options.output.hreflang ? written.filter((code) => code && code !== locale) : []
  const overridesOf = (doc: SitemapDoc): DocumentOverrides => ({
    changefreq: paths.changefreq ? (valueAt(doc, paths.changefreq) as DocumentOverrides['changefreq']) : undefined,
    exclude: paths.exclude ? (valueAt(doc, paths.exclude) as boolean | null | undefined) : undefined,
    priority: paths.priority ? (valueAt(doc, paths.priority) as null | number | undefined) : undefined,
  })
  const urlOf = async (doc: SitemapDoc | undefined, code: string | undefined) =>
    doc && !overridesOf(doc).exclude
      ? collection.url({ doc, locale: code, req, siteUrl: site(code), tenant })
      : undefined

  async function* pageEntries(page: SitemapDoc[]): AsyncGenerator<SitemapEntry> {
    const statuses = await statusOf(page.map((doc) => doc.id))
    const published = (doc: SitemapDoc, code: string | undefined) => {
      if (!statuses) return true
      const status = statuses.get(doc.id)
      const value = code && status && typeof status === 'object' ? (status as Record<string, unknown>)[code] : status
      return value === 'published'
    }
    const docs = page.filter((doc) => published(doc, locale))
    const ids = docs.map((doc) => doc.id)
    const translated = new Map<string | undefined, Map<number | string, SitemapDoc>>()
    if (others.length > 0 && ids.length > 0) {
      for (const code of others) {
        const found = await find(code, [{ id: { in: ids } }], ids.length)
        const live = (found.docs as SitemapDoc[]).filter((doc) => published(doc, code))
        translated.set(code, new Map(live.map((doc) => [doc.id, doc])))
      }
    }

    for (const doc of docs) {
      const url = await urlOf(doc, locale)
      if (!url) continue

      const alternates: Alternate[] = []
      if (locale && others.length > 0) {
        for (const code of written) {
          const href = code === locale ? url : await urlOf(translated.get(code)?.get(doc.id), code)
          if (code && href) alternates.push({ href, hreflang: code })
        }
      }
      const fallback = alternates.find(({ hreflang }) => hreflang === locales.defaultLocale)
      const tags = await documentTags(collection, { doc, locale, req }, overridesOf(doc), slug)

      yield {
        ...tags,
        alternates:
          alternates.length > 1
            ? [...alternates, ...(fallback ? [{ href: fallback.href, hreflang: 'x-default' }] : [])]
            : undefined,
        url,
      }
    }
  }

  const { sort } = collection.query
  const key = sort.replace(/^-/, '')
  const after = sort.startsWith('-') ? 'less_than' : 'greater_than'
  const phases: Phase[] =
    key === 'id'
      ? [{ cursor: (doc) => ({ id: { [after]: doc.id } }), filter: [], sort }]
      : [
          {
            cursor: (doc) => ({
              or: [
                { [key]: { [after]: doc[key] } },
                { and: [{ [key]: { equals: doc[key] } }, { id: { greater_than: doc.id } }] },
              ],
            }),
            filter: [{ [key]: { not_equals: null } }],
            sort: [sort, 'id'],
          },
          {
            cursor: (doc) => ({ id: { greater_than: doc.id } }),
            filter: [{ or: [{ [key]: { exists: false } }, { [key]: { equals: null } }] }],
            sort: 'id',
          },
        ]

  for (const phase of phases) {
    let last: SitemapDoc | undefined
    for (;;) {
      const extra = last ? [...phase.filter, phase.cursor(last)] : phase.filter
      const result = await find(locale, extra, PAGE_SIZE, phase.sort)
      yield* pageEntries(result.docs as SitemapDoc[])
      if (result.docs.length < PAGE_SIZE) break
      last = result.docs.at(-1) as SitemapDoc
    }
  }
}
