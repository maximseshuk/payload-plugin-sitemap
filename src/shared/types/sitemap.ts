export type Changefreq = 'always' | 'daily' | 'hourly' | 'monthly' | 'never' | 'weekly' | 'yearly'

export type SitemapEntry = {
  /** Page URL, written as `<loc>`. A relative URL is joined to `siteUrl`. Entries that do not end up as http(s) are skipped. */
  url: string
  /** Last modification time. Written as an ISO 8601 date. */
  lastmod?: Date | string
  changefreq?: Changefreq
  /** Between 0 and 1. Other values are dropped. */
  priority?: number
  /** Other language versions of the page, written as `xhtml:link rel="alternate"`. */
  alternates?: { href: string; hreflang: string }[]
  /** Absolute image URLs, written as `image:image`. Only the first 1000 are kept. */
  images?: string[]
}

export type SitemapFile = {
  filename: string
  hash: string
  kind: 'file' | 'index'
  lastmod?: string
  locale?: string
  size: number
  source?: string
  tenant?: string
  url: string
  urls: number
}

/** A field the files can be grouped by. */
export type SitemapFilesGroupBy = 'locale' | 'source' | 'tenant'

/** One group of files, with `groupBy`. */
export type SitemapFilesGroup = {
  /** First page of the files in the group. */
  docs: SitemapFile[]
  page: number
  totalDocs: number
  totalPages: number
  /** The group value. `null` for files without one, such as index files grouped by source. */
  value: null | string
}

export type SitemapFilesPage = {
  /** Files of the page. Empty with `groupBy`: the files are in `groups`. */
  docs: SitemapFile[]
  /** The field the files are grouped by. */
  groupBy?: SitemapFilesGroupBy
  /** Groups of the page, with `groupBy`. `page`, `totalDocs` and `totalPages` then count groups. */
  groups?: SitemapFilesGroup[]
  /** Files per page. */
  limit: number
  /** The locale the files are filtered by. */
  locale?: string
  /** Locales a file can have: the locale codes with `output.splitLocales`, else empty. */
  locales: string[]
  page: number
  /** The field the files are sorted by, `-` first for descending. Without it: index files first, then by name. */
  sort?: string
  /** The source the files are filtered by. Index files have no source. */
  source?: string
  /** Names of the configured sources, in `sources` order. */
  sources: string[]
  /** The tenant the files are filtered by, with `tenants`. */
  tenant?: string
  /** Tenants of the live files, sorted by title, with `tenants`. */
  tenants?: { id: string; title: string }[]
  totalDocs: number
  totalPages: number
}

export type SitemapStatus = {
  error?: null | string
  errorAt?: null | string
  files: number
  generatedAt?: null | string
  state: 'idle' | 'queued' | 'running'
  urls?: null | number
}
