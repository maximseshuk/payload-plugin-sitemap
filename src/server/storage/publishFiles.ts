import type { PayloadRequest } from 'payload'

import { XML_TYPE } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { readBody } from './readFile.js'
import type { Store } from './storeFile.js'

export const publishFiles = async (
  req: PayloadRequest,
  options: ResolvedOptions,
  store: Store,
  tick: () => Promise<void>,
): Promise<void> => {
  const { delete: remove, put } = options.publish!
  const current = [...store.created, ...[...store.live.values()].filter(({ id }) => store.kept.has(id))]
  for (const kind of ['file', 'index'] as const) {
    for (const file of current.filter((item) => item.kind === kind && item.published !== item.hash)) {
      await tick()
      const body = await readBody(req, options, store, file)
      await put({ body, contentType: XML_TYPE, filename: file.name, req })
      await req.payload.update({
        collection: options.storage.collection,
        data: { published: file.hash },
        depth: 0,
        id: file.id,
        overrideAccess: true,
        req,
      })
    }
  }
  if (!remove) return
  await tick()
  const names = new Set(current.map(({ name }) => name))
  const obsolete = new Set(
    [...store.live.values(), ...store.stale]
      .filter(({ name, published }) => published && !names.has(name))
      .map(({ name }) => name),
  )
  for (const filename of obsolete) {
    try {
      await remove({ filename, req })
    } catch (err) {
      req.payload.logger.error({ err, msg: `sitemap: could not delete ${filename} through publish.delete` })
    }
  }
}
