import type { PayloadRequest } from 'payload'

import { STATUS_SLUG } from '@/shared/constants.js'

export type StoredStatus = {
  error?: null | string
  errorAt?: null | string
  files?: null | number
  generatedAt?: null | string
  previousRun?: null | number
  run?: null | number
  urls?: null | number
}

export const readStatus = async (req: PayloadRequest): Promise<StoredStatus> =>
  (await req.payload.findGlobal({ depth: 0, overrideAccess: true, req, slug: STATUS_SLUG })) as StoredStatus

export const writeStatus = async (req: PayloadRequest, data: StoredStatus): Promise<void> => {
  await req.payload.updateGlobal({ data, depth: 0, overrideAccess: true, req, slug: STATUS_SLUG })
}
