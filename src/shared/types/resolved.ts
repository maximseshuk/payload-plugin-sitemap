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
  SitemapEnqueue,
  SitemapFilenameArgs,
  SitemapImageField,
  SitemapImagesFn,
  SitemapPublishOptions,
  SitemapSourceOnError,
  SitemapStaticEntries,
  SitemapTenant,
  SitemapUpload,
} from './options.js'
import type { Changefreq } from './sitemap.js'

export type ResolvedRegenerate = false | { collections: CollectionSlug[]; delay: number; globals: GlobalSlug[] }

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

export type ResolvedSource = { name: string; onError: SitemapSourceOnError } & (
  | { collection: ResolvedCollection; kind: 'collection'; locales?: string[]; slug: CollectionSlug }
  | { entries: SitemapCustomSource['entries']; kind: 'custom'; locales?: string[] }
  | { entries: SitemapStaticEntries; kind: 'static'; locales?: undefined }
)

export type ResolvedOptions = {
  admin: { access: SitemapAccess; view: boolean; widget: boolean }
  endpoints: { files: boolean; generate: boolean }
  jobs:
    | false
    | { mode: 'payload'; queue: string; regenerate: ResolvedRegenerate; schedule?: string }
    | { enqueue: SitemapEnqueue; mode: 'enqueue'; regenerate: ResolvedRegenerate }
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
    enabled: boolean
    overrides: CollectionOverride
    delete?: SitemapDelete
    upload?: SitemapUpload
  }
}
