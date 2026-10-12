import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { serveFile } from '@/server/storage/serveFile.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

vi.mock('@/server/storage/readFile.js', () => ({
  readFile: async () => {
    throw new Error('storage down')
  },
}))

describe('serveFile', () => {
  it('answers 502 and logs when the storage throws', async () => {
    const error = vi.fn()
    const doc = { filename: 'sitemap.x.xml', hash: 'h', id: 1, kind: 'index', name: 'sitemap.xml', run: 1 }
    const req = {
      headers: new Headers(),
      payload: { find: async () => ({ docs: [doc] }), findGlobal: async () => ({ run: 1 }), logger: { error } },
    } as unknown as PayloadRequest

    const response = await serveFile(req, { storage: { collection: 'files' } } as ResolvedOptions, [])

    expect(response.status).toBe(502)
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'sitemap: could not read sitemap.xml' }))
  })
})
