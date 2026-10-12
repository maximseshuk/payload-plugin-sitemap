import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { acquireLock } from '@/server/lock/runLock.js'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createLocalReq: async (_: unknown, payload: unknown) => ({ payload }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('acquireLock', () => {
  it('refreshes every 60 s on an unref timer, fails the next check once the lock is gone and stops on release', async () => {
    vi.useFakeTimers()
    const interval = vi.spyOn(globalThis, 'setInterval')
    let held = true
    const update = vi.fn(async () => ({ docs: held ? [{}] : [] }))
    const error = vi.fn()
    const payload = {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }),
      delete: async () => ({ docs: [] }),
      find: async () => ({ docs: [] }),
      logger: { error },
      update,
    }
    const lock = await acquireLock({ payload } as unknown as PayloadRequest)
    expect((interval.mock.results[0]!.value as NodeJS.Timeout).hasRef()).toBe(false)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(update).toHaveBeenCalledOnce()
    await expect(lock.check()).resolves.toBeUndefined()

    held = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ msg: 'sitemap: could not refresh the run lock' }))
    await expect(lock.check()).rejects.toThrow('sitemap: the run lock expired and another run took it over')

    await lock.release()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(update).toHaveBeenCalledTimes(2)
  })
})
