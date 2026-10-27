import type { PayloadRequest } from 'payload'

import { jobState } from '@/server/jobs/queue.js'
import { lockHeld } from '@/server/lock/runLock.js'
import type { ResolvedOptions, SitemapStatus } from '@/shared/types/index.js'

import { isQueued } from './queuedState.js'
import { readStatus } from './statusStore.js'

const runState = async (req: PayloadRequest, options: ResolvedOptions): Promise<SitemapStatus['state']> => {
  if (options.jobs && options.jobs.mode === 'payload') return jobState(req)
  if (await lockHeld(req)) return 'running'
  if (options.jobs && (await isQueued(req))) return 'queued'
  return 'idle'
}

export const sitemapStatus = async (req: PayloadRequest, options: ResolvedOptions): Promise<SitemapStatus> => {
  const status = await readStatus(req)
  return {
    error: status.error,
    errorAt: status.errorAt,
    files: status.files ?? 0,
    generatedAt: status.generatedAt,
    state: await runState(req, options),
    urls: status.urls,
  }
}
