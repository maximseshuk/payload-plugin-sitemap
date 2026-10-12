import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readFile } from '@/server/storage/readFile.js'
import type { StoredFile } from '@/server/storage/storedFiles.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

const doc = {
  filename: 'posts-1.abc.xml',
  id: 7,
  name: 'posts-1.xml',
  prefix: 'seo',
  url: '/api/files/posts-1.abc.xml',
}
const file = { ...doc, doc, hash: 'abc', kind: 'file', run: 1 } as StoredFile
const options = { storage: { collection: 'files' } } as ResolvedOptions

const payloadWith = (handler: (...args: unknown[]) => unknown) => ({
  collections: { files: { config: { slug: 'files', upload: { handlers: [() => undefined, handler] } } } },
  config: { serverURL: 'http://cms.test' },
})

const requestWith = (handler: (...args: unknown[]) => unknown) =>
  ({ payload: payloadWith(handler) }) as unknown as PayloadRequest

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('readFile', () => {
  it('passes the stored document to an upload handler and returns its response', async () => {
    const handler = vi.fn(() => new Response('<xml/>'))
    const req = requestWith(handler)

    const response = await readFile(req, options, file)

    expect(await response?.text()).toBe('<xml/>')
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ payload: req.payload }), {
      doc,
      headers: expect.any(Headers),
      params: { collection: 'files', filename: 'posts-1.abc.xml', operation: 'read', prefix: 'seo' },
    })
  })

  it('follows a redirect from an upload handler', async () => {
    const fetch = vi.fn(async () => new Response('<signed/>'))
    vi.stubGlobal('fetch', fetch)
    const req = requestWith(() => new Response(null, { headers: { Location: '/signed/posts-1.xml' }, status: 302 }))

    const response = await readFile(req, options, file)

    expect(await response?.text()).toBe('<signed/>')
    expect(fetch).toHaveBeenCalledWith('http://cms.test/signed/posts-1.xml', { signal: expect.any(AbortSignal) })
  })

  it('hides range and conditional headers from upload handlers and keeps the request usable', async () => {
    let seen: Request | undefined
    const req = Object.assign(
      new Request('http://cms.test/api/sitemap.xml', {
        headers: {
          Accept: 'application/xml',
          ETag: '"x"',
          'If-Modified-Since': 'Sat, 10 Oct 2026 00:00:00 GMT',
          'If-None-Match': '"x"',
          'If-Range': '"x"',
          Range: 'bytes=0-9',
        },
      }),
      {
        payload: payloadWith((handlerReq: unknown) => {
          seen = handlerReq as Request
          return new Response('<xml/>')
        }),
      },
    ) as unknown as PayloadRequest

    await readFile(req, options, file)

    expect([...seen!.headers.keys()]).toEqual(['accept'])
    expect(seen!.url).toBe('http://cms.test/api/sitemap.xml')
    expect(seen!.signal).toBeInstanceOf(AbortSignal)
    expect(req.headers.get('range')).toBe('bytes=0-9')
  })

  it('fetches the absolute URL of the file when no upload handler answers', async () => {
    const fetch = vi.fn(async () => new Response('<direct/>'))
    vi.stubGlobal('fetch', fetch)
    const direct = { ...file, url: 'https://bucket.example.com/seo/posts-1.abc.xml' }

    const response = await readFile(
      requestWith(() => undefined),
      options,
      direct,
    )

    expect(await response?.text()).toBe('<direct/>')
    expect(fetch).toHaveBeenCalledWith('https://bucket.example.com/seo/posts-1.abc.xml', {
      signal: expect.any(AbortSignal),
    })
  })

  it('aborts the fetch of a custom upload URL after 30 s without headers', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init.signal!
            signal.addEventListener('abort', () => reject(signal!.reason))
          }),
      ),
    )
    const upload = { ...options, storage: { ...options.storage, upload: vi.fn() } } as unknown as ResolvedOptions
    const req = { payload: { config: { serverURL: '' } } } as PayloadRequest

    const response = readFile(req, upload, { ...file, url: 'https://cdn.example.com/posts-1.abc.xml' }).catch(
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(29_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(signal?.aborted).toBe(true)
    expect(await response).toBe(signal?.reason)
  })

  it('rejects a relative upload URL without serverURL', async () => {
    const fetch = vi.fn(async () => new Response('<xml/>'))
    vi.stubGlobal('fetch', fetch)
    const req = { payload: { config: { serverURL: '' } }, url: 'http://evil.test/api/sitemap.xml' } as PayloadRequest
    const upload = { ...options, storage: { ...options.storage, upload: vi.fn() } } as unknown as ResolvedOptions

    await expect(readFile(req, upload, file)).rejects.toThrow('serverURL is not set')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never fetches a relative URL or its own file route', async () => {
    const fetch = vi.fn(async () => new Response('<self/>'))
    vi.stubGlobal('fetch', fetch)

    for (const url of [
      '/api/files/file/posts-1.abc.xml',
      'http://cms.test/api/files/file/posts-1.abc.xml',
      'http://cms.test/cms/api/files/file/posts-1.abc.xml',
      'http://cms.test/api/files/file/posts-1.abc.xml/',
      'http://cms.test/cms/api/files/file/posts-1.abc.xml/',
      'https://proxy.example.com/cms/rest/files/file/posts-1.abc.xml?prefix=seo',
    ]) {
      expect(
        await readFile(
          requestWith(() => undefined),
          options,
          { ...file, url },
        ),
      ).toBeUndefined()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
