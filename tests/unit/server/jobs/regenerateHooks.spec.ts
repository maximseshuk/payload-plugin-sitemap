import type { CollectionAfterChangeHook } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { addRegenerateHooks, watchedSlugs } from '@/server/jobs/regenerateHooks.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'

vi.mock('@/server/jobs/queue.js', () => ({
  queueRegeneration: vi.fn(async () => {
    throw new Error('database down')
  }),
}))

describe('addRegenerateHooks', () => {
  it('logs a failed queue and never fails the save', async () => {
    const options = resolveOptions({
      siteUrl: 'https://example.com',
      sources: [{ type: 'collection', collection: 'posts' }],
    })
    const { collections } = addRegenerateHooks([{ slug: 'posts', fields: [] }], [], options, watchedSlugs(options))
    const hook = collections[0]!.hooks!.afterChange![0] as CollectionAfterChangeHook
    const error = vi.fn()
    const doc = { id: 1 }

    await expect(hook({ doc, req: { payload: { logger: { error } } } } as never)).resolves.toBe(doc)
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'sitemap: could not queue regeneration' }))
  })
})
