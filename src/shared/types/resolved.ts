import type { InsertPosition } from '@seshuk/payload-plugin-tooling/fields'
import type { CollectionSlug, GlobalSlug, PayloadRequest, SelectType, Where } from 'payload'

import type {
  CollectionOverride,
  FromDoc,
  SitemapAccess,
  SitemapCollectionSource,
  SitemapCustomSource,
  SitemapDelete,
  SitemapDocArgs,
  SitemapFilenameArgs,
  SitemapImageField,
  SitemapImagesFn,
  SitemapPublishOptions,
  SitemapStaticEntries,
  SitemapTenant,
  SitemapUpload,
} from './options.js'
import type { Changefreq } from './sitemap.js'

export type ResolvedCollection = {
  changefreq?: FromDoc<Changefreq | undefined>
  fields: false | { changefreq: boolean; exclude: boolean; position: InsertPosition; priority: boolean }
  images?: (SitemapImageField | SitemapImagesFn)[]
  lastmod: SitemapCollectionSource['lastmod']
  locales?: string[]
  pattern?: string
  priority?: FromDoc<number | undefined>
  query: { depth: number; overrideAccess: boolean; select?: SelectType; sort: string; where?: Where }
  url: (args: SitemapDocArgs & { siteUrl: string; tenant?: SitemapTenant }) => Promise<null | string | undefined>
}

export type ResolvedSource =
  | { collection: ResolvedCollection; kind: 'collection'; locales?: string[]; name: string; slug: CollectionSlug }
  | { entries: SitemapCustomSource['entries']; kind: 'custom'; locales?: string[]; name: string }
  | { entries: SitemapStaticEntries; kind: 'static'; locales?: undefined; name: string }

export type ResolvedOptions = {
  admin: { access: SitemapAccess; view: boolean; widget: boolean }
  jobs:
    | false
    | {
        queue: string
        regenerate: false | { collections: CollectionSlug[]; delay: number; globals: GlobalSlug[] }
        schedule?: string
      }
  output: {
    filename: (args: SitemapFilenameArgs) => string
    fileUrl: (args: { filename: string; locale?: string; siteUrl: string; tenant?: SitemapTenant }) => string
    hreflang: boolean
    maxBytes: number
    maxUrls: number
    splitLocales: boolean
  }
  publish?: SitemapPublishOptions
  siteUrl: (args: { locale?: string; req: PayloadRequest; tenant?: SitemapTenant }) => Promise<string>
  sources: ResolvedSource[]
  tenants?: { collection: CollectionSlug; field: string; where?: Where }
  storage: {
    collection: string
    overrides: CollectionOverride
    delete?: SitemapDelete
    upload?: SitemapUpload
  }
}
