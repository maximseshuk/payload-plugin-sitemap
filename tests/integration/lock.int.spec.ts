import { afterEach, describe, expect, it } from 'vitest'

import { generateSitemap, LOCKS_SLUG, STATUS_SLUG } from '@/index.js'

import { base, call, cleanup, custom, names, reqOf, seed, start } from '../helpers/int/sitemap.js'

afterEach(cleanup)

describe('lock', () => {
  it('never lets two runs overlap right after a fresh start', async () => {
    const entered = new WeakSet<object>()
    let active = 0
    let count = 0
    let most = 0
    const { payload } = await start({
      ...base,
      sources: [
        custom('slow', async ({ req, siteUrl }) => {
          if (!entered.has(req)) {
            entered.add(req)
            count++
            active++
            most = Math.max(most, active)
          }
          await new Promise((resolve) => setTimeout(resolve, 300))
          return [{ url: `${siteUrl}/slow` }]
        }),
      ],
    })
    const reqs = await Promise.all(Array.from({ length: 7 }, () => reqOf(payload)))
    const results = await Promise.allSettled(
      reqs.map(async (req) => {
        try {
          return await generateSitemap(req)
        } finally {
          if (entered.has(req)) active--
        }
      }),
    )

    expect(most).toBeLessThanOrEqual(1)
    const done = results.filter(({ status }) => status === 'fulfilled').length
    expect(count).toBe(done)
    for (const result of results) {
      if (result.status === 'rejected') {
        expect((result.reason as Error).message).toBe('sitemap: a sitemap run is already in progress')
      }
    }
    expect((await payload.find({ collection: LOCKS_SLUG, overrideAccess: true })).totalDocs).toBe(0)
    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['sitemap.xml', 'slow-1.xml'])
    expect((await call(payload, '/sitemap.xml')).status).toBe(200)
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error).toBeFalsy()
  })

  it('takes over an expired lock', async () => {
    const { payload } = await start()
    await seed(payload)
    await payload.create({
      collection: LOCKS_SLUG,
      data: { expiresAt: new Date(Date.now() - 1000).toISOString(), key: 'run' },
      overrideAccess: true,
    })
    expect(names(await generateSitemap(await reqOf(payload)))).toEqual(['pages-1.xml', 'posts-1.xml', 'sitemap.xml'])
    expect((await payload.find({ collection: LOCKS_SLUG, overrideAccess: true })).totalDocs).toBe(0)
  })
})
