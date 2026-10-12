import { describe, expect, it } from 'vitest'

import { chunker } from '@/server/generate/chunker.js'
import { urlEntry } from '@/server/generate/xml.js'

describe('chunker', () => {
  const xml = (index: number) => urlEntry({ url: `https://example.com/${index}` })!.xml

  it('rolls over at the URL limit and tracks the newest lastmod', () => {
    const chunks = chunker(2, Number.POSITIVE_INFINITY)
    expect(chunks.add(xml(1), '2026-01-02T00:00:00.000Z')).toBeUndefined()
    expect(chunks.add(xml(2), '2026-01-03T00:00:00.000Z')).toBeUndefined()
    const first = chunks.add(xml(3), '2026-01-01T00:00:00.000Z')
    expect(first?.urls).toBe(2)
    expect(first?.lastmod).toBe('2026-01-03T00:00:00.000Z')
    expect(first?.body.toString()).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    const last = chunks.end()
    expect(last?.urls).toBe(1)
    expect(last?.lastmod).toBe('2026-01-01T00:00:00.000Z')
    expect(chunks.end()).toBeUndefined()
  })

  it('rolls over before the byte limit', () => {
    const size = Buffer.byteLength(xml(1))
    const chunks = chunker(50_000, 400 + size * 2)
    const out = [1, 2, 3, 4, 5].map((index) => chunks.add(xml(index))).filter(Boolean)
    const all = [...out, chunks.end()]
    for (const chunk of all) expect(chunk!.body.length).toBeLessThanOrEqual(400 + size * 2)
    expect(all.reduce((sum, chunk) => sum + chunk!.urls, 0)).toBe(5)
  })
})
