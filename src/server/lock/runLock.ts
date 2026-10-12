import { randomUUID } from 'node:crypto'

import type { PayloadRequest, Where } from 'payload'
import { createLocalReq, ValidationError } from 'payload'

import { fail } from '@/server/options/fail.js'
import { LOCKS_SLUG } from '@/shared/constants.js'

export const BUSY = 'a sitemap run is already in progress'

const KEY = 'run'
const TTL = 5 * 60_000
const REFRESH = 60_000

type LockDoc = { expiresAt?: null | string; id: number | string; owner?: null | string }

export type RunLock = { check: () => Promise<void>; hold: () => Promise<void>; release: () => Promise<void> }

const lockRequest = (req: PayloadRequest): Promise<PayloadRequest> =>
  createLocalReq({ context: req.context }, req.payload)

const expiresAt = (): string => new Date(Date.now() + TTL).toISOString()

const findLocks = async (req: PayloadRequest): Promise<LockDoc[]> =>
  (
    await req.payload.find({
      collection: LOCKS_SLUG,
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req,
      sort: ['createdAt', 'id'],
      where: { key: { equals: KEY } },
    })
  ).docs as LockDoc[]

const isLive = ({ expiresAt: until }: LockDoc): boolean => Boolean(until) && new Date(until!) > new Date()

export const lockHeld = async (req: PayloadRequest): Promise<boolean> =>
  (await findLocks(await lockRequest(req))).some(isLive)

const own = ({ id, owner }: LockDoc): Where => ({ and: [{ id: { equals: id } }, { owner: { equals: owner } }] })

const expired = ({ id }: LockDoc): Where => ({
  and: [{ id: { equals: id } }, { expiresAt: { less_than: new Date().toISOString() } }],
})

const removeLock = async (req: PayloadRequest, where: Where): Promise<void> => {
  await req.payload.delete({
    collection: LOCKS_SLUG,
    depth: 0,
    disableTransaction: true,
    overrideAccess: true,
    req,
    where,
  })
}

const otherLive = async (req: PayloadRequest, id?: number | string): Promise<boolean> =>
  (await findLocks(req)).some((lock) => lock.id !== id && isLive(lock))

const createLock = async (req: PayloadRequest): Promise<LockDoc> => {
  const doc = (await req.payload.create({
    collection: LOCKS_SLUG,
    data: { expiresAt: expiresAt(), key: KEY, owner: randomUUID() },
    depth: 0,
    disableTransaction: true,
    overrideAccess: true,
    req,
  })) as LockDoc
  try {
    if (await otherLive(req, doc.id)) fail(BUSY)
  } catch (err) {
    try {
      await removeLock(req, own(doc))
    } catch (removeErr) {
      req.payload.logger.error({ err: removeErr, msg: 'sitemap: could not release the run lock' })
    }
    throw err
  }
  return doc
}

export const acquireLock = async (caller: PayloadRequest): Promise<RunLock> => {
  const req = await lockRequest(caller)
  let doc: LockDoc | undefined
  for (let attempt = 0; !doc; attempt++) {
    const locks = await findLocks(req)
    if (locks.some(isLive)) fail(BUSY)
    for (const lock of locks) await removeLock(req, expired(lock))
    try {
      doc = await createLock(req)
    } catch (err) {
      if (err instanceof ValidationError || (err as Error).message?.endsWith(BUSY) || (await otherLive(req))) fail(BUSY)
      if (attempt > 0) throw err
    }
  }
  let lost: Error | undefined
  const extend = async (): Promise<void> => {
    const { docs } = await req.payload.update({
      collection: LOCKS_SLUG,
      data: { expiresAt: expiresAt() },
      depth: 0,
      disableTransaction: true,
      overrideAccess: true,
      req,
      where: own(doc),
    })
    if (docs.length === 0) lost = new Error('sitemap: the run lock expired and another run took it over')
    if (lost) throw lost
  }
  const timer = setInterval(() => {
    extend().catch((err: unknown) => {
      req.payload.logger.error({ err, msg: 'sitemap: could not refresh the run lock' })
    })
  }, REFRESH)
  timer.unref()
  return {
    check: async () => {
      if (lost) throw lost
    },
    hold: extend,
    release: async () => {
      clearInterval(timer)
      try {
        await removeLock(req, own(doc))
      } catch (err) {
        req.payload.logger.error({ err, msg: 'sitemap: could not release the run lock' })
      }
    },
  }
}
