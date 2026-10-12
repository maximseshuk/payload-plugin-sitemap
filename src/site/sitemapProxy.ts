import { isFilename } from '@/shared/filename.js'

export type SitemapProxyOptions = {
  /** Address of the Payload server, for example `https://cms.example.com`. */
  serverUrl: string
  /** @default '/api' */
  apiRoute?: string
  /** Picks the locale for `/sitemap.xml` when the plugin uses `splitLocales`. */
  locale?: (request: Request) => string | undefined
  /**
   * Picks the tenant id for `/sitemap.xml` when the plugin uses `tenants`, for example from the host name. Child files
   * of other tenants then return 404.
   */
  tenant?: (request: Request) => string | undefined
}

const PASS = ['cache-control', 'content-type', 'etag', 'last-modified']
const PREFIX = '/sitemaps/'

const target = (pathname: string): string | undefined => {
  if (pathname === '/sitemap.xml') return pathname
  if (!pathname.startsWith(PREFIX)) return undefined
  return isFilename(pathname.slice(PREFIX.length)) ? pathname : undefined
}

export const sitemapProxy = ({ apiRoute = '/api', locale, serverUrl, tenant }: SitemapProxyOptions) => {
  const base = serverUrl.replace(/\/+$/, '') + apiRoute
  return async (request: Request): Promise<Response> => {
    const path = target(new URL(request.url).pathname)
    if (!path) return new Response('Not found', { status: 404 })

    const url = new URL(base + path)
    const id = tenant?.(request)
    const child = path.startsWith(PREFIX)
    if (child && tenant && !id) return new Response('Not found', { status: 404 })
    if (!child) {
      const code = locale?.(request)
      if (code) url.searchParams.set('locale', code)
    }
    if (id) url.searchParams.set('tenant', id)

    const match = request.headers.get('if-none-match')
    const upstream = await fetch(url, { headers: match ? { 'If-None-Match': match } : {}, redirect: 'follow' }).catch(
      () => undefined,
    )
    if (!upstream) return new Response('Bad gateway', { status: 502 })
    if (upstream.status !== 304 && !upstream.ok) {
      return new Response('Not found', { status: upstream.status === 404 ? 404 : 502 })
    }

    const headers = new Headers()
    for (const name of PASS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (upstream.status === 304) return new Response(null, { headers, status: 304 })
    return new Response(upstream.body, { headers, status: 200 })
  }
}
