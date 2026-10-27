import type { Endpoint } from 'payload'

import { queueRegeneration } from '@/server/jobs/queue.js'
import { runGeneration } from '@/server/jobs/runGeneration.js'
import { BUSY } from '@/server/lock/runLock.js'
import { sitemapFiles } from '@/server/status/sitemapFiles.js'
import { sitemapStatus } from '@/server/status/sitemapStatus.js'
import { FILES_LIMIT } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { filesOperation, generateOperation, statusOperation } from './openapi.js'
import { param } from './param.js'

const forbidden = () => Response.json({ message: 'Forbidden' }, { status: 403 })

const generateEndpoint = (options: ResolvedOptions): Endpoint => ({
  custom: { openapi: generateOperation },
  handler: async (req) => {
    if (!(await options.admin.access({ req }))) return forbidden()
    if (options.jobs) {
      try {
        const id = await queueRegeneration(req, options, 0)
        return Response.json(id === undefined ? {} : { id }, { status: 202 })
      } catch (err) {
        req.payload.logger.error({ err, msg: 'sitemap: could not queue a run' })
        return Response.json({ message: 'sitemap: could not queue a run, see the server log' }, { status: 500 })
      }
    }
    try {
      const files = await runGeneration(req, options)
      return Response.json({ files: files.length, urls: files.reduce((sum, file) => sum + file.urls, 0) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ message }, { status: message.endsWith(BUSY) ? 409 : 500 })
    }
  },
  method: 'post',
  path: '/sitemap/generate',
})

export const adminEndpoints = (options: ResolvedOptions): Endpoint[] => [
  {
    custom: { openapi: statusOperation },
    handler: async (req) => {
      if (!(await options.admin.access({ req }))) return forbidden()
      return Response.json(await sitemapStatus(req, options), { headers: { 'Cache-Control': 'no-store' } })
    },
    method: 'get',
    path: '/sitemap/status',
  },
  {
    custom: { openapi: filesOperation },
    handler: async (req) => {
      if (!(await options.admin.access({ req }))) return forbidden()
      const page = Math.max(1, Math.trunc(Number(param(req, 'page') ?? 1)) || 1)
      const limit = Math.min(
        FILES_LIMIT,
        Math.max(1, Math.trunc(Number(param(req, 'limit') ?? FILES_LIMIT)) || FILES_LIMIT),
      )
      const group = req.query?.group
      const files = await sitemapFiles(req, options, {
        group: typeof group === 'string' ? group || null : undefined,
        groupBy: param(req, 'groupBy'),
        limit,
        locale: param(req, 'locale'),
        page,
        search: param(req, 'search'),
        sort: param(req, 'sort'),
        source: param(req, 'source'),
        tenant: param(req, 'tenant'),
      })
      return Response.json(files, { headers: { 'Cache-Control': 'no-store' } })
    },
    method: 'get',
    path: '/sitemap/files',
  },
  ...(options.endpoints.generate ? [generateEndpoint(options)] : []),
]
