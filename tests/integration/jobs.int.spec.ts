import { afterEach, describe, expect, it } from 'vitest'

import { LOCKS_SLUG, queueSitemap, STATUS_SLUG } from '@/index.js'

import {
  base,
  bootFails,
  call,
  cleanup,
  custom,
  login,
  pendingJobs,
  reqOf,
  seed,
  start,
} from '../helpers/int/sitemap.js'

afterEach(cleanup)

describe('without jobs', () => {
  it('adds no jobs collection and runs in the request', async () => {
    const { payload } = await start({ ...base, jobs: false })
    await seed(payload)
    expect(payload.collections['payload-jobs']).toBeUndefined()
    await expect(queueSitemap(await reqOf(payload))).rejects.toThrow('jobs is false, call generateSitemap(req)')

    const headers = await login(payload)
    expect(await (await call(payload, '/sitemap/status', { headers })).json()).toMatchObject({ state: 'idle' })
    const response = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ files: 3, urls: 8 })
    expect(await (await call(payload, '/sitemap/status', { headers })).json()).toMatchObject({
      files: 3,
      state: 'idle',
    })

    await payload.create({
      collection: LOCKS_SLUG,
      data: { expiresAt: new Date(Date.now() + 60_000).toISOString(), key: 'run' },
      overrideAccess: true,
    })
    expect(await (await call(payload, '/sitemap/status', { headers })).json()).toMatchObject({ state: 'running' })
    const busy = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({ message: 'sitemap: a sitemap run is already in progress' })
  })

  it('answers 500 with the message of a failed run', async () => {
    const { payload } = await start({
      ...base,
      jobs: false,
      sources: [
        custom('broken', () => {
          throw new Error('source broke')
        }),
      ],
    })
    const response = await call(payload, '/sitemap/generate', { headers: await login(payload), method: 'POST' })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: 'source broke' })
  })
})

describe('regeneration', () => {
  it('debounces bursts of changes into one job and runs it', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 60_000 } } })
    await seed(payload)

    const jobs = await pendingJobs(payload)
    expect(jobs).toHaveLength(1)
    expect(new Date(jobs[0]!.waitUntil as string).getTime()).toBeGreaterThan(Date.now() + 30_000)

    await payload.jobs.run({ overrideAccess: true, queue: 'default' })
    expect(await pendingJobs(payload)).toHaveLength(1)

    const id = await queueSitemap(await reqOf(payload))
    expect(id).toBe(jobs[0]!.id)
    await payload.jobs.run({ overrideAccess: true, queue: 'default' })
    expect(await pendingJobs(payload)).toHaveLength(0)

    const status = await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })
    expect(status.urls).toBe(8)
  })

  it('queues one job behind a running one', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 60_000 } } })
    const req = await reqOf(payload)
    const running = await queueSitemap(req)
    await payload.update({ collection: 'payload-jobs', data: { processing: true }, id: running, overrideAccess: true })

    const next = await queueSitemap(req)
    expect(next).not.toBe(running)
    expect(await queueSitemap(req)).toBe(next)
    expect(await pendingJobs(payload)).toHaveLength(2)
  })

  it('ignores drafts that were never published and watches globals', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 0, globals: ['settings'] } } })

    await payload.create({
      overrideAccess: true,
      collection: 'pages',
      data: { _status: 'draft', slug: 'x', title: 'X' },
      draft: true,
    })
    expect(await pendingJobs(payload)).toHaveLength(0)

    await payload.updateGlobal({ overrideAccess: true, data: { title: 'Site' }, slug: 'settings' })
    expect(await pendingJobs(payload)).toHaveLength(1)
    await payload.jobs.run({ overrideAccess: true, queue: 'default' })

    const page = await payload.create({
      overrideAccess: true,
      collection: 'pages',
      data: { _status: 'published', slug: 'y', title: 'Y' },
    })
    await payload.jobs.run({ overrideAccess: true, queue: 'default' })
    await payload.update({
      overrideAccess: true,
      collection: 'pages',
      data: { _status: 'draft', title: 'Y2' },
      draft: true,
      id: page.id,
    })
    expect(await pendingJobs(payload)).toHaveLength(1)
  })

  it('fails to start when a watched collection does not exist', async () => {
    await expect(bootFails({ ...base, jobs: { regenerate: { collections: ['nope' as 'pages'] } } })).rejects.toThrow(
      'sitemap: collection "nope" does not exist',
    )
  })
})
