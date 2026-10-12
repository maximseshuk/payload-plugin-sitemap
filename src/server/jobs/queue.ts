import type { PayloadRequest, TaskType, Where } from 'payload'

import { fail } from '@/server/options/fail.js'
import { JOBS_SLUG, TASK_SLUG } from '@/shared/constants.js'
import type { ResolvedOptions, SitemapStatus } from '@/shared/types/index.js'

type PendingJob = { id: number | string; waitUntil?: null | string }

const findJob = async (req: PayloadRequest, where: Where[]): Promise<PendingJob | undefined> => {
  const { docs } = await req.payload.find({
    collection: JOBS_SLUG,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    sort: 'createdAt',
    where: {
      and: [
        { taskSlug: { equals: TASK_SLUG } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
        ...where,
      ],
    },
  })
  return docs[0] as PendingJob | undefined
}

const running: Where = { processing: { equals: true } }

const waiting: Where = { processing: { equals: false } }

export const jobState = async (req: PayloadRequest): Promise<SitemapStatus['state']> => {
  if (await findJob(req, [running])) return 'running'
  return (await findJob(req, [])) ? 'queued' : 'idle'
}

export const queueRegeneration = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  delay: number,
): Promise<number | string> => {
  if (!options.jobs) return fail('jobs is false, call generateSitemap(req)')
  const job = await findJob(req, [waiting, { queue: { equals: options.jobs.queue } }])
  const waitUntil = new Date(Date.now() + delay)

  if (job) {
    if (job.waitUntil && new Date(job.waitUntil) > waitUntil) {
      await req.payload.update({
        collection: JOBS_SLUG,
        data: { waitUntil: waitUntil.toISOString() },
        depth: 0,
        id: job.id,
        overrideAccess: true,
        req,
      })
    }
    return job.id
  }

  const queued = await req.payload.jobs.queue({
    input: {},
    overrideAccess: true,
    queue: options.jobs.queue,
    req,
    task: TASK_SLUG as TaskType,
    ...(delay > 0 ? { waitUntil } : {}),
  })
  return queued.id
}
