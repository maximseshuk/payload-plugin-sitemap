import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { publishFiles } from '@/server/storage/publishFiles.js'
import type { StoredFile } from '@/server/storage/storedFiles.js'
import type { Store } from '@/server/storage/storeFile.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

describe('publishFiles', () => {
  it('logs a failed publish.delete and goes on', async () => {
    const remove = vi.fn(async ({ filename }: { filename: string }) => {
      if (filename === 'old-1.xml') throw new Error('cdn down')
    })
    const error = vi.fn()
    const stale = (name: string) => ({ hash: name, id: name, kind: 'file', name, published: name }) as StoredFile
    const store: Store = {
      created: [],
      hidden: [],
      kept: new Set(),
      live: new Map([['old-1.xml', stale('old-1.xml')]]),
      run: 2,
      stale: [stale('old-2.xml')],
    }
    const options = { publish: { delete: remove, put: vi.fn() } } as unknown as ResolvedOptions
    const req = { payload: { logger: { error } } } as unknown as PayloadRequest

    await publishFiles(req, options, store, async () => {})

    expect(remove.mock.calls.map(([{ filename }]) => filename)).toEqual(['old-1.xml', 'old-2.xml'])
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'sitemap: could not delete old-1.xml through publish.delete' }),
    )
  })
})
