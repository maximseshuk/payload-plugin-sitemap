import { describe, expect, it } from 'vitest'

import { fillPath, pathFields } from '@/server/generate/fillPath.js'

describe('path placeholders', () => {
  it('lists and fills placeholders', () => {
    expect(pathFields('/shop/:category.slug/:slug')).toEqual(['category.slug', 'slug'])
    expect(fillPath('/shop/:category.slug/:slug', { category: { slug: 'rings' }, slug: 'gold ring' })).toBe(
      '/shop/rings/gold%20ring',
    )
    expect(fillPath('/p/:id', { id: 12 })).toBe('/p/12')
    expect(fillPath('/:slug', { slug: 'a/b?c' })).toBe('/a/b%3Fc')
    expect(fillPath('/:slug', { slug: '' })).toBeUndefined()
    expect(fillPath('/:category.slug', { category: 3 })).toBeUndefined()
    expect(fillPath('/about', {})).toBe('/about')
  })

  it('reads every value shape', () => {
    const doc = {
      code: 'A-1',
      flag: true,
      meta: { handle: 'ring', seo: { path: 'gold/ring' } },
      price: 0,
      size: 1.5,
      tags: ['a', 'b'],
      vendor: { relationTo: 'brands', value: { slug: 'acme' } },
    }
    expect(fillPath('/:meta.seo.path/:meta.handle', doc)).toBe('/gold/ring/ring')
    expect(fillPath('/:{code}.html', doc)).toBe('/A-1.html')
    expect(fillPath('/:price/:size', doc)).toBe('/0/1.5')
    expect(fillPath('/:vendor.slug', doc)).toBe('/acme')
    expect(fillPath('/:vendor.relationTo/:vendor.value.slug', doc)).toBe('/brands/acme')
    expect(fillPath('/:locale/:code', doc, 'de')).toBe('/de/A-1')
    expect(fillPath('/:flag', doc)).toBeUndefined()
    expect(fillPath('/:tags', doc)).toBeUndefined()
    expect(fillPath('/:vendor', doc)).toBeUndefined()
    expect(fillPath('/:meta.missing', doc)).toBeUndefined()
    expect(fillPath('/:vendor.value', { vendor: { relationTo: 'brands', value: 7 } })).toBe('/7')
    expect(fillPath('/:vendor.slug', { vendor: { relationTo: 'brands', value: 7 } })).toBeUndefined()
  })

  it('reads plain objects with relationTo and value keys as they are', () => {
    expect(fillPath('/:slug', { relationTo: 'x', slug: 'a', value: 5 })).toBe('/a')
    expect(fillPath('/:link.label', { link: { label: 'home', relationTo: 'pages', value: 3 } })).toBe('/home')
  })
})
