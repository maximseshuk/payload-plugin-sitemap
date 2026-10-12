import { afterEach, describe, expect, it, vi } from 'vitest'

import { sitemapProxy } from '@/site/sitemapProxy.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sitemapProxy', () => {
  it('maps site paths to the API and copies headers', async () => {
    const fetch = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response('<xml/>', { headers: { 'Content-Type': 'application/xml', 'Set-Cookie': 'x=1', ETag: '"a"' } }),
    )
    vi.stubGlobal('fetch', fetch)
    const proxy = sitemapProxy({ locale: () => 'de', serverUrl: 'https://cms.example.com/' })

    const response = await proxy(new Request('https://example.com/sitemap.xml'))
    expect(String(fetch.mock.calls[0]![0])).toBe('https://cms.example.com/api/sitemap.xml?locale=de')
    expect(response.headers.get('content-type')).toBe('application/xml')
    expect(response.headers.get('etag')).toBe('"a"')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).toBe('<xml/>')

    await proxy(new Request('https://example.com/sitemaps/de-pages-1.xml'))
    expect(String(fetch.mock.calls[1]![0])).toBe('https://cms.example.com/api/sitemaps/de-pages-1.xml')
    await proxy(new Request('https://example.com/sitemaps/de/blog/pages-1.xml'))
    expect(String(fetch.mock.calls[2]![0])).toBe('https://cms.example.com/api/sitemaps/de/blog/pages-1.xml')

    for (const path of ['/sitemaps/../secret', '/sitemaps/a b.xml', '/sitemaps/a.txt', '/sitemaps//a.xml']) {
      expect((await proxy(new Request(`https://example.com${path}`))).status).toBe(404)
    }
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('forwards If-None-Match and passes a 304 through', async () => {
    const fetch = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { headers: { 'Cache-Control': 'public, max-age=300', ETag: '"a"' }, status: 304 }),
    )
    vi.stubGlobal('fetch', fetch)
    const proxy = sitemapProxy({ serverUrl: 'https://cms.example.com' })
    const response = await proxy(
      new Request('https://example.com/sitemaps/en/pages-1.xml', { headers: { 'If-None-Match': '"a"' } }),
    )
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('if-none-match')).toBe('"a"')
    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe('"a"')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await response.text()).toBe('')
  })

  it('answers 502 when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const proxy = sitemapProxy({ serverUrl: 'https://cms.example.com' })
    expect((await proxy(new Request('https://example.com/sitemap.xml'))).status).toBe(502)
  })

  it('passes the tenant and blocks child files without one', async () => {
    const fetch = vi.fn<(input: URL) => Promise<Response>>(async () => new Response('<xml/>'))
    vi.stubGlobal('fetch', fetch)
    const proxy = sitemapProxy({
      serverUrl: 'https://cms.example.com',
      tenant: (request) => (new URL(request.url).hostname === 'gold.example.com' ? '1' : undefined),
    })

    await proxy(new Request('https://gold.example.com/sitemap.xml'))
    await proxy(new Request('https://gold.example.com/sitemaps/1-pages-1.xml'))
    await proxy(new Request('https://other.example.com/sitemap.xml'))
    expect((await proxy(new Request('https://other.example.com/sitemaps/2-pages-1.xml'))).status).toBe(404)
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      'https://cms.example.com/api/sitemap.xml?tenant=1',
      'https://cms.example.com/api/sitemaps/1-pages-1.xml?tenant=1',
      'https://cms.example.com/api/sitemap.xml',
    ])
  })
})
