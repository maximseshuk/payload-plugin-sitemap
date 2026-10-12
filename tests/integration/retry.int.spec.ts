import type { Payload } from 'payload'
import { afterEach, describe, expect, it } from 'vitest'

import type { SitemapPluginOptions, SitemapSource } from '@/index.js'
import { LOCKS_SLUG, queueSitemap, STATUS_SLUG, TASK_SLUG } from '@/index.js'

import { read, storedNames } from '../helpers/int/files.js'
import { call, cleanup, publish, reqOf, SITE, start } from '../helpers/int/sitemap.js'

const BUSY = 'sitemap: a sitemap run is already in progress'
const JOBS = 'payload-jobs'

const pages: SitemapSource = { type: 'collection', collection: 'pages', locales: ['en'], url: '/:slug' }

const base: SitemapPluginOptions = { jobs: { regenerate: false }, siteUrl: SITE, sources: [pages] }

const concurrent = { jobs: { enableConcurrencyControl: true } }

type Job = {
  completedAt?: null | string
  error?: { message?: string } | null
  hasError?: boolean | null
  id: number | string
  log?: { error?: { message?: string }; state: string; taskSlug: string }[] | null
  processing?: boolean | null
  totalTried?: null | number
  waitUntil?: null | string
}

afterEach(cleanup)

const holdLock = (payload: Payload) =>
  payload.create({
    collection: LOCKS_SLUG,
    data: { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), key: 'run', owner: 'other-run' },
    overrideAccess: true,
  })

const freeLock = (payload: Payload) =>
  payload.delete({ collection: LOCKS_SLUG, overrideAccess: true, where: { key: { equals: 'run' } } })

const jobOf = async (payload: Payload, id: number | string) =>
  (await payload.findByID({ collection: JOBS, depth: 0, id, overrideAccess: true })) as unknown as Job

const openJobs = async (payload: Payload) =>
  (
    await payload.find({
      collection: JOBS,
      depth: 0,
      overrideAccess: true,
      sort: 'createdAt',
      where: {
        and: [
          { taskSlug: { equals: TASK_SLUG } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
    })
  ).docs as unknown as Job[]

const queueJob = async (payload: Payload) =>
  ((await payload.jobs.queue({ input: {}, overrideAccess: true, task: TASK_SLUG as never })) as Job).id

const due = (payload: Payload, id: number | string) =>
  payload.update({
    collection: JOBS,
    data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
    depth: 0,
    id,
    overrideAccess: true,
  })

const runJobs = async (payload: Payload) => {
  const before = Date.now()
  const result = await payload.jobs.run({ overrideAccess: true, queue: 'default' })
  return { after: Date.now(), before, result }
}

const exhaust = async (payload: Payload, id: number | string, attempts: number) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await runJobs(payload)
    await due(payload, id)
  }
}

const waitUntilOf = (job: Job) => new Date(job.waitUntil!).getTime()

const statusError = async (payload: Payload) =>
  (await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).error

const fileDocs = async (payload: Payload) =>
  (await payload.find({ collection: 'sitemap-files', overrideAccess: true })).totalDocs

describe('retry', () => {
  it('backs off 30 s while another run holds the lock and completes once it is free', async () => {
    const { dir, payload } = await start(base)
    await publish(payload, 'about')
    await holdLock(payload)
    const id = await queueSitemap(await reqOf(payload))

    await runJobs(payload)
    const job = await jobOf(payload, id)
    expect(job.completedAt).toBeFalsy()
    expect(job.error).toBeFalsy()
    expect(job.log).toHaveLength(1)
    expect(await statusError(payload)).toBeFalsy()
    expect(await fileDocs(payload)).toBe(0)
    expect(storedNames(dir)).toHaveLength(0)

    expect((await runJobs(payload)).result).toEqual({ noJobsRemaining: true, remainingJobsFromQueried: 0 })
    expect((await jobOf(payload, id)).totalTried).toBe(1)

    await freeLock(payload)
    await due(payload, id)
    expect((await runJobs(payload)).result.jobStatus).toEqual({ [id]: { status: 'success' } })
    expect(await openJobs(payload)).toHaveLength(0)
    expect(await statusError(payload)).toBeFalsy()
    const index = await call(payload, '/sitemap.xml')
    expect(index.status).toBe(200)
    expect(await index.text()).toBe(read(dir, 'sitemap.xml'))
    expect(await (await call(payload, '/sitemaps/pages-1.xml')).text()).toContain(`<loc>${SITE}/about</loc>`)
  })

  it.each([
    ['without', {}],
    ['with', concurrent],
  ])('fails a job for good only on the sixth attempt behind a held lock %s concurrency control', async (_, extra) => {
    const { dir, payload } = await start(base, extra)
    await holdLock(payload)
    const id = await queueSitemap(await reqOf(payload))

    for (const attempt of [1, 2, 3, 4, 5]) {
      const { after, before } = await runJobs(payload)
      const job = await jobOf(payload, id)
      expect(job.hasError).toBeFalsy()
      expect(job.processing).toBeFalsy()
      expect(job.totalTried).toBe(attempt)
      expect(job.log![attempt - 1]).toMatchObject({ error: { message: BUSY }, state: 'failed', taskSlug: TASK_SLUG })
      expect(waitUntilOf(job)).toBeGreaterThanOrEqual(before + 2 ** (attempt - 1) * 30_000)
      expect(waitUntilOf(job)).toBeLessThanOrEqual(after + 2 ** (attempt - 1) * 30_000)
      await due(payload, id)
    }

    await runJobs(payload)
    const job = await jobOf(payload, id)
    expect(job.hasError).toBe(true)
    expect(job.error).toMatchObject({ message: BUSY })
    expect(job.totalTried).toBe(6)
    expect(job.log!.map(({ state }) => state)).toEqual(Array.from({ length: 6 }, () => 'failed'))
    expect((await runJobs(payload)).result).toEqual({ noJobsRemaining: true, remainingJobsFromQueried: 0 })
    expect(await statusError(payload)).toBeFalsy()
    expect(await fileDocs(payload)).toBe(0)
    expect(storedNames(dir)).toHaveLength(0)
  })

  it('reuses a job that waits for its retry when a change comes in', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 0 } } })
    await holdLock(payload)
    const id = await queueSitemap(await reqOf(payload))
    await runJobs(payload)
    expect(waitUntilOf(await jobOf(payload, id))).toBeGreaterThan(Date.now() + 20_000)

    await publish(payload, 'about')
    const open = await openJobs(payload)
    expect(open.map((job) => job.id)).toEqual([id])
    expect(waitUntilOf(open[0]!)).toBeLessThanOrEqual(Date.now())
    expect(open[0]!.totalTried).toBe(1)
  })

  it('never runs two queued sitemap jobs at once', async () => {
    let runs = 0
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const started = new Promise<void>((resolve) => (entered = resolve))
    const { payload } = await start(
      {
        ...base,
        sources: [
          {
            type: 'custom',
            entries: async ({ siteUrl }) => {
              runs++
              entered()
              await gate
              return [{ url: `${siteUrl}/slow` }]
            },
            locales: ['en'],
            name: 'slow',
          },
        ],
      },
      concurrent,
    )
    const first = await queueJob(payload)
    const second = await queueJob(payload)

    const running = payload.jobs.run({ overrideAccess: true, queue: 'default' })
    await started
    expect((await runJobs(payload)).result).toEqual({ noJobsRemaining: true, remainingJobsFromQueried: 0 })
    const waiting = await jobOf(payload, second)
    expect(waiting.processing).toBeFalsy()
    expect(waiting.totalTried).toBe(0)
    release()

    expect((await running).jobStatus).toEqual({ [first]: { status: 'success' } })
    expect(runs).toBe(1)
    expect((await runJobs(payload)).result.jobStatus).toEqual({ [second]: { status: 'success' } })
    expect(runs).toBe(2)
    expect(await openJobs(payload)).toHaveLength(0)
  })

  it('blocks every later sitemap job behind a job stuck in processing with concurrency control', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 0 } } }, concurrent)
    const stuck = await queueJob(payload)
    await payload.update({ collection: JOBS, data: { processing: true }, depth: 0, id: stuck, overrideAccess: true })

    await publish(payload, 'about')
    const open = await openJobs(payload)
    expect(open.map((job) => job.id)).toEqual([stuck, expect.anything()])
    expect((await runJobs(payload)).result).toEqual({ noJobsRemaining: true, remainingJobsFromQueried: 0 })
    expect((await jobOf(payload, open[1]!.id)).totalTried).toBe(0)
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).generatedAt).toBeFalsy()
  })

  it('runs later sitemap jobs past a job stuck in processing without concurrency control', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: { delay: 0 } } })
    const stuck = await queueJob(payload)
    await payload.update({ collection: JOBS, data: { processing: true }, depth: 0, id: stuck, overrideAccess: true })

    await publish(payload, 'about')
    const open = await openJobs(payload)
    expect(open.map((job) => job.id)).toEqual([stuck, expect.anything()])
    expect((await runJobs(payload)).result.jobStatus).toEqual({ [open[1]!.id]: { status: 'success' } })
    expect((await payload.findGlobal({ overrideAccess: true, slug: STATUS_SLUG })).generatedAt).toBeTruthy()
  })

  it('queues a new job from hooks once the old job failed for good', async () => {
    const { dir, payload } = await start({ ...base, jobs: { regenerate: { delay: 0 } } })
    await holdLock(payload)
    const id = await queueSitemap(await reqOf(payload))
    await exhaust(payload, id, 6)
    expect((await jobOf(payload, id)).hasError).toBe(true)
    expect(await openJobs(payload)).toHaveLength(0)

    await publish(payload, 'about')
    const open = await openJobs(payload)
    expect(open).toHaveLength(1)
    expect(open[0]!.id).not.toEqual(id)

    await freeLock(payload)
    expect((await runJobs(payload)).result.jobStatus).toEqual({ [open[0]!.id]: { status: 'success' } })
    expect(read(dir, 'pages-1.xml')).toContain(`<loc>${SITE}/about</loc>`)
    expect((await call(payload, '/sitemap.xml')).status).toBe(200)
  })

  it('schedules a new job once the scheduled job failed for good', async () => {
    const { payload } = await start({ ...base, jobs: { regenerate: false, schedule: '* * * * *' } })
    await holdLock(payload)
    expect((await payload.jobs.handleSchedules({ queue: 'default' })).queued).toHaveLength(1)
    const [scheduled] = await openJobs(payload)
    await due(payload, scheduled!.id)

    await runJobs(payload)
    expect((await jobOf(payload, scheduled!.id)).totalTried).toBe(1)
    expect((await payload.jobs.handleSchedules({ queue: 'default' })).skipped).toHaveLength(1)

    await due(payload, scheduled!.id)
    await exhaust(payload, scheduled!.id, 5)
    expect((await jobOf(payload, scheduled!.id)).hasError).toBe(true)
    expect((await payload.jobs.handleSchedules({ queue: 'default' })).queued).toHaveLength(1)
    const open = await openJobs(payload)
    expect(open).toHaveLength(1)
    expect(open[0]!.id).not.toEqual(scheduled!.id)
  })
})
