import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { sitemapFields } from '@/fields/index.js'
import { selectWithPaths, sitemapFieldPaths } from '@/server/fields/sitemapFieldPaths.js'

const seoMeta: Field = {
  name: 'meta',
  type: 'group',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
  ],
}

describe('reading the fields', () => {
  it('finds the marked fields wherever they are', () => {
    const manual = [{ name: 'seo', type: 'group', fields: sitemapFields({ exclude: true, priority: true }) }] as Field[]
    expect(sitemapFieldPaths(manual)).toEqual({ exclude: 'seo.sitemapExclude', priority: 'seo.sitemapPriority' })
    const seo = [
      {
        type: 'tabs',
        tabs: [
          {
            fields: [{ ...seoMeta, fields: [...(seoMeta as { fields: Field[] }).fields, ...sitemapFields()] }],
            label: 'SEO',
          },
        ],
      },
    ] as Field[]
    expect(sitemapFieldPaths(seo)).toEqual({
      changefreq: 'meta.sitemapChangefreq',
      exclude: 'meta.sitemapExclude',
      priority: 'meta.sitemapPriority',
    })
    expect(sitemapFieldPaths([{ name: 'noindex', type: 'checkbox' }])).toEqual({})
  })

  it('adds nested paths to an include select only', () => {
    expect(selectWithPaths({ title: true }, ['meta.sitemapExclude', 'sitemapPriority'])).toEqual({
      meta: { sitemapExclude: true },
      sitemapPriority: true,
      title: true,
    })
    expect(selectWithPaths({ meta: true }, ['meta.sitemapExclude'])).toEqual({ meta: true })
    expect(selectWithPaths({ body: false }, ['meta.sitemapExclude'])).toEqual({ body: false })
    expect(selectWithPaths(undefined, ['meta.sitemapExclude'])).toBeUndefined()
  })
})
