import type { Endpoint, PayloadRequest, Where } from 'payload'

import { localesOf } from '@/server/generate/locales.js'
import { serveFile } from '@/server/storage/serveFile.js'
import { isFilename } from '@/shared/filename.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { fileOperation, indexOperation } from './openapi.js'
import { param } from './param.js'

const notFound = () => new Response('Not found', { headers: { 'Content-Type': 'text/plain' }, status: 404 })

const tenantWhere = (req: PayloadRequest, options: ResolvedOptions): Where[] => {
  const tenant = options.tenants ? param(req, 'tenant') : undefined
  return tenant ? [{ tenant: { equals: tenant } }] : []
}

const indexWhere = (req: PayloadRequest, options: ResolvedOptions): Where[] | undefined => {
  const tenant = tenantWhere(req, options)
  if (options.tenants && tenant.length === 0) return undefined
  const { all, defaultLocale } = localesOf(req)
  const requested = param(req, 'locale')
  const locale = requested && all.includes(requested) ? requested : defaultLocale
  return [
    { kind: { equals: 'index' } },
    ...tenant,
    ...(options.output.splitLocales && locale ? [{ locale: { equals: locale } }] : []),
  ]
}

const filenameOf = (req: PayloadRequest): string => {
  const value: unknown = req.routeParams?.filename
  return Array.isArray(value) ? value.join('/') : String(value ?? '')
}

export const fileEndpoints = (options: ResolvedOptions): Endpoint[] => [
  {
    custom: { openapi: indexOperation },
    handler: (req) => {
      const where = indexWhere(req, options)
      return where ? serveFile(req, options, where) : notFound()
    },
    method: 'get',
    path: '/sitemap.xml',
  },
  {
    custom: { openapi: fileOperation },
    handler: (req) => {
      const filename = filenameOf(req)
      if (!isFilename(filename)) return notFound()
      return serveFile(req, options, [{ name: { equals: filename } }, ...tenantWhere(req, options)])
    },
    method: 'get',
    path: '/sitemaps/:filename+',
  },
]
