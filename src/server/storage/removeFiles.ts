import type { PayloadRequest } from 'payload'

import type { ResolvedOptions } from '@/shared/types/index.js'

import type { StoredFile } from './storedFiles.js'
import { toStored } from './storedFiles.js'

const BATCH = 500

export const removeFiles = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  files: StoredFile[],
): Promise<boolean> => {
  const { delete: remove } = options.storage
  let removed = true
  for (let start = 0; start < files.length; start += BATCH) {
    const batch = files.slice(start, start + BATCH)
    try {
      const { docs, errors } = await req.payload.delete({
        collection: options.storage.collection,
        depth: 0,
        overrideAccess: true,
        req,
        where: {
          and: [{ id: { in: batch.map(({ id }) => id) } }, { run: { in: [...new Set(batch.map(({ run }) => run))] } }],
        },
      })
      for (const error of errors) {
        removed = false
        req.payload.logger.error({ msg: `sitemap: could not delete file ${String(error.id)}: ${error.message}` })
      }
      if (!remove) continue
      for (const { filename, url } of docs.map(toStored)) {
        try {
          await remove({ filename, req, url })
        } catch (err) {
          req.payload.logger.error({ err, msg: `sitemap: could not delete ${filename} through storage.delete` })
        }
      }
    } catch (err) {
      removed = false
      req.payload.logger.error({ err, msg: 'sitemap: could not delete old files' })
    }
  }
  return removed
}
