import { describe, expect, it } from 'vitest'

import { sitemapExcludeField, sitemapFields } from '@/fields/index.js'

describe('field builders', () => {
  it('marks every field so the plugin can find it', () => {
    expect(sitemapFields().map((field) => [(field as { name: string }).name, field.custom])).toEqual([
      ['sitemapExclude', { sitemap: 'exclude' }],
      ['sitemapPriority', { sitemap: 'priority' }],
      ['sitemapChangefreq', { sitemap: 'changefreq' }],
    ])
    expect(sitemapFields({ changefreq: true }).map((field) => (field as { name: string }).name)).toEqual([
      'sitemapChangefreq',
    ])
    const [, priority, changefreq] = sitemapFields() as Record<string, any>[]
    expect(sitemapExcludeField().label).toMatchObject({ en: 'Exclude from sitemap' })
    expect(priority).toMatchObject({ max: 1, min: 0, type: 'number' })
    expect(changefreq!.options.map(({ value }: { value: string }) => value)).toEqual([
      'always',
      'hourly',
      'daily',
      'weekly',
      'monthly',
      'yearly',
      'never',
    ])
  })
})
