import { describe, expect, it } from 'vitest'

import { escapeXML, normalizeURL, sitemapIndex, toLastmod, urlEntry } from '@/server/generate/xml.js'

const url = () => 'https://example.com/'

describe('xml', () => {
  it('escapes the five XML characters', () => {
    expect(escapeXML(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })

  it('normalizes URLs and rejects relative or non-http ones', () => {
    expect(normalizeURL('https://example.com/über uns?a=1&b=2')).toBe('https://example.com/%C3%BCber%20uns?a=1&b=2')
    expect(normalizeURL('/relative')).toBeUndefined()
    expect(normalizeURL('mailto:a@b.c')).toBeUndefined()
    expect(normalizeURL(undefined)).toBeUndefined()
  })

  it('writes lastmod as ISO 8601 and drops invalid dates', () => {
    expect(toLastmod('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z')
    expect(toLastmod(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
    expect(toLastmod('nope')).toBeUndefined()
  })

  it('writes a url entry with alternates and images', () => {
    const entry = urlEntry({
      alternates: [
        { href: 'https://example.com/en/a', hreflang: 'en' },
        { href: 'https://example.com/de/a', hreflang: 'de' },
      ],
      changefreq: 'daily',
      images: ['https://example.com/i.jpg?a=1&b=2', 'not a url'],
      lastmod: '2026-01-01',
      url: 'https://example.com/en/a?x=1&y=2',
      priority: 0.5,
    })
    expect(entry?.lastmod).toBe('2026-01-01T00:00:00.000Z')
    expect(entry?.xml).toBe(
      [
        '  <url>',
        '    <loc>https://example.com/en/a?x=1&amp;y=2</loc>',
        '    <lastmod>2026-01-01T00:00:00.000Z</lastmod>',
        '    <changefreq>daily</changefreq>',
        '    <priority>0.5</priority>',
        '    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/a"/>',
        '    <xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/a"/>',
        '    <image:image><image:loc>https://example.com/i.jpg?a=1&amp;b=2</image:loc></image:image>',
        '  </url>\n',
      ].join('\n'),
    )
  })

  it('drops invalid priority and changefreq and skips entries without a valid loc', () => {
    const entry = urlEntry({ changefreq: 'sometimes' as 'daily', url: 'https://example.com/', priority: 2 })
    expect(entry?.xml).not.toContain('priority')
    expect(entry?.xml).not.toContain('changefreq')
    expect(urlEntry({ url: '/relative' })).toBeUndefined()
  })

  it('keeps at most 1000 images', () => {
    const images = Array.from({ length: 1200 }, (_, index) => `https://example.com/${index}.jpg`)
    expect(urlEntry({ images, url: url() })?.xml.match(/<image:image>/g)).toHaveLength(1000)
  })

  it('writes a sitemap index', () => {
    expect(
      sitemapIndex([
        { lastmod: '2026-01-01T00:00:00.000Z', url: 'https://example.com/sitemaps/a-1.xml' },
        { url: 'https://example.com/sitemaps/b-1.xml' },
      ]),
    ).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <sitemap>\n    <loc>https://example.com/sitemaps/a-1.xml</loc>\n    <lastmod>2026-01-01T00:00:00.000Z</lastmod>\n  </sitemap>\n' +
        '  <sitemap>\n    <loc>https://example.com/sitemaps/b-1.xml</loc>\n  </sitemap>\n' +
        '</sitemapindex>\n',
    )
  })
})
