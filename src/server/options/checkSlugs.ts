import type { Payload } from 'payload'

import type { WatchedSlugs } from '@/server/jobs/regenerateHooks.js'

import { fail } from './fail.js'

export const checkSlugs = (payload: Payload, { collections, globals }: WatchedSlugs): void => {
  for (const slug of collections) {
    if (!payload.collections[slug]) fail(`collection "${slug}" does not exist`)
  }
  for (const slug of globals) {
    if (!payload.globals.config.some((global) => global.slug === slug)) fail(`global "${slug}" does not exist`)
  }
}
