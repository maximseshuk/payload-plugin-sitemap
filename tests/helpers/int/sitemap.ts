import type { Payload, Plugin, Where } from 'payload'
import { createPayloadRequest, handleEndpoints } from 'payload'
import { vi } from 'vitest'

import type { SitemapFile, SitemapPluginOptions, SitemapSource } from '@/index.js'
import { TASK_SLUG } from '@/index.js'

import { boot, SERVER } from './boot.js'

export const SITE = 'https://example.com'

export const pages: SitemapSource = {
  type: 'collection',
  collection: 'pages',
  changefreq: 'weekly',
  url: ({ doc, locale, siteUrl }) => (doc.noindex ? null : `${siteUrl}/${locale}/${doc.slug}`),
}
export const posts: SitemapSource = {
  type: 'collection',
  collection: 'posts',
  images: ({ doc }) => (doc.image ? [doc.image] : []),
  url: ({ doc, locale, siteUrl }) => `${siteUrl}/${locale}/blog/${doc.slug}`,
}

export const base: SitemapPluginOptions = {
  jobs: { regenerate: false },
  siteUrl: SITE,
  sources: [pages, posts],
}

export const custom = (
  name: string,
  entries: Extract<SitemapSource, { type: 'custom' }>['entries'],
): SitemapSource => ({
  type: 'custom',
  entries,
  name,
})

let stop: (() => Promise<void>) | undefined

export const cleanup = async () => {
  vi.unstubAllGlobals()
  await stop?.()
  stop = undefined
}

export const start = async (options: SitemapPluginOptions = base, extra = {}, before: Plugin[] = []) => {
  const booted = await boot(options, extra, before)
  stop = booted.teardown
  return booted
}

export const bootFails = (options: SitemapPluginOptions, before: Plugin[] = []) =>
  boot(options, {}, before).finally(() =>
    (globalThis as { _payload?: Map<string, unknown> })._payload?.delete('default'),
  )

export const publish = (payload: Payload, slug: string) =>
  payload.create({
    collection: 'pages',
    data: { _status: 'published', slug, title: slug },
    locale: 'en',
    overrideAccess: true,
  })

export const seed = async (payload: Payload) => {
  const about = await payload.create({
    overrideAccess: true,
    collection: 'pages',
    data: { _status: 'published', slug: 'about', title: 'About' },
    locale: 'en',
  })
  await payload.update({
    overrideAccess: true,
    collection: 'pages',
    data: { _status: 'published', slug: 'ueber-uns', title: 'Über uns' },
    id: about.id,
    locale: 'de',
  })
  await payload.create({
    overrideAccess: true,
    collection: 'pages',
    data: { _status: 'published', noindex: true, slug: 'hidden', title: 'Hidden' },
    locale: 'en',
  })
  await payload.create({
    overrideAccess: true,
    collection: 'pages',
    data: { _status: 'draft', slug: 'draft', title: 'Draft' },
    draft: true,
  })
  for (const index of [1, 2, 3]) {
    await payload.create({
      overrideAccess: true,
      collection: 'posts',
      data: { image: `${SITE}/img/${index}.jpg?a=1&b=2`, slug: `post-${index}`, title: `Post ${index}` },
      locale: 'en',
    })
  }
}

export const reqOf = (payload: Payload) => createPayloadRequest({ payload })

export const publishedRead: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) =>
    collection.slug === 'pages'
      ? {
          ...collection,
          access: {
            read: ({ req }) =>
              req.user ? true : ({ and: [{ _status: { equals: 'published' } }, { slug: { exists: true } }] } as Where),
          },
        }
      : collection,
  ),
})

export const optionalSlug: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) =>
    collection.slug === 'pages'
      ? {
          ...collection,
          fields: collection.fields.map((field) =>
            'name' in field && field.name === 'slug' ? { ...field, required: false } : field,
          ),
        }
      : collection,
  ),
})

export const names = (files: SitemapFile[]) => files.map(({ filename }) => filename).toSorted()

export const call = async (payload: Payload, path: string, init: RequestInit = {}) =>
  handleEndpoints({ config: payload.config, request: new Request(`${SERVER}/api${path}`, init) })

export const body = async (payload: Payload, path: string) => (await call(payload, path)).text()

const userOf = async (payload: Payload, email: string) =>
  (await payload.find({ collection: 'users', limit: 1, overrideAccess: true, where: { email: { equals: email } } }))
    .docs[0] ?? payload.create({ collection: 'users', data: { email, password: 'secret' }, overrideAccess: true })

export const userReq = async (payload: Payload, email = 'dev@example.com') =>
  createPayloadRequest({ payload, user: { ...(await userOf(payload, email)), collection: 'users' } })

export const login = async (payload: Payload) => {
  await userOf(payload, 'dev@example.com')
  const { token } = await payload.login({ collection: 'users', data: { email: 'dev@example.com', password: 'secret' } })
  return { Authorization: `JWT ${token}` }
}

export const pendingJobs = async (payload: Payload) =>
  (
    await payload.find({
      collection: 'payload-jobs',
      overrideAccess: true,
      where: { and: [{ taskSlug: { equals: TASK_SLUG } }, { completedAt: { exists: false } }] },
    })
  ).docs
