import { describe, expect, it, vi } from 'vitest'

import { formatSize, relative, sortFiles } from '@/client/SitemapPanel/SitemapPanel.utils.js'
import { translations } from '@/shared/translations/index.js'

describe('panel', () => {
  it('lists index files first, then files by name with numbers in order', () => {
    const file = (filename: string, kind: 'file' | 'index' = 'file') => ({
      filename,
      hash: '',
      kind,
      size: 1,
      url: '',
      urls: 1,
    })
    const files = sortFiles([
      file('pages-10.xml'),
      file('pages-2.xml'),
      file('de/pages-1.xml'),
      file('sitemap.xml', 'index'),
      file('de/sitemap.xml', 'index'),
      file('static-1.xml'),
    ])
    expect(files.map(({ filename }) => filename)).toEqual([
      'de/sitemap.xml',
      'sitemap.xml',
      'de/pages-1.xml',
      'pages-2.xml',
      'pages-10.xml',
      'static-1.xml',
    ])
  })

  it('formats the time since a date in the next unit once it rounds up', () => {
    vi.useFakeTimers({ now: new Date('2026-06-01T00:00:00.000Z') })
    try {
      const before = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
      expect(relative(before(59.6), 'en')).toBe('1 minute ago')
      expect(relative(before(3599), 'en')).toBe('1 hour ago')
      expect(relative(before(86_399), 'en')).toBe('yesterday')
      expect(relative(before(170), 'en')).toBe('3 minutes ago')
      expect(relative(before(-30), 'en')).toBe('now')
    } finally {
      vi.useRealTimers()
    }
  })

  it('formats file sizes with the units of the admin language', () => {
    expect([512, 1331, 2_621_440].map((bytes) => formatSize(bytes, 'en'))).toEqual(['0.5 kB', '1.3 kB', '2.5 MB'])
    expect(formatSize(1331, 'de')).toBe('1,3 kB')
    for (const language of Object.keys(translations)) expect(() => formatSize(1331, language)).not.toThrow()
  })
})
