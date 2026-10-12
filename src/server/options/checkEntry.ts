import { CHANGEFREQ } from '@/shared/constants.js'
import type { SitemapEntry } from '@/shared/types/index.js'

import { checkKeys } from './checkKeys.js'
import { fail } from './fail.js'

const ENTRY_KEYS = ['url', 'lastmod', 'changefreq', 'priority', 'alternates', 'images'] as const

export const checkPriority = (value: unknown, where: string): void => {
  if (value === undefined) return
  if (typeof value !== 'number' || !(value >= 0 && value <= 1))
    fail(`${where} must be from 0 to 1, got ${String(value)}`)
}

export const checkChangefreq = (value: unknown, where: string): void => {
  if (value === undefined) return
  if (!CHANGEFREQ.includes(value as never)) {
    fail(`${where} must be one of ${CHANGEFREQ.join(', ')}, got ${JSON.stringify(value)}`)
  }
}

export const checkEntry = (value: unknown, where: string): SitemapEntry => {
  const entry = checkKeys(value, ENTRY_KEYS, where) as SitemapEntry
  if (typeof entry.url !== 'string' || !entry.url) fail(`${where}.url must be a URL or a path`)
  checkPriority(entry.priority, `${where}.priority`)
  checkChangefreq(entry.changefreq, `${where}.changefreq`)
  return entry
}
