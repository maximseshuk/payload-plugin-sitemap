import type { TaskConfig } from 'payload'

import { TASK_SLUG } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { runGeneration } from './runGeneration.js'

export const sitemapTask = (options: ResolvedOptions, enabled = true): TaskConfig => ({
  slug: TASK_SLUG,
  concurrency: { exclusive: true, key: () => TASK_SLUG },
  handler: async ({ req }) => {
    if (enabled) await runGeneration(req, options)
    return { output: {} }
  },
  label: 'Generate sitemap',
  retries: { attempts: 5, backoff: { type: 'exponential', delay: 30_000 } },
  ...(enabled && options.jobs && options.jobs.mode === 'payload' && options.jobs.schedule
    ? { schedule: [{ cron: options.jobs.schedule, queue: options.jobs.queue }] }
    : {}),
})
