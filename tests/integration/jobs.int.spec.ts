import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateSitemap, LOCKS_SLUG, queueSitemap, STATUS_SLUG } from '@/index.js'

import {
  base,
  bootFails,
  call,
  cleanup,
  custom,
  login,
  pendingJobs,
  publish,
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

describe('with enqueue', () => {
  const status = async (payload: Payload, headers: Record<string, string>) =>
    (await (await call(payload, '/sitemap/status', { headers })).json()) as { state: string }

  it('adds no jobs collection, hands changes to enqueue and generates on demand', async () => {
    const calls: number[] = []
    const enqueue = ({ delay }: { delay: number }) => {
      calls.push(delay)
      return 'bull-1'
    }
    const { payload } = await start({ ...base, jobs: { enqueue, regenerate: { delay: 60_000 } } })
    expect(payload.collections['payload-jobs']).toBeUndefined()
    const headers = await login(payload)
    expect(await status(payload, headers)).toMatchObject({ state: 'idle' })

    await publish(payload, 'one')
    expect(calls).toEqual([60_000])
    await vi.waitFor(async () => expect(await status(payload, headers)).toMatchObject({ state: 'queued' }))
    expect(await queueSitemap(await reqOf(payload))).toBe('bull-1')
    expect(calls).toEqual([60_000, 0])

    const response = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ id: 'bull-1' })

    const files = await generateSitemap(await reqOf(payload))
    expect(files.reduce((sum, file) => sum + file.urls, 0)).toBe(1)
    expect(await status(payload, headers)).toMatchObject({ state: 'idle' })
  })

  it('shows a held lock as running and a call during the run as queued after it', async () => {
    const { payload } = await start({ ...base, jobs: { enqueue: () => undefined, regenerate: false } })
    const headers = await login(payload)
    await generateSitemap(await reqOf(payload))
    await payload.create({
      collection: LOCKS_SLUG,
      data: { expiresAt: new Date(Date.now() + 60_000).toISOString(), key: 'run' },
      overrideAccess: true,
    })
    expect(await status(payload, headers)).toMatchObject({ state: 'running' })
    const response = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({})
    expect(await status(payload, headers)).toMatchObject({ state: 'running' })
    await payload.delete({ collection: LOCKS_SLUG, overrideAccess: true, where: { key: { equals: 'run' } } })
    expect(await status(payload, headers)).toMatchObject({ state: 'queued' })
  })

  it('keeps the earlier of two queued runs and stops showing queued after the TTL', async () => {
    const { payload } = await start({ ...base, jobs: { enqueue: () => 'job', regenerate: false } })
    const headers = await login(payload)
    const req = await reqOf(payload)
    const queuedRow = async () =>
      (await payload.find({ collection: LOCKS_SLUG, overrideAccess: true, where: { key: { equals: 'queued' } } })).docs
    const updateGlobal = vi.spyOn(payload, 'updateGlobal')
    await queueSitemap(req, 60_000)
    const [later] = await queuedRow()
    await queueSitemap(req, 120_000)
    expect(await queuedRow()).toEqual([later])
    await queueSitemap(req)
    const rows = await queuedRow()
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0]!.expiresAt as string).getTime()).toBeLessThan(
      new Date(later!.expiresAt as string).getTime(),
    )
    expect(updateGlobal).not.toHaveBeenCalled()
    expect(await status(payload, headers)).toMatchObject({ state: 'queued' })

    await payload.update({
      collection: LOCKS_SLUG,
      data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
      where: { key: { equals: 'queued' } },
    })
    expect(await status(payload, headers)).toMatchObject({ state: 'idle' })
    await queueSitemap(req, 600_000)
    expect(await status(payload, headers)).toMatchObject({ state: 'queued' })
  })

  it('never fails a save when enqueue throws and answers 500 from the endpoint', async () => {
    const { payload } = await start({
      ...base,
      jobs: {
        enqueue: () => {
          throw new Error('redis down')
        },
        regenerate: { delay: 0 },
      },
    })
    const error = vi.spyOn(payload.logger, 'error')
    const page = await publish(payload, 'one')
    expect(page.id).toBeTruthy()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'sitemap: could not queue regeneration' }))
    const headers = await login(payload)
    const response = await call(payload, '/sitemap/generate', { headers, method: 'POST' })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ message: 'sitemap: could not queue a run, see the server log' })
    expect(await status(payload, headers)).toMatchObject({ state: 'idle' })
  })
})

describe('queued state', () => {
  it('keeps the save when the queued-state write fails', async () => {
    const { payload } = await start({ ...base, jobs: { enqueue: () => 'job', regenerate: { delay: 0 } } })
    const update = payload.update.bind(payload)
    vi.spyOn(payload, 'update').mockImplementation(((args: { collection: string }) =>
      args.collection === LOCKS_SLUG ? Promise.reject(new Error('db down')) : update(args as never)) as never)
    const error = vi.spyOn(payload.logger, 'error')

    const page = await publish(payload, 'kept')

    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'sitemap: could not save the queued state' })),
    )
    const saved = await payload.find({ collection: 'pages', overrideAccess: true, where: { id: { equals: page.id } } })
    expect(saved.docs).toHaveLength(1)
  })
})

describe('endpoints', () => {
  it('leaves the file and generate endpoints out when turned off', async () => {
    const { payload } = await start({ ...base, endpoints: { files: false, generate: false } })
    await seed(payload)
    await generateSitemap(await reqOf(payload))
    const headers = await login(payload)
    expect((await call(payload, '/sitemap.xml')).status).toBe(404)
    expect((await call(payload, '/sitemaps/pages-1.xml')).status).toBe(404)
    expect((await call(payload, '/sitemap/generate', { headers, method: 'POST' })).status).toBe(404)
    expect((await call(payload, '/sitemap/status', { headers })).status).toBe(200)
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
    await payload.update({
      collection: 'payload-jobs',
      data: { processingUntil: new Date(Date.now() + 60_000).toISOString() },
      id: running,
      overrideAccess: true,
    })

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
