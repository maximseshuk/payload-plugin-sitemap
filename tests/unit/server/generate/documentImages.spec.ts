import { describe, expect, it } from 'vitest'

import { documentImages } from '@/server/generate/documentImages.js'
import type { SitemapDoc } from '@/shared/types/index.js'

import { collection, fakeReq } from '../../../helpers/unit/generate.js'

const SITE = 'https://example.com'

describe('images', () => {
  const doc: SitemapDoc = {
    cover: { url: '/api/media/file/cover.jpg' },
    gallery: [
      { image: { filename: 'a.jpg', url: 'https://cdn.example.com/a.jpg' } },
      { image: null },
      { image: { filename: 'b.jpg', url: 'https://cdn.example.com/b.jpg' } },
    ],
    hero: { image: 'https://example.com/hero.jpg' },
    id: 1,
    layout: [{ blockType: 'media', media: [{ url: 'https://cdn.example.com/c.jpg' }, 'relative.jpg'] }],
  }

  it('reads nested paths, arrays and blocks', async () => {
    const { req } = fakeReq()
    const { images } = collection({ images: ['hero.image', 'gallery.image', 'layout.media'] })
    expect(await documentImages(images, { doc, req })).toEqual([
      'https://example.com/hero.jpg',
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
    ])
  })

  it('reads hasMany, polymorphic and unpopulated uploads', async () => {
    const { req } = fakeReq()
    const item: SitemapDoc = {
      assets: [
        { relationTo: 'media', value: { url: 'https://cdn.example.com/p1.jpg' } },
        { relationTo: 'media', value: 7 },
      ],
      id: 2,
      photos: [{ url: 'https://cdn.example.com/h1.jpg' }, { url: 'https://cdn.example.com/h2.jpg' }, 9],
      variants: [{ media: { image: { relationTo: 'media', value: { url: 'https://cdn.example.com/v1.jpg' } } } }],
    }
    const { images } = collection({ images: ['photos', 'assets', 'variants.media.image'] })
    expect(await documentImages(images, { doc: item, req })).toEqual([
      'https://cdn.example.com/h1.jpg',
      'https://cdn.example.com/h2.jpg',
      'https://cdn.example.com/p1.jpg',
      'https://cdn.example.com/v1.jpg',
    ])
  })

  it('reads groups with relationTo and value keys as they are', async () => {
    const { req } = fakeReq()
    const item: SitemapDoc = {
      id: 3,
      link: { image: { url: 'https://cdn.example.com/l1.jpg' }, relationTo: 'pages', value: 1 },
      relationTo: 'x',
      value: 2,
    }
    const { images } = collection({ images: ['link.image'] })
    expect(await documentImages(images, { doc: item, req })).toEqual(['https://cdn.example.com/l1.jpg'])
  })

  it('maps upload documents with a url function', async () => {
    const { req } = fakeReq()
    const url = (image: { filename?: string }) => (image.filename ? `https://img.example.com/${image.filename}` : null)
    const { images } = collection({ images: [{ field: 'gallery.image', url }] })
    expect(await documentImages(images, { doc, req })).toEqual([
      'https://img.example.com/a.jpg',
      'https://img.example.com/b.jpg',
    ])
  })

  it('resolves relative upload URLs against serverURL and skips them without one', async () => {
    const { images } = collection({ images: ['cover'] })
    expect(await documentImages(images, { doc, req: fakeReq('https://cms.example.com').req })).toEqual([
      'https://cms.example.com/api/media/file/cover.jpg',
    ])
    expect(await documentImages(images, { doc, req: fakeReq().req })).toEqual([])
  })

  it('takes a function', async () => {
    const { req } = fakeReq()
    const { images } = collection({ images: async ({ doc: item }) => [`${SITE}/${item.id}.jpg`] })
    expect(await documentImages(images, { doc, req })).toEqual([`${SITE}/1.jpg`])
    expect(await documentImages(collection({}).images, { doc, req })).toBeUndefined()
    const mixed = collection({
      images: ['cover', async ({ doc: item }) => [`${SITE}/${item.id}.jpg`, `${SITE}/c.jpg`]],
    })
    expect(await documentImages(mixed.images, { doc: { cover: { url: `${SITE}/c.jpg` }, id: 1 }, req })).toEqual([
      `${SITE}/c.jpg`,
      `${SITE}/1.jpg`,
    ])
  })
})
