import type { PayloadRequest } from 'payload'

import type { ResolvedCollection, SitemapDocArgs, SitemapImageData } from '@/shared/types/index.js'

import { relationValue } from './fillPath.js'

const ABSOLUTE = /^https?:\/\//i

const valuesAt = (source: unknown, path: string[]): unknown[] => {
  if (Array.isArray(source)) return source.flatMap((item) => valuesAt(item, path))
  if (source === null || source === undefined) return []
  const value = relationValue(source, path[0])
  if (path.length === 0) return [value]
  if (typeof value !== 'object' || value === null) return []
  return valuesAt((value as Record<string, unknown>)[path[0]!], path.slice(1))
}

const imageURL = (value: unknown, url?: (image: SitemapImageData) => null | string | undefined) => {
  if (typeof value === 'string') return ABSOLUTE.test(value) ? value : undefined
  if (typeof value !== 'object' || value === null) return undefined
  const image = value as SitemapImageData
  return (url ? url(image) : image.url) ?? undefined
}

const absolute = (req: PayloadRequest, url: string): string | undefined => {
  if (ABSOLUTE.test(url)) return url
  const { serverURL } = req.payload.config
  return serverURL ? new URL(url, serverURL).href : undefined
}

export const documentImages = async (
  images: ResolvedCollection['images'],
  args: SitemapDocArgs,
): Promise<string[] | undefined> => {
  if (!images) return undefined
  const lists = await Promise.all(
    images.map(async (image) => {
      if (typeof image === 'function') return (await image(args)) ?? []
      const [head, ...rest] = image.field.split('.')
      return valuesAt(args.doc[head!], rest).map((value) => imageURL(value, image.url))
    }),
  )
  return [...new Set(lists.flat().flatMap((url) => (url ? (absolute(args.req, url) ?? []) : [])))]
}
