import { randomInt } from 'node:crypto'

import type { PayloadRequest, Where } from 'payload'

import type { StoredStatus } from '@/server/status/statusStore.js'
import type { ResolvedOptions, SitemapFile } from '@/shared/types/index.js'

export type StoredFile = {
  doc: Record<string, unknown> & { id: number | string }
  filename: string
  hash: string
  id: number | string
  kind: 'file' | 'index'
  name: string
  prefix?: string
  published?: string
  run: number
  url: string
}

type Doc = Record<string, unknown>

const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

export const toStored = (doc: Doc): StoredFile => ({
  doc: doc as StoredFile['doc'],
  filename: String(doc.filename),
  hash: String(doc.hash),
  id: doc.id as number | string,
  kind: doc.kind === 'index' ? 'index' : 'file',
  name: String(doc.name),
  prefix: text(doc.prefix),
  published: text(doc.published),
  run: Number(doc.run ?? 0),
  url: String(doc.url),
})

export const toFile = (doc: Doc): SitemapFile => ({
  filename: String(doc.name),
  hash: String(doc.hash),
  kind: doc.kind === 'index' ? 'index' : 'file',
  lastmod: text(doc.lastmod),
  locale: text(doc.locale),
  size: Number(doc.size ?? 0),
  source: text(doc.source),
  tenant: text(doc.tenant),
  url: String(doc.url),
  urls: Number(doc.urls ?? 0),
})

const liveRuns = ({ previousRun, run }: StoredStatus) => ({ previousRun: previousRun ?? run ?? 0, run: run ?? 0 })

export const liveWhere = (status: StoredStatus): Where => {
  const { previousRun, run } = liveRuns(status)
  return { or: [{ run: { equals: run } }, { run: { less_than_equal: previousRun } }] }
}

export const storedFiles = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  status: StoredStatus,
): Promise<{ hidden: StoredFile[]; live: Map<string, StoredFile>; run: number; stale: StoredFile[] }> => {
  const { previousRun, run } = liveRuns(status)
  const { docs } = await req.payload.find({
    collection: options.storage.collection,
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    req,
    sort: '-run',
  })
  const files = docs.map(toStored)
  const live = new Map<string, StoredFile>()
  const hidden: StoredFile[] = []
  const stale: StoredFile[] = []
  for (const file of files) {
    if (file.run !== run && file.run > previousRun) hidden.push(file)
    else if (live.has(file.name)) stale.push(file)
    else live.set(file.name, file)
  }
  const next = Math.max(run + 1, (files[0]?.run ?? 0) + 1, Date.now() * 1000 + randomInt(1000))
  return { hidden, live, run: next, stale }
}
