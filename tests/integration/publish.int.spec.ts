import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateSitemap, LOCKS_SLUG, STATUS_SLUG } from '@/index.js'

import { base, call, cleanup, reqOf, seed, SITE, start } from '../helpers/int/sitemap.js'

afterEach(cleanup)

describe('publish', () => {
  const fileUrl = ({ filename }: { filename: string }) => `${SITE}/sitemaps/${filename}`

  it('puts changed child files before the index and never re-puts kept files', async () => {
    const puts: string[] = []
    const removed: string[] = []
    const put = vi.fn(
      async ({ body: data, contentType, filename }: { body: Buffer; contentType: string; filename: string }) => {
        expect(contentType).toBe('application/xml; charset=utf-8')
        expect(data.toString()).toContain('<?xml')
        puts.push(filename)
      },
    )
    const remove = vi.fn(async ({ filename }: { filename: string }) => {
      removed.push(filename)
    })
    const { payload } = await start({
      ...base,
      output: { fileUrl, maxUrlsPerFile: 2 },
      publish: { delete: remove, put },
    })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    expect(puts.at(-1)).toBe('sitemap.xml')
    expect(puts.toSorted()).toEqual(['pages-1.xml', 'posts-1.xml', 'posts-2.xml', 'posts-3.xml', 'sitemap.xml'])
    expect(remove).not.toHaveBeenCalled()

    puts.length = 0
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual([])

    await payload.delete({ overrideAccess: true, collection: 'posts', where: { slug: { in: ['post-1', 'post-2'] } } })
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['posts-1.xml', 'sitemap.xml'])
    expect(removed.toSorted()).toEqual(['posts-2.xml', 'posts-3.xml'])
    const docs = (await payload.find({ collection: 'sitemap-files', overrideAccess: true })).docs
    expect(docs.every((doc) => doc.published === doc.hash)).toBe(true)
  })

  it('stores a failing put as the run error, keeps the switch and puts again on the next run', async () => {
    let broken = true
    const puts: string[] = []
    const put = async ({ filename }: { filename: string }) => {
      if (broken && filename === 'posts-1.xml') throw new Error('cdn down')
      puts.push(filename)
    }
    const { payload } = await start({ ...base, output: { fileUrl }, publish: { put } })
    await seed(payload)

    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow('cdn down')
    const status = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    expect(status.error).toBe('cdn down')
    expect(status.errorAt).toBeTruthy()
    expect(status.urls).toBe(8)
    expect(puts).toEqual(['pages-1.xml'])
    expect((await call(payload, '/sitemaps/posts-1.xml')).status).toBe(200)

    broken = false
    await generateSitemap(await reqOf(payload))
    expect(puts).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBeFalsy()
  })

  it('stops putting files when the lock is lost during publish', async () => {
    const puts: string[] = []
    const put = async ({ filename, req }: { filename: string; req: PayloadRequest }) => {
      puts.push(filename)
      if (puts.length === 1) {
        await req.payload.delete({
          collection: LOCKS_SLUG,
          overrideAccess: true,
          req,
          where: { key: { equals: 'run' } },
        })
      }
    }
    const { payload } = await start({ ...base, output: { fileUrl }, publish: { put } })
    await seed(payload)

    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      'the run lock expired and another run took it over',
    )
    expect(puts).toEqual(['pages-1.xml'])
  })

  it('needs child URLs in the folder of the index URL', async () => {
    const { payload } = await start({
      ...base,
      output: {
        fileUrl: ({ filename }) => (filename === 'sitemap.xml' ? `${SITE}/maps/sitemap.xml` : `${SITE}/${filename}`),
      },
      publish: { put: async () => {} },
    })
    await seed(payload)
    await expect(generateSitemap(await reqOf(payload))).rejects.toThrow(
      `publish needs ${SITE}/pages-1.xml in the folder of its index ${SITE}/maps/sitemap.xml or below`,
    )
  })
})
