import type { PayloadRequest } from 'payload'
import { createPayloadRequest, ValidationError } from 'payload'

import { LOCKS_SLUG } from '@/shared/constants.js'

export const QUEUED_TTL: number = 15 * 60_000

const KEY = 'queued'

const queuedArgs = async (req: PayloadRequest) =>
  ({
    collection: LOCKS_SLUG,
    depth: 0,
    disableTransaction: true,
    overrideAccess: true,
    req: await createPayloadRequest({ context: req.context, payload: req.payload }),
  }) as const

export const isQueued = async (req: PayloadRequest): Promise<boolean> => {
  const { totalDocs } = await req.payload.count({
    collection: LOCKS_SLUG,
    overrideAccess: true,
    req: (await queuedArgs(req)).req,
    where: { and: [{ key: { equals: KEY } }, { expiresAt: { greater_than: new Date().toISOString() } }] },
  })
  return totalDocs > 0
}

export const markQueued = async (req: PayloadRequest, due: number): Promise<void> => {
  const args = await queuedArgs(req)
  const expiresAt = new Date(due + QUEUED_TTL).toISOString()
  const { docs } = await req.payload.update({
    ...args,
    data: { expiresAt },
    where: {
      and: [
        { key: { equals: KEY } },
        {
          or: [
            { expiresAt: { greater_than: expiresAt } },
            { expiresAt: { less_than_equal: new Date().toISOString() } },
          ],
        },
      ],
    },
  })
  if (docs.length > 0) return
  const { totalDocs } = await req.payload.count({ ...args, where: { key: { equals: KEY } } })
  if (totalDocs > 0) return
  try {
    await req.payload.create({ ...args, data: { expiresAt, key: KEY } })
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err
  }
}

export const clearQueued = async (req: PayloadRequest): Promise<void> => {
  await req.payload.delete({ ...(await queuedArgs(req)), where: { key: { equals: KEY } } })
}
