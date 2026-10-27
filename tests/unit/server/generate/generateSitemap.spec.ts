import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { generateSitemap } from '@/server/generate/generateSitemap.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'
import type { SitemapPluginOptions } from '@/shared/types/index.js'

vi.mock('@/shared/constants.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/constants.js')>()),
  MAX_URLS: 2,
}))

const run = (options: Partial<SitemapPluginOptions>, localization?: Record<string, unknown>) => {
  const req = { payload: { config: { localization }, logger: { warn: vi.fn() } } } as unknown as PayloadRequest
  const store = vi.fn(async (filename: string, _: Buffer, meta: object) => ({ filename, ...meta }) as never)
  const resolved = resolveOptions({
    siteUrl: 'https://example.com',
    sources: [{ type: 'static', entries: [{ url: '/a' }, { url: '/b' }, { url: '/c' }] }],
    ...options,
  })
  return { result: generateSitemap(req, resolved, store, async () => undefined), store }
}

describe('generateSitemap', () => {
  it('fails when one site URL serves two locales with splitLocales', async () => {
    const { result, store } = run(
      { output: { splitLocales: true } },
      { defaultLocale: 'en', localeCodes: ['en', 'de'] },
    )
    await expect(result).rejects.toThrow(
      'output.splitLocales needs a different siteUrl per locale, https://example.com is used by more than one',
    )
    expect(store).not.toHaveBeenCalled()
  })

  it('fails when an index gets more files than the spec allows', async () => {
    const { result } = run({ output: { maxUrlsPerFile: 1 } })
    await expect(result).rejects.toThrow('3 sitemap files exceed the index limit of 2')
  })
})
