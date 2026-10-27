import { openAsBlob } from 'node:fs'
import path from 'node:path'

import type { PayloadRequest } from 'payload'

import { fail } from '@/server/options/fail.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { bufferedBody } from './runBuffer.js'
import type { StoredFile } from './storedFiles.js'
import type { Store } from './storeFile.js'

const HTTP = /^https?:\/\//
const CONDITIONAL = /^(?:etag|range|if-.+)$/

const TIMEOUT = 30_000

const absolute = (req: PayloadRequest, url: string): string => {
  if (HTTP.test(url)) return url
  if (!req.payload.config.serverURL) return fail(`file URL ${url} is relative and serverURL is not set`)
  return new URL(url, req.payload.config.serverURL).href
}

const download = async (url: string): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const withoutConditions = (req: PayloadRequest): PayloadRequest => {
  const headers = new Headers(req.headers)
  for (const [name] of new Headers(headers)) if (CONDITIONAL.test(name)) headers.delete(name)
  return new Proxy(req, {
    get: (target, key) => {
      if (key === 'headers') return headers
      const value: unknown = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const directURL = (slug: string, file: StoredFile): string | undefined => {
  if (!HTTP.test(file.url)) return undefined
  const pathname = new URL(file.url).pathname.replace(/\/+$/, '')
  const route = `/${slug}/file/`
  const own = [file.filename, encodeURIComponent(file.filename)].some((name) => pathname.endsWith(route + name))
  return own ? undefined : file.url
}

export const readFile = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  file: StoredFile,
): Promise<Response | undefined> => {
  if (options.storage.upload) return download(absolute(req, file.url))

  const config = req.payload.collections[options.storage.collection]!.config
  const upload = config.upload || undefined
  const params = { collection: config.slug, filename: file.filename, operation: 'read' as const, prefix: file.prefix }
  const handlerReq = withoutConditions(req)
  for (const handler of upload?.handlers ?? []) {
    const response: unknown = await handler(handlerReq, { doc: file.doc, headers: new Headers(), params })
    if (!(response instanceof Response)) continue
    const location = response.headers.get('location')
    return response.status >= 300 && response.status < 400 && location ? download(absolute(req, location)) : response
  }

  const url = directURL(config.slug, file)
  if (url) return download(url)

  const dir = path.resolve(upload?.staticDir || config.slug)
  const filePath = path.resolve(dir, file.filename)
  if (!filePath.startsWith(dir + path.sep)) return undefined
  try {
    return new Response(await openAsBlob(filePath))
  } catch {
    return undefined
  }
}

export const readBody = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  store: Store,
  file: StoredFile,
): Promise<Buffer> => {
  if (store.buffer) {
    return (await bufferedBody(store.buffer, file.name)) ?? fail(`${file.name} is missing from the run buffer`)
  }
  const response = await readFile(req, options, file)
  if (!response?.ok) fail(`could not read ${file.name} to publish it`)
  return Buffer.from(await response!.arrayBuffer())
}
