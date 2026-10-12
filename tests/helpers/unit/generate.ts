import type { PayloadRequest } from 'payload'
import { vi } from 'vitest'

import type { SitemapCollectionSource } from '@/index.js'
import { resolveCollection } from '@/server/options/resolveCollection.js'

export const fakeReq = (serverURL = '') => {
  const warn = vi.fn()
  const req = {
    payload: {
      config: { serverURL },
      logger: { warn },
    },
  } as unknown as PayloadRequest
  return { req, warn }
}

export const collection = (value: Partial<SitemapCollectionSource>) =>
  resolveCollection({ type: 'collection', collection: 'posts', url: '/:slug', ...value }, 'sources[0]')
