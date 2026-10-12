import { s3Storage } from '@payloadcms/storage-s3'
import type { Payload } from 'payload'
import { afterEach, describe, expect, it } from 'vitest'

import type { SitemapPluginOptions } from '@/index.js'
import { DEFAULT_FILES_SLUG, generateSitemap } from '@/index.js'

import type { FakeS3 } from '../helpers/int/fakeS3.js'
import { fakeS3 } from '../helpers/int/fakeS3.js'
import { call, cleanup, publish, reqOf, SITE, start } from '../helpers/int/sitemap.js'

const BUCKET = 'sitemaps'

const options: SitemapPluginOptions = {
  jobs: { regenerate: false },
  siteUrl: SITE,
  sources: [{ type: 'collection', collection: 'pages', locales: ['en'], url: '/:slug' }],
}

let s3: FakeS3 | undefined

afterEach(async () => {
  await s3?.close()
  s3 = undefined
})
afterEach(cleanup)

const startS3 = async () => {
  s3 = await fakeS3()
  const storage = s3Storage({
    bucket: BUCKET,
    collections: { [DEFAULT_FILES_SLUG]: true },
    config: {
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      endpoint: s3.endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    },
  })
  return start(options, { storage: [storage] })
}

const generate = async (payload: Payload) => generateSitemap(await reqOf(payload))

const keys = () => [...s3!.objects.keys()].toSorted()

describe('S3 storage adapter', () => {
  it('stores files in the bucket, serves them and deletes replaced versions', async () => {
    const { payload } = await startS3()
    await publish(payload, 'home')
    await generate(payload)

    const first = keys()
    expect(first).toHaveLength(2)
    for (const key of first) expect(key).toMatch(new RegExp(`^/${BUCKET}/.+\\.[\\da-f]{12}(-original)?\\.xml$`))

    const index = await call(payload, '/sitemap.xml')
    expect(index.status).toBe(200)
    expect(await index.text()).toContain(`<loc>${SITE}/sitemaps/pages-1.xml</loc>`)

    const child = await call(payload, '/sitemaps/pages-1.xml')
    expect(child.status).toBe(200)
    expect(child.headers.get('content-type')).toContain('application/xml')
    expect(await child.text()).toContain(`<loc>${SITE}/home</loc>`)

    const reads = s3!.calls.filter(({ method }) => method === 'GET').length
    const cached = await call(payload, '/sitemaps/pages-1.xml', {
      headers: { 'If-None-Match': child.headers.get('etag')! },
    })
    expect(cached.status).toBe(304)
    expect(s3!.calls.filter(({ method }) => method === 'GET')).toHaveLength(reads)

    const puts = s3!.calls.filter(({ method }) => method === 'PUT').length
    await generate(payload)
    expect(s3!.calls.filter(({ method }) => method === 'PUT')).toHaveLength(puts)
    expect(keys()).toEqual(first)

    await publish(payload, 'about')
    await generate(payload)
    const second = keys()
    expect(second).toHaveLength(2)
    expect(second.filter((key) => first.includes(key))).toEqual([])

    const updated = await call(payload, '/sitemaps/pages-1.xml')
    expect(await updated.text()).toContain(`<loc>${SITE}/about</loc>`)
  })
})
