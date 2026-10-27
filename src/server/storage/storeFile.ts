import { createHash } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { fail } from '@/server/options/fail.js'
import { XML_TYPE } from '@/shared/constants.js'
import type { ResolvedOptions, SitemapFile } from '@/shared/types/index.js'

import { removeFiles } from './removeFiles.js'
import { bufferBody, dropBody } from './runBuffer.js'
import type { StoredFile } from './storedFiles.js'
import { text, toFile, toStored } from './storedFiles.js'

const HTTP = /^https?:\/\//

export type FileMeta = {
  kind: 'file' | 'index'
  lastmod?: string
  locale?: string
  source?: string
  tenant?: string
  url?: string
  urls: number
}

export type FileGroup = { locale?: string; source: string; tenant?: string }

export type Store = {
  buffer?: string
  created: StoredFile[]
  hidden: StoredFile[]
  kept: Set<number | string>
  live: Map<string, StoredFile>
  run: number
  stale: StoredFile[]
}

export const storeFile = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  store: Store,
  filename: string,
  body: Buffer,
  meta: FileMeta,
): Promise<SitemapFile> => {
  const hash = createHash('sha256').update(body).digest('hex')
  const file = { filename, hash, size: body.length, ...meta }
  const previous = store.live.get(filename)
  const args = { collection: options.storage.collection, depth: 0, overrideAccess: true, req }
  if (store.buffer && previous?.published !== hash) await bufferBody(store.buffer, filename, body)
  if (previous?.hash === hash) {
    store.kept.add(previous.id)
    if (!options.storage.enabled && meta.url && meta.url !== previous.url) {
      await req.payload.update({ ...args, data: { url: meta.url }, id: previous.id })
      return { ...file, url: meta.url }
    }
    return { ...file, url: previous.url }
  }

  const base = options.storage.upload ? filename : filename.replaceAll('/', '_')
  const stored = `${base.replace(/\.xml$/, '')}.${hash.slice(0, 12)}.xml`
  const data = {
    hash,
    kind: meta.kind,
    lastmod: meta.lastmod,
    locale: meta.locale,
    name: filename,
    run: store.run,
    size: body.length,
    urls: meta.urls,
    ...(meta.source ? { source: meta.source } : {}),
    ...(meta.tenant ? { tenant: meta.tenant } : {}),
    ...(previous?.published === hash ? { published: hash } : {}),
  }

  if (!options.storage.enabled) {
    const doc = await req.payload.create({ ...args, data: { ...data, filename, url: meta.url } })
    store.created.push(toStored(doc))
    return { ...file, url: meta.url! }
  }

  if (options.storage.upload) {
    const result = await options.storage.upload({ body, contentType: XML_TYPE, filename: stored, req })
    if (typeof result?.url !== 'string' || !result.url) {
      fail(`storage.upload must return { url } with a non-empty string for ${filename}`)
    }
    try {
      if (!HTTP.test(result.url) && !req.payload.config.serverURL) {
        fail(`storage.upload returned the relative URL ${result.url} for ${filename}, set serverURL`)
      }
      const doc = await req.payload.create({ ...args, data: { ...data, filename: stored, url: result.url } })
      store.created.push(toStored(doc))
    } catch (err) {
      try {
        await options.storage.delete?.({ filename: stored, req, url: result.url })
      } catch (deleteErr) {
        req.payload.logger.error({ err: deleteErr, msg: `sitemap: could not delete ${stored} through storage.delete` })
      }
      throw err
    }
    return { ...file, url: result.url }
  }

  const doc = await req.payload.create({
    ...args,
    data,
    file: { data: body, mimetype: 'application/xml', name: stored, size: body.length },
  })
  store.created.push(toStored(doc))
  return { ...file, url: doc.url as string }
}

export const keepFiles = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  store: Store,
  { locale, source, tenant }: FileGroup,
  discard: string[],
): Promise<SitemapFile[] | undefined> => {
  const previous = [...store.live.values()].filter(
    ({ doc, kind }) =>
      kind === 'file' && text(doc.source) === source && text(doc.locale) === locale && text(doc.tenant) === tenant,
  )
  if (previous.length === 0) return undefined
  if (store.buffer && previous.some(({ hash, published }) => published !== hash)) return undefined
  const names = new Set(discard)
  const failed: StoredFile[] = []
  const rest: StoredFile[] = []
  for (const created of store.created) (names.has(created.name) ? failed : rest).push(created)
  if (!(await removeFiles(req, options, failed))) fail(`could not delete the files of the failed source ${source}`)
  store.created = rest
  if (store.buffer) for (const name of discard) await dropBody(store.buffer, name)
  for (const { id } of previous) store.kept.add(id)
  return previous
    .map(({ doc }) => toFile(doc))
    .toSorted((a, b) => a.filename.localeCompare(b.filename, 'en', { numeric: true }))
}
