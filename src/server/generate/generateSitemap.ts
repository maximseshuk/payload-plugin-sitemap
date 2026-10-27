import type { PayloadRequest } from 'payload'

import { fail, SitemapError } from '@/server/options/fail.js'
import type { FileGroup, FileMeta } from '@/server/storage/storeFile.js'
import { MAX_URLS } from '@/shared/constants.js'
import { folderOf, isFilename } from '@/shared/filename.js'
import type {
  ResolvedOptions,
  ResolvedSource,
  SitemapEntry,
  SitemapFile,
  SitemapFilenameArgs,
  SitemapTenant,
} from '@/shared/types/index.js'

import type { Chunk } from './chunker.js'
import { chunker } from './chunker.js'
import type { Locales } from './locales.js'
import { localesOf } from './locales.js'
import type { SiteUrls } from './sourceEntries.js'
import { sourceEntries } from './sourceEntries.js'
import { tenantsOf } from './tenants.js'
import { sitemapIndex, toLastmod, urlEntry } from './xml.js'

export type StoreFile = (filename: string, body: Buffer, meta: FileMeta) => Promise<SitemapFile>

export type KeepFiles = (group: FileGroup, discard: string[]) => Promise<SitemapFile[] | undefined>

class SourceError extends Error {}

async function* sourceErrors<T>(entries: AsyncIterable<T>): AsyncGenerator<T> {
  try {
    yield* entries
  } catch (err) {
    if (err instanceof SitemapError) throw err
    throw new SourceError('sitemap source failed', { cause: err })
  }
}

const checkFolder = (file: string, index: string): void => {
  if (!file.startsWith(folderOf(index))) {
    fail(`output.filename: ${file} must be in the folder of its index ${index}`)
  }
}

const checkUrl = (url: string, indexUrl: string): void => {
  const child = new URL(url)
  const index = new URL(indexUrl)
  if (child.origin !== index.origin || !child.pathname.startsWith(folderOf(index.pathname))) {
    fail(`publish needs ${url} in the folder of its index ${indexUrl} or below, check output.fileUrl`)
  }
}

async function* groupEntries(
  req: PayloadRequest,
  options: ResolvedOptions,
  source: ResolvedSource,
  codes: (string | undefined)[],
  locales: Locales,
  site: SiteUrls,
  tenant: SitemapTenant | undefined,
): AsyncGenerator<SitemapEntry> {
  const seen = new Set<string>()
  for (const code of codes) {
    if (code && source.locales && !source.locales.includes(code)) continue
    for await (const entry of sourceEntries(req, options, source, code, locales, site, tenant)) {
      if (source.kind === 'static') {
        if (seen.has(entry.url)) continue
        seen.add(entry.url)
      }
      yield entry
    }
  }
}

export const generateSitemap = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  storeFile: StoreFile,
  keepFiles: KeepFiles,
): Promise<SitemapFile[]> => {
  const publishOnly = !options.storage.enabled
  const locales = localesOf(req)
  const codes = [...new Set([...locales.all, locales.defaultLocale])]
  const tenants = await tenantsOf(req, options)
  const sites: SiteUrls[] = []
  for (const tenant of tenants) {
    const urls = new Map(
      await Promise.all(
        codes.map(async (code) => [code, await options.siteUrl({ locale: code, req, tenant })] as const),
      ),
    )
    sites.push((code) => urls.get(code)!)
  }
  const split = options.output.splitLocales && Boolean(locales.defaultLocale)
  const groups = split
    ? locales.all.map((code) => ({ locale: code, locales: [code] }))
    : [{ locale: locales.defaultLocale, locales: locales.all }]
  if (split) {
    for (const [position, site] of sites.entries()) {
      const urls = groups.map(({ locale }) => site(locale))
      const shared = urls.find((url, index) => urls.indexOf(url) !== index)
      const tenant = tenants[position] ? ` of tenant ${tenants[position].id}` : ''
      if (shared) {
        fail(`output.splitLocales needs a different siteUrl per locale${tenant}, ${shared} is used by more than one`)
      }
    }
  }
  const nameOf = (args: SitemapFilenameArgs): string => {
    const name = options.output.filename(args)
    if (!isFilename(name)) {
      const what = args.kind === 'index' ? 'an index' : `part ${args.part} of ${args.source}`
      fail(
        `output.filename returned ${JSON.stringify(name)} for ${what}. Use letters, digits, ".", "-", "_" and "/" folders, ending in .xml`,
      )
    }
    return name
  }
  const names = new Set<string>()
  const claim = (name: string): string => {
    if (names.has(name)) fail(`two sitemap files can get the name ${name}, rename a source or change output.filename`)
    names.add(name)
    return name
  }
  for (const tenant of tenants) {
    for (const group of groups) {
      const locale = split ? group.locale : undefined
      const index = claim(nameOf({ kind: 'index', locale, tenant }))
      for (const { name: source } of options.sources) {
        checkFolder(claim(nameOf({ kind: 'file', locale, part: 1, source, tenant })), index)
      }
    }
  }
  names.clear()
  const store = (filename: string, body: Buffer | string, meta: FileMeta) =>
    storeFile(claim(filename), Buffer.from(body), meta)
  const files: SitemapFile[] = []

  for (const [position, tenant] of tenants.entries()) {
    const site = sites[position]!
    const key = tenant ? String(tenant.id) : undefined
    for (const group of groups) {
      const siteUrl = site(group.locale)
      const locale = split ? group.locale : undefined
      const indexName = nameOf({ kind: 'index', locale, tenant })
      const fileUrl = (filename: string) => options.output.fileUrl({ filename, locale: group.locale, siteUrl, tenant })
      const children: SitemapFile[] = []

      for (const source of options.sources) {
        const chunks = chunker(options.output.maxUrls, options.output.maxBytes)
        const stored: SitemapFile[] = []
        let part = 0
        const save = async (chunk: Chunk | undefined) => {
          if (!chunk) return
          part++
          const filename = nameOf({ kind: 'file', locale, part, source: source.name, tenant })
          checkFolder(filename, indexName)
          const meta: FileMeta = {
            kind: 'file',
            lastmod: chunk.lastmod,
            locale,
            source: source.name,
            tenant: key,
            urls: chunk.urls,
            ...(publishOnly && { url: fileUrl(filename) }),
          }
          stored.push(await store(filename, chunk.body, meta))
        }

        const entries = groupEntries(req, options, source, group.locales, locales, site, tenant)
        try {
          for await (const entry of source.onError === 'keep' ? sourceErrors(entries) : entries) {
            const built = urlEntry(entry)
            if (!built) {
              req.payload.logger.warn({
                msg: `sitemap: skipped "${String(entry.url)}" from ${source.name}, not an absolute URL`,
              })
              continue
            }
            await save(chunks.add(built.xml, built.lastmod))
          }
          await save(chunks.end())
          children.push(...stored)
        } catch (err) {
          if (!(err instanceof SourceError)) throw err
          const discard = stored.map(({ filename }) => filename)
          for (const name of discard) names.delete(name)
          const previous = await keepFiles({ locale, source: source.name, tenant: key }, discard)
          if (!previous) throw err.cause
          req.payload.logger.warn({
            err: err.cause,
            msg: `sitemap: source ${source.name} failed, kept its files from the last run`,
          })
          for (const file of previous) checkFolder(claim(file.filename), indexName)
          children.push(...previous)
        }
      }

      files.push(...children)
      if (children.length === 0) continue
      if (children.length > MAX_URLS) {
        fail(`${children.length} sitemap files exceed the index limit of ${MAX_URLS}, raise output.maxUrlsPerFile`)
      }

      const indexUrl = options.publish ? fileUrl(indexName) : undefined
      const index = sitemapIndex(
        children.map((child) => {
          const { filename, lastmod } = child
          const url = publishOnly ? child.url : fileUrl(filename)
          if (indexUrl) checkUrl(url, indexUrl)
          return { lastmod, url }
        }),
      )
      const lastmod = toLastmod(children.map((child) => child.lastmod ?? '').reduce((a, b) => (a > b ? a : b)))
      files.push(
        await store(indexName, index, {
          kind: 'index',
          lastmod,
          locale,
          tenant: key,
          urls: 0,
          ...(publishOnly && { url: indexUrl }),
        }),
      )
    }
  }

  return files
}
