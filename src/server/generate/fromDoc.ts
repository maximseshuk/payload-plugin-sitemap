import type { FromDoc, SitemapDocArgs } from '@/shared/types/index.js'

export const fromDoc = async <T>(value: FromDoc<T>, args: SitemapDocArgs): Promise<T> =>
  typeof value === 'function' ? (value as (args: SitemapDocArgs) => Promise<T> | T)(args) : value
