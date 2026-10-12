import type { CollectionConfig, GlobalConfig, PayloadRequest } from 'payload'

import type { ResolvedOptions } from '@/shared/types/index.js'

import { queueRegeneration } from './queue.js'

export type WatchedSlugs = { collections: Set<string>; globals: Set<string> }

type HookArgs = { doc?: Record<string, unknown>; previousDoc?: Record<string, unknown>; req: PayloadRequest }

export const watchedSlugs = (options: ResolvedOptions): WatchedSlugs => {
  const regenerate = options.jobs && options.jobs.regenerate
  return {
    collections: new Set([
      ...options.sources.flatMap((source) => (source.kind === 'collection' ? [source.slug] : [])),
      ...(regenerate ? regenerate.collections : []),
      ...(options.tenants ? [options.tenants.collection] : []),
    ]),
    globals: new Set(regenerate ? regenerate.globals : []),
  }
}

const regenerateHook =
  (options: ResolvedOptions, delay: number) =>
  async <T extends HookArgs>({ doc, previousDoc, req }: T) => {
    if (doc?._status === 'draft' && previousDoc?._status !== 'published') return doc
    try {
      await queueRegeneration(req, options, delay)
    } catch (err) {
      req.payload.logger.error({ err, msg: 'sitemap: could not queue regeneration' })
    }
    return doc
  }

export const addRegenerateHooks = (
  collections: CollectionConfig[],
  globals: GlobalConfig[],
  options: ResolvedOptions,
  watched: WatchedSlugs,
): { collections: CollectionConfig[]; globals: GlobalConfig[] } => {
  if (!options.jobs || !options.jobs.regenerate) return { collections, globals }
  const hook = regenerateHook(options, options.jobs.regenerate.delay)
  return {
    collections: collections.map((collection) =>
      watched.collections.has(collection.slug)
        ? {
            ...collection,
            hooks: {
              ...collection.hooks,
              afterChange: [...(collection.hooks?.afterChange ?? []), hook],
              afterDelete: [...(collection.hooks?.afterDelete ?? []), hook],
            },
          }
        : collection,
    ),
    globals: globals.map((global) =>
      watched.globals.has(global.slug)
        ? { ...global, hooks: { ...global.hooks, afterChange: [...(global.hooks?.afterChange ?? []), hook] } }
        : global,
    ),
  }
}
