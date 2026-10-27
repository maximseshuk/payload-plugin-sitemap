import type { PayloadRequest, Where } from 'payload'

import { readStatus } from '@/server/status/statusStore.js'
import { XML_TYPE } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { readFile } from './readFile.js'
import { liveWhere, toStored } from './storedFiles.js'

const CACHE = 'public, max-age=300'

const notFound = () => new Response('Not found', { headers: { 'Content-Type': 'text/plain' }, status: 404 })

const badGateway = () => new Response('Bad gateway', { headers: { 'Content-Type': 'text/plain' }, status: 502 })

export const serveFile = async (req: PayloadRequest, options: ResolvedOptions, where: Where[]): Promise<Response> => {
  const status = await readStatus(req)
  if (!status.run) return notFound()
  const { docs } = await req.payload.find({
    collection: options.storage.collection,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    sort: '-run',
    where: { and: [...where, liveWhere(status)] },
  })
  if (!docs[0]) return notFound()
  const file = toStored(docs[0])
  if (!options.storage.enabled) {
    return new Response(null, { headers: { 'Cache-Control': CACHE, Location: file.url }, status: 302 })
  }

  const etag = `"${file.hash}"`
  const headers = { 'Cache-Control': CACHE, ETag: etag }
  const match = req.headers.get('if-none-match')
  if (match && match.split(',').some((value) => value.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { headers, status: 304 })
  }

  const upstream = await readFile(req, options, file).catch((err: unknown) => {
    req.payload.logger.error({ err, msg: `sitemap: could not read ${file.name}` })
    return null
  })
  if (upstream === null) return badGateway()
  if (!upstream) return notFound()
  if (upstream.status !== 200 || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined)
    req.payload.logger.error({ msg: `sitemap: could not read ${file.name}, storage answered ${upstream.status}` })
    return badGateway()
  }
  return new Response(upstream.body, { headers: { ...headers, 'Content-Type': XML_TYPE }, status: 200 })
}
