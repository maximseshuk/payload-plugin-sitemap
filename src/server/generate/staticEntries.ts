import type { PayloadRequest } from 'payload'

import type { SitemapEntry, SitemapStaticEntries, SitemapTenant } from '@/shared/types/index.js'

import { absoluteURL } from './absoluteURL.js'

export const staticEntries = async (
  entries: SitemapStaticEntries,
  args: { locale?: string; req: PayloadRequest; siteUrl: string; tenant?: SitemapTenant },
): Promise<SitemapEntry[]> => {
  const list = typeof entries === 'function' ? await entries(args) : entries
  return list.map((entry) => ({ ...entry, url: absoluteURL(entry.url, args.siteUrl) }))
}
