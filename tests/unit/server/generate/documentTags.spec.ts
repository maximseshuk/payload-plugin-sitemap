import { describe, expect, it } from 'vitest'

import type { SitemapCollectionSource } from '@/index.js'
import { documentTags } from '@/server/generate/documentTags.js'
import type { SitemapDoc } from '@/shared/types/index.js'

import { collection, fakeReq } from '../../../helpers/unit/generate.js'

describe('static value or function', () => {
  const doc: SitemapDoc = { featured: true, id: 1, publishedAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-03-01' }

  it('takes static values', async () => {
    const { req } = fakeReq()
    const tags = await documentTags(
      collection({ changefreq: 'daily', priority: 0.4 }),
      { doc, req },
      undefined,
      'posts',
    )
    expect(tags).toMatchObject({ changefreq: 'daily', lastmod: '2026-03-01', priority: 0.4 })
  })

  it('takes sync and async functions of the document', async () => {
    const { req } = fakeReq()
    const resolved = collection({
      changefreq: async ({ doc: item }) => (item.featured ? 'hourly' : 'monthly'),
      priority: ({ doc: item }) => (item.featured ? 1 : 0.6),
    })
    expect(await documentTags(resolved, { doc, req }, undefined, 'posts')).toMatchObject({
      changefreq: 'hourly',
      priority: 1,
    })
    expect(await documentTags(resolved, { doc: { id: 2 }, req }, undefined, 'posts')).toMatchObject({
      changefreq: 'monthly',
      priority: 0.6,
    })
  })

  it('leaves the tag out when a function returns undefined', async () => {
    const { req } = fakeReq()
    const resolved = collection({
      changefreq: () => undefined,
      lastmod: () => undefined,
      priority: async () => undefined,
    })
    const tags = await documentTags(resolved, { doc, req }, undefined, 'posts')
    expect(tags.changefreq).toBeUndefined()
    expect(tags.lastmod).toBeUndefined()
    expect(tags.priority).toBeUndefined()
  })

  it('reads lastmod from a field, a function or not at all', async () => {
    const { req } = fakeReq()
    const at = async (lastmod: SitemapCollectionSource['lastmod']) =>
      (await documentTags(collection({ lastmod }), { doc, req }, undefined, 'posts')).lastmod
    expect(await at('publishedAt')).toBe('2026-02-01T00:00:00.000Z')
    expect(await at(({ doc: item }) => new Date(item.publishedAt))).toEqual(new Date('2026-02-01T00:00:00.000Z'))
    expect(await at(false)).toBeUndefined()
  })

  it('lets document fields win over the collection value', async () => {
    const { req } = fakeReq()
    const resolved = collection({ changefreq: () => 'daily', priority: () => 0.5 })
    expect(await documentTags(resolved, { doc, req }, { changefreq: 'yearly', priority: 0 }, 'posts')).toMatchObject({
      changefreq: 'yearly',
      priority: 0,
    })
    expect(await documentTags(resolved, { doc, req }, { changefreq: null, priority: null }, 'posts')).toMatchObject({
      changefreq: 'daily',
      priority: 0.5,
    })
  })

  it('drops an out-of-range priority with a warning', async () => {
    const { req, warn } = fakeReq()
    const tags = await documentTags(collection({ priority: () => 3 }), { doc, req }, undefined, 'posts')
    expect(tags.priority).toBeUndefined()
    expect(warn).toHaveBeenCalledWith({
      msg: 'sitemap: dropped priority 3 of posts document 1, it must be from 0 to 1',
    })
  })
})
