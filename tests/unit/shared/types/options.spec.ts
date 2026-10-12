import { describe, expectTypeOf, it } from 'vitest'

import type { SitemapSortField, SitemapSource } from '@/shared/types/index.js'

describe('SitemapSortField', () => {
  it('lists top-level fields with one scalar value', () => {
    type Product = {
      category?: { id: number } | number | null
      code?: null | string
      createdAt: string
      featured?: boolean | null
      id: number
      meta?: { handle?: string }
      price: number
      status?: 'draft' | 'live' | null
      tags?: null | string[]
      updatedAt: string
    }
    expectTypeOf<SitemapSortField<Product>>().toEqualTypeOf<
      'code' | 'createdAt' | 'featured' | 'id' | 'price' | 'status' | 'updatedAt'
    >()
  })

  it('stays a string without generated types', () => {
    expectTypeOf<SitemapSortField<Record<string, unknown>>>().toEqualTypeOf<string>()
  })
})

describe('SitemapSource', () => {
  it('keeps the collection type of doc in each source', () => {
    const source = {
      type: 'collection',
      collection: 'posts',
      url: ({ doc }) => {
        expectTypeOf(doc.id).toEqualTypeOf<number | string>()
        return `/${String(doc.slug)}`
      },
    } satisfies SitemapSource
    expectTypeOf(source.type).toEqualTypeOf<'collection'>()
  })
})
