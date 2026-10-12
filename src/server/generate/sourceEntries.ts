import type { PayloadRequest } from 'payload'

import type { ResolvedOptions, ResolvedSource, SitemapEntry, SitemapTenant } from '@/shared/types/index.js'

import { absoluteURL } from './absoluteURL.js'
import { collectionEntries } from './collectionEntries.js'
import type { Locales } from './locales.js'
import { staticEntries } from './staticEntries.js'

export type SiteUrls = (locale: string | undefined) => string

export async function* sourceEntries(
  req: PayloadRequest,
  options: ResolvedOptions,
  source: ResolvedSource,
  locale: string | undefined,
  locales: Locales,
  site: SiteUrls,
  tenant: SitemapTenant | undefined,
): AsyncGenerator<SitemapEntry> {
  const siteUrl = site(locale)
  if (source.kind === 'collection') {
    yield* collectionEntries(req, options, source.slug, source.collection, locale, locales, site, tenant)
  } else if (source.kind === 'static') {
    yield* await staticEntries(source.entries, { locale, req, siteUrl, tenant })
  } else {
    for await (const entry of await source.entries({ locale, req, siteUrl, tenant })) {
      yield typeof entry.url === 'string' ? { ...entry, url: absoluteURL(entry.url, siteUrl) } : entry
    }
  }
}
