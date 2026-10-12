import { createHash } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { fail } from '@/server/options/fail.js'
import { XML_TYPE } from '@/shared/constants.js'
import type { ResolvedOptions, SitemapFile } from '@/shared/types/index.js'

import type { StoredFile } from './storedFiles.js'
import { toStored } from './storedFiles.js'

const HTTP = /^https?:\/\//

export type FileMeta = {
  kind: 'file' | 'index'
  lastmod?: string
  locale?: string
  source?: string
  tenant?: string
  urls: number
}

export type Store = {
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
  if (previous?.hash === hash) {
    store.kept.add(previous.id)
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
  }
  const args = { collection: options.storage.collection, depth: 0, overrideAccess: true, req }

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
