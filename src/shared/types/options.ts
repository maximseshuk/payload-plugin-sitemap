import type { InsertPosition } from '@seshuk/payload-plugin-tooling/fields'
import type {
  CollectionConfig,
  CollectionSlug,
  DataFromCollectionSlug,
  Field,
  GlobalSlug,
  PayloadRequest,
  SelectType,
  Where,
} from 'payload'

import type { Changefreq, SitemapEntry } from './sitemap.js'

type MaybePromise<T> = Promise<T> | T

export type SitemapDoc<S extends CollectionSlug = CollectionSlug> = DataFromCollectionSlug<S> &
  Record<string, any> & { id: number | string }

export type SitemapDocArgs<S extends CollectionSlug = CollectionSlug> = {
  doc: SitemapDoc<S>
  locale?: string
  req: PayloadRequest
}

/** A tenant document from the tenants collection. */
export type SitemapTenant = Record<string, any> & { id: number | string }

/** A static value, or a function of the document. A function that returns `undefined` leaves the tag out. */
export type FromDoc<T, S extends CollectionSlug = CollectionSlug> = T | ((args: SitemapDocArgs<S>) => MaybePromise<T>)

/** An upload document, or any object with a `url`, found at an image field path. */
export type SitemapImageData = { [key: string]: unknown; filename?: string; prefix?: string; url?: string }

export type SitemapImageField = {
  /** Field path to an upload or relationship. Nested paths (`hero.image`) and arrays or blocks (`gallery.image`) work. */
  field: string
  /** Builds the image URL from the upload document. Return `null` to skip the image. @default the document's `url` */
  url?: (image: SitemapImageData) => null | string | undefined
}

/** Returns image URLs for the document. Relative URLs are resolved against the Payload `serverURL`. */
export type SitemapImagesFn<S extends CollectionSlug = CollectionSlug> = (
  args: SitemapDocArgs<S>,
) => MaybePromise<string[] | undefined>

/** Top-level fields of a document type with one string, number or boolean value, plus `id`, `createdAt` and `updatedAt`. */
export type SitemapSortField<T> = string extends keyof T
  ? string
  :
      | 'createdAt'
      | 'id'
      | 'updatedAt'
      | ({ [K in keyof T]-?: NonNullable<T[K]> extends boolean | number | string ? K : never }[keyof T] & string)

export type SitemapCollectionQuery<S extends CollectionSlug = CollectionSlug> = {
  /** Extra filter. Collections with drafts list only documents published in that locale. */
  where?: Where
  /** @default 1 when `images` uses field paths or the `url` pattern has a nested placeholder, else 0 */
  depth?: number
  /** Fields to load. The plugin adds the fields that `url`, `lastmod`, `images` and the sitemap fields need. */
  select?: SelectType
  /**
   * Read the documents with access control off. By default the plugin reads as an anonymous visitor, so the
   * collection's `read` access decides what is public.
   * @default false
   */
  overrideAccess?: boolean
  /**
   * Order of the URLs in the files: a top-level field that is not localized, with `-` in front for descending order.
   * Text, textarea, email, number, date, single select, radio, checkbox and code fields work, as do `id`,
   * `createdAt` and `updatedAt`. Documents without a value come last. A document whose sort value changes during a
   * run (such as `updatedAt`) can move past the read position and be left out of that run.
   * @example sort: '-publishedAt'
   * @default 'id'
   */
  sort?: CollectionSlug extends S
    ? string
    : `-${SitemapSortField<DataFromCollectionSlug<S>>}` | SitemapSortField<DataFromCollectionSlug<S>>
}

export type SitemapFieldsOptions = {
  /** Add the "Exclude from sitemap" checkbox. @default false */
  exclude?: boolean
  /** Add the priority number field. @default false */
  priority?: boolean
  /** Add the change frequency select. @default false */
  changefreq?: boolean
  /**
   * Where the fields go. `'sidebar'` puts them in the document sidebar, `'first'` and `'last'` at the start or end
   * of the main fields, and `{ after }` or `{ before }` next to a field by its path. Paths go through groups,
   * arrays and named tabs, for example `{ after: 'meta.description' }` inside the SEO plugin's `meta` group.
   * @default 'sidebar'
   */
  position?: InsertPosition
}

export type SitemapCollectionSource<S extends CollectionSlug = CollectionSlug> = {
  type: 'collection'
  /** Slug of the collection to list. The same collection may be listed more than once, with different names. */
  collection: S
  /** Used in file names: `<name>-1.xml`. Letters, digits, `-` and `_`. @default the collection slug */
  name?: string
  /**
   * Page URL. A string is a pattern with `:field` placeholders filled from the document, for example `/blog/:slug`
   * or `/:category.slug/:slug`. `:locale` is the locale code, and `:{field}` ends a placeholder before more text,
   * as in `/:{slug}.html`. A function gets the document and returns the URL. A relative result is joined to
   * `siteUrl`, an absolute one is used as is. `null`, `undefined` or an empty placeholder leaves the document out.
   * @default '/:slug'
   */
  url?:
    | string
    | ((
        args: SitemapDocArgs<S> & { siteUrl: string; tenant?: SitemapTenant },
      ) => MaybePromise<null | string | undefined>)
  /** Locales to write this collection for. @default every locale */
  locales?: string[]
  /**
   * Field that holds the last change date, `false` to leave `<lastmod>` out, or a function that returns the date.
   * @default 'updatedAt'
   */
  lastmod?: ((args: SitemapDocArgs<S>) => MaybePromise<Date | null | string | undefined>) | false | string
  /** Static value or function of the document. A value an editor sets in the sitemap fields wins. @default none */
  changefreq?: FromDoc<Changefreq | undefined, S>
  /** Between 0 and 1. Static value or function of the document. A value an editor sets in the sitemap fields wins. @default none */
  priority?: FromDoc<number | undefined, S>
  /**
   * Image field paths, functions that return image URLs, or both. Only the first 1000 per page are kept.
   * @example images: ['cover', 'gallery.image', ({ doc }) => doc.photos.map((photo) => photo.src)]
   * @default none
   */
  images?: (SitemapImageField | SitemapImagesFn<S> | string)[] | SitemapImagesFn<S>
  /**
   * Add per-document sitemap fields. `true` adds exclude, priority and change frequency. An object adds only the keys
   * set to `true` and can choose where they go. One field shows on its own, two or more in a "Sitemap" group.
   * The plugin reads fields built by `sitemapFields()` wherever they are, so leave this out when you place them yourself.
   * Only one source of a collection may set it.
   * @example fields: { exclude: true }
   * @example fields: { exclude: true, priority: true, position: { after: 'meta.description' } }
   * @default false
   */
  fields?: boolean | SitemapFieldsOptions
  /** Options passed to `payload.find` when loading documents. */
  query?: SitemapCollectionQuery<S>
}

/** URL lists that do not come from one collection, such as filter pages or external data. */
export type SitemapCustomSource = {
  type: 'custom'
  /** Used in file names: `<name>-1.xml`. Letters, digits, `-` and `_`. */
  name: string
  /** Locales to call `entries` for. @default every locale */
  locales?: string[]
  /** Called once per locale (once with no locale when localization is off), and once per tenant with `tenants`. */
  entries: (args: {
    locale?: string
    req: PayloadRequest
    siteUrl: string
    tenant?: SitemapTenant
  }) => AsyncIterable<SitemapEntry> | Iterable<SitemapEntry> | Promise<Iterable<SitemapEntry>>
}

/** Static pages. A `url` can be a path relative to `siteUrl`. */
export type SitemapStaticSource = {
  type: 'static'
  /** Used in file names: `<name>-1.xml`. Letters, digits, `-` and `_`. @default 'static' */
  name?: string
  /** A list, or a function called once per locale. The same URL from two locales is written once. */
  entries: SitemapStaticEntries
}

/** One file group of the sitemap. Files are listed in the index in the order of the sources. */
export type SitemapSource =
  | { [S in CollectionSlug]: SitemapCollectionSource<S> }[CollectionSlug]
  | SitemapCustomSource
  | SitemapStaticSource

/** A static page. `url` can be a path relative to `siteUrl`. */
export type SitemapStaticEntry = SitemapEntry

export type SitemapStaticEntries =
  | ((args: {
      locale?: string
      req: PayloadRequest
      siteUrl: string
      tenant?: SitemapTenant
    }) => MaybePromise<SitemapStaticEntry[]>)
  | SitemapStaticEntry[]

export type SitemapFilenameArgs = {
  /** `index` for a sitemap index, `file` for a child sitemap. */
  kind: 'file' | 'index'
  /** The locale, only with `output.splitLocales`. */
  locale?: string
  /** Number of the file within its source, from 1. Only for `file`. */
  part?: number
  /** Name of the source. Only for `file`. */
  source?: string
  /** The tenant, with `tenants`. */
  tenant?: SitemapTenant
}

export type SitemapOutputOptions = {
  /** URLs per file. Files also roll over before 50 MB. @default 50000 */
  maxUrlsPerFile?: number
  /**
   * Name of a generated file. May contain "/" for folders. Each part of the path: letters, digits, ".", "-", "_";
   * ends in ".xml". A file must be in the folder of its index or below. Every name must be unique.
   * @example filename: ({ kind, locale, part, source }) => kind === 'index' ? `${locale}/sitemap.xml` : `${locale}/${source}-${part}.xml`
   * @default index `sitemap[-<tenant id>][-<locale>].xml`, file `[<tenant id>-][<locale>-]<source>-<part>.xml`
   */
  filename?: (args: SitemapFilenameArgs) => string
  /**
   * Public URL of a file, written into the index for child sitemaps.
   * @default `${siteUrl}/sitemaps/${filename}`
   */
  fileUrl?: (args: { filename: string; locale?: string; siteUrl: string; tenant?: SitemapTenant }) => string
  /** Add hreflang alternates and `x-default` when localization has more than one locale. @default true */
  hreflang?: boolean
  /** Write one sitemap index per locale, for sites with one domain per locale. @default false */
  splitLocales?: boolean
}

/** Changes to a collection the plugin adds. `fields` gets the plugin's fields and returns the new list. */
export type CollectionOverride = Partial<Omit<CollectionConfig, 'fields'>> & {
  fields?: (args: { defaultFields: Field[] }) => Field[]
}

export type SitemapTenantsOptions = {
  /** Slug of the tenants collection. @default 'tenants' */
  collection?: CollectionSlug
  /** Name of the tenant relationship field on documents. @default 'tenant' */
  field?: string
  /**
   * Filter for the tenants that get a sitemap, for example `{ active: { equals: true } }`. Tenants with drafts always
   * also get `_status: published`.
   */
  where?: Where
}

export type SitemapStorageOptions = {
  /**
   * Changes to the collection the plugin creates for the files, such as `slug`, `access`, `admin` or `upload`.
   * Without `upload` it is an upload collection: configure any storage adapter for it. With `upload` it keeps only
   * the file list, and `collection.upload` cannot be set.
   * @default { slug: 'sitemap-files' }
   */
  collection?: CollectionOverride
  /**
   * Store the files in your own place, such as an S3 or R2 bucket, Bunny Storage or a folder on disk, instead of
   * the upload collection. The files collection then keeps only the file list.
   * @example upload: async ({ body, contentType, filename }) => {
   *   await bucket.put(`seo/${filename}`, body, { contentType })
   *   return { url: `https://cdn.example.com/seo/${filename}` }
   * }
   */
  upload?: SitemapUpload
  /**
   * Remove an old version of a file from your own storage, or a file a run no longer writes, for example `posts-3.xml`
   * after the posts fit in two files. Needs `upload`. Without it, old files stay in your storage, but the endpoints
   * stop serving them.
   * @example delete: async ({ filename }) => bucket.delete(`seo/${filename}`)
   */
  delete?: SitemapDelete
}

export type SitemapPublishOptions = {
  /**
   * Writes a file to its public key, for example on a CDN bucket. Called after the endpoints switch to the new files:
   * first every changed child sitemap, then the changed indexes. `filename` is the name from `output.filename`,
   * without hash. If it throws, the run is marked failed and the next run writes the files again.
   * @example put: ({ body, contentType, filename }) => bucket.put(`sitemaps/${filename}`, body, { contentType })
   */
  put: (args: { body: Buffer; contentType: string; filename: string; req: PayloadRequest }) => MaybePromise<unknown>
  /**
   * Removes a public file the newest run no longer writes. Without it those files stay, but no index lists them.
   * If it throws, the error is logged and the run goes on.
   * @default none
   */
  delete?: (args: { filename: string; req: PayloadRequest }) => MaybePromise<unknown>
}

export type SitemapRegenerateOptions = {
  /** Wait this long after the first change, so a burst of edits produces one run. @default 300000 */
  delay?: number
  /** More collections whose changes trigger a run, for example ones read by `sources`. @default [] */
  collections?: CollectionSlug[]
  /** Globals whose changes trigger a run. @default [] */
  globals?: GlobalSlug[]
}

export type SitemapJobsOptions = {
  /** Regenerate after changes to listed collections. `false` turns it off. @default { delay: 300000 } */
  regenerate?: false | SitemapRegenerateOptions
  /** Cron for scheduled runs, for example `0 3 * * *`. Needs a jobs runner that handles schedules. */
  schedule?: string
  /** Jobs queue for the task. @default 'default' */
  queue?: string
}

export type SitemapAdminOptions = {
  /**
   * Who can open the Sitemap page and widget, read the status and start a run, also through
   * `POST /api/sitemap/generate`. Replaces the default check.
   * @default users of the admin user collection (`config.admin.user`)
   */
  access?: SitemapAccess
  /** Add the Sitemap page at `/admin/sitemap` and its link in the nav. @default true */
  view?: boolean
  /** Add the Sitemap widget to the dashboard "Add +" list. @default true */
  widget?: boolean
}

/**
 * Stores one generated file and returns its URL. Called only for files whose content changed since the last run.
 * `filename` ends with a hash of the content, so each version gets a new name. The plugin endpoints read the file
 * from the returned `url`. A relative URL is resolved against the Payload `serverURL`; without it, the run fails.
 * If it throws, the run fails and the previous files stay listed.
 */
export type SitemapUpload = (args: {
  /** The file content. */
  body: Buffer
  /** `application/xml; charset=utf-8`. */
  contentType: string
  /**
   * The public name with a content hash, for example `sitemap.3f2a9c1b7e4d.xml` or `posts-1.8b0e2d4a6c1f.xml`.
   * Folders from `output.filename` are kept: `en/posts-1.8b0e2d4a6c1f.xml`.
   */
  filename: string
  req: PayloadRequest
}) => MaybePromise<{ url: string }>

/**
 * Removes one old file: an old version of a changed file, or a file this run no longer writes. Called after the
 * endpoints switch to the new files, and for the files a failed run already uploaded. If it throws, the error is
 * logged and the run goes on.
 */
export type SitemapDelete = (args: {
  /** The same name `upload` got, with the content hash. */
  filename: string
  req: PayloadRequest
  /** The URL `upload` returned for this file. */
  url: string
}) => MaybePromise<unknown>

export type SitemapAccess = (args: { req: PayloadRequest }) => MaybePromise<boolean>

export type SitemapPluginOptions = {
  /**
   * Public site address without a trailing slash. A function gets the locale, `req` and, with `tenants`, the tenant
   * document. It may be async, for one domain per locale, a domain per tenant or a URL kept in a global. It is called
   * once per locale, tenant and run.
   */
  siteUrl: string | ((args: { locale?: string; req: PayloadRequest; tenant?: SitemapTenant }) => MaybePromise<string>)
  /**
   * What the sitemap lists: collections, custom URL lists and static pages, each with a `type`. The index lists the
   * files in this order.
   * @example sources: [{ type: 'static', entries: [{ url: '/' }] }, { type: 'collection', collection: 'posts', url: '/blog/:slug' }]
   * @default []
   */
  sources?: SitemapSource[]
  /** How the files are named and written. */
  output?: SitemapOutputOptions
  /** Where the files are stored. */
  storage?: SitemapStorageOptions
  /** Also write every file to a stable public place, for example a CDN bucket. Needs `output.fileUrl`. @default none */
  publish?: SitemapPublishOptions
  /**
   * When generation runs. `false` adds no task and no hooks: start runs from the Sitemap page,
   * `POST /api/sitemap/generate` or `generateSitemap(req)`.
   * @default { regenerate: { delay: 300000 } }
   */
  jobs?: false | SitemapJobsOptions
  /**
   * One sitemap per tenant, for sites built with `@payloadcms/plugin-multi-tenant`. Every tenant gets its own index
   * and files. Collections with the tenant field list only that tenant's documents, collections without it are listed
   * for every tenant. `siteUrl`, source `entries`, a collection `url` function, `output.filename` and `output.fileUrl`
   * get the tenant document. `where` picks the tenants, and draft tenants are skipped. `true` uses the plugin's
   * defaults.
   * @example tenants: true, siteUrl: ({ tenant }) => `https://${tenant?.domain}`
   * @default false
   */
  tenants?: boolean | SitemapTenantsOptions
  /** Sitemap page, dashboard widget and who can use them. */
  admin?: SitemapAdminOptions
  /**
   * With `false`, keep the files and locks collections, status global and sitemap fields in the schema, and the task
   * when `jobs` is on, but add no hooks or endpoints, and the task does nothing.
   * @default true
   */
  enabled?: boolean
  /**
   * Anonymous usage telemetry: plugin, Payload and Node versions and the features in use. On by default.
   * It never sends secrets, IP addresses, keys, file names, URLs or collection names.
   * The first run logs a notice.
   *
   * Off when `payload.config.telemetry` is `false`, when `DO_NOT_TRACK` or `SITEMAP_TELEMETRY_DISABLED`
   * is set, in CI or with `NODE_ENV=test`. Set `false` to turn it off. Pass `{ url }` to use your own collector.
   *
   * @see https://github.com/maximseshuk/payload-plugin-sitemap#telemetry
   * @default true
   */
  telemetry?:
    | boolean
    | {
        /**
         * Collector URL that receives the telemetry report.
         * @default the plugin's public collector
         */
        url?: string
      }
}
