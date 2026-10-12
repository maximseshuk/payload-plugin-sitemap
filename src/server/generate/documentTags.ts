import type { Changefreq, ResolvedCollection, SitemapDocArgs, SitemapEntry } from '@/shared/types/index.js'

import { documentImages } from './documentImages.js'
import { valueAt } from './fillPath.js'
import { fromDoc } from './fromDoc.js'

export type DocumentOverrides = { changefreq?: Changefreq | null; exclude?: boolean | null; priority?: null | number }

const documentLastmod = async (lastmod: ResolvedCollection['lastmod'], args: SitemapDocArgs) => {
  if (lastmod === false || lastmod === undefined) return undefined
  if (typeof lastmod === 'function') return (await lastmod(args)) ?? undefined
  return valueAt(args.doc, lastmod) as Date | string | undefined
}

const checkedPriority = (priority: unknown, args: SitemapDocArgs, source: string): number | undefined => {
  if (priority === undefined || priority === null) return undefined
  if (typeof priority === 'number' && priority >= 0 && priority <= 1) return priority
  args.req.payload.logger.warn({
    msg: `sitemap: dropped priority ${String(priority)} of ${source} document ${args.doc.id}, it must be from 0 to 1`,
  })
  return undefined
}

export const documentTags = async (
  collection: ResolvedCollection,
  args: SitemapDocArgs,
  overrides: DocumentOverrides | undefined,
  source: string,
): Promise<Omit<SitemapEntry, 'url'>> => ({
  changefreq: overrides?.changefreq || (await fromDoc(collection.changefreq, args)),
  images: await documentImages(collection.images, args),
  lastmod: await documentLastmod(collection.lastmod, args),
  priority: checkedPriority(overrides?.priority ?? (await fromDoc(collection.priority, args)), args, source),
})
