import { MAX_IMAGES } from '@/shared/constants.js'
import type { Changefreq, SitemapEntry } from '@/shared/types/index.js'

const CHANGEFREQ = new Set<Changefreq>(['always', 'daily', 'hourly', 'monthly', 'never', 'weekly', 'yearly'])

export const URLSET_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
export const URLSET_CLOSE = '</urlset>\n'

const ESCAPES: Record<string, string> = { '"': '&quot;', '&': '&amp;', "'": '&apos;', '<': '&lt;', '>': '&gt;' }

export const escapeXML = (value: string): string => value.replace(/["&'<>]/g, (char) => ESCAPES[char]!)

export const normalizeURL = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export const toLastmod = (value: unknown): string | undefined => {
  if (!(value instanceof Date) && typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export const urlEntry = (entry: SitemapEntry): { lastmod?: string; xml: string } | undefined => {
  const loc = normalizeURL(entry.url)
  if (!loc) return undefined

  const lastmod = toLastmod(entry.lastmod)
  const lines = [`  <url>`, `    <loc>${escapeXML(loc)}</loc>`]
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`)
  if (entry.changefreq && CHANGEFREQ.has(entry.changefreq))
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`)
  if (typeof entry.priority === 'number' && entry.priority >= 0 && entry.priority <= 1) {
    lines.push(`    <priority>${entry.priority}</priority>`)
  }
  for (const { href, hreflang } of entry.alternates ?? []) {
    const url = normalizeURL(href)
    if (url && hreflang) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${escapeXML(hreflang)}" href="${escapeXML(url)}"/>`)
    }
  }
  for (const image of (entry.images ?? []).slice(0, MAX_IMAGES)) {
    const url = normalizeURL(image)
    if (url) lines.push(`    <image:image><image:loc>${escapeXML(url)}</image:loc></image:image>`)
  }
  lines.push(`  </url>\n`)

  return { lastmod, xml: lines.join('\n') }
}

export const sitemapIndex = (files: { lastmod?: string; url: string }[]): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  files
    .map(
      ({ lastmod, url }) =>
        `  <sitemap>\n    <loc>${escapeXML(url)}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
        `  </sitemap>\n`,
    )
    .join('') +
  '</sitemapindex>\n'
