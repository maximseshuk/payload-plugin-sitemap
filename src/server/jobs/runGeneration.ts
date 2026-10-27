import type { PayloadRequest } from 'payload'

import { generateSitemap } from '@/server/generate/generateSitemap.js'
import { acquireLock } from '@/server/lock/runLock.js'
import { fail } from '@/server/options/fail.js'
import { clearQueued } from '@/server/status/queuedState.js'
import { readStatus, writeStatus } from '@/server/status/statusStore.js'
import { publishFiles } from '@/server/storage/publishFiles.js'
import { removeFiles } from '@/server/storage/removeFiles.js'
import { closeBuffer, openBuffer } from '@/server/storage/runBuffer.js'
import { storedFiles } from '@/server/storage/storedFiles.js'
import type { Store } from '@/server/storage/storeFile.js'
import { keepFiles, storeFile } from '@/server/storage/storeFile.js'
import type { ResolvedOptions, SitemapFile } from '@/shared/types/index.js'

const saveError = async (req: PayloadRequest, err: unknown, run: number): Promise<void> => {
  try {
    if (((await readStatus(req)).run ?? 0) !== run) return
    await writeStatus(req, {
      error: err instanceof Error ? err.message : String(err),
      errorAt: new Date().toISOString(),
    })
  } catch (statusErr) {
    req.payload.logger.error({ err: statusErr, msg: 'sitemap: could not save the run error' })
  }
}

export const runGeneration = async (req: PayloadRequest, options: ResolvedOptions): Promise<SitemapFile[]> => {
  const lock = await acquireLock(req)
  const store: Store = { created: [], hidden: [], kept: new Set(), live: new Map(), run: 0, stale: [] }
  try {
    if (options.jobs && options.jobs.mode === 'enqueue') {
      await clearQueued(req).catch((err: unknown) =>
        req.payload.logger.error({ err, msg: 'sitemap: could not clear the queued state' }),
      )
    }
    let current = 0
    let files: SitemapFile[]
    try {
      if (!options.storage.enabled) store.buffer = await openBuffer()
      const status = await readStatus(req)
      current = status.run ?? 0
      Object.assign(store, await storedFiles(req, options, status))
      files = await generateSitemap(
        req,
        options,
        async (filename, body, meta) => {
          await lock.check()
          return storeFile(req, options, store, filename, body, meta)
        },
        (group, discard) => keepFiles(req, options, store, group, discard),
      )
      if (((await readStatus(req)).run ?? 0) !== current) fail('another run finished first, this run is dropped')
      if (!(await removeFiles(req, options, store.hidden))) fail('could not delete the files of an earlier failed run')
      await lock.hold()
      if (((await readStatus(req)).run ?? 0) !== current) fail('another run finished first, this run is dropped')
      await writeStatus(req, {
        error: null,
        errorAt: null,
        files: files.length,
        generatedAt: new Date().toISOString(),
        previousRun: current,
        run: store.run,
        urls: files.reduce((sum, file) => sum + file.urls, 0),
      })
    } catch (err) {
      await removeFiles(req, options, store.created)
      await saveError(req, err, current)
      throw err
    }
    if ((await readStatus(req)).run !== store.run) return files
    if (options.publish) {
      try {
        await publishFiles(req, options, store, lock.hold)
      } catch (err) {
        await saveError(req, err, store.run)
        throw err
      }
    }
    const replaced = [...store.live.values()].filter(({ id }) => !store.kept.has(id))
    await removeFiles(req, options, [...store.stale, ...replaced])
    return files
  } finally {
    await lock.release()
    if (store.buffer) {
      await closeBuffer(store.buffer).catch((err: unknown) =>
        req.payload.logger.error({ err, msg: 'sitemap: could not remove the temporary folder of the run' }),
      )
    }
  }
}
