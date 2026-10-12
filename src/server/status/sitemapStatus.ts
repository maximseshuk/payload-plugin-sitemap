import type { PayloadRequest } from 'payload'

import { jobState } from '@/server/jobs/queue.js'
import { lockHeld } from '@/server/lock/runLock.js'
import type { ResolvedOptions, SitemapStatus } from '@/shared/types/index.js'

import { readStatus } from './statusStore.js'

export const sitemapStatus = async (req: PayloadRequest, options: ResolvedOptions): Promise<SitemapStatus> => {
  const status = await readStatus(req)
  return {
    error: status.error,
    errorAt: status.errorAt,
    files: status.files ?? 0,
    generatedAt: status.generatedAt,
    state: options.jobs ? await jobState(req) : (await lockHeld(req)) ? 'running' : 'idle',
    urls: status.urls,
  }
}
