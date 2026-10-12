import { describe, expect, it, vi } from 'vitest'

import { staticEntries } from '@/server/generate/staticEntries.js'

import { fakeReq } from '../../../helpers/unit/generate.js'

const SITE = 'https://example.com'

describe('static entries', () => {
  const { req } = fakeReq()

  it('resolves relative and absolute URLs from an array', async () => {
    expect(
      await staticEntries([{ url: '/', priority: 1 }, { url: 'contact' }, { url: 'https://shop.example.com/' }], {
        req,
        siteUrl: SITE,
      }),
    ).toEqual([{ url: `${SITE}/`, priority: 1 }, { url: `${SITE}/contact` }, { url: 'https://shop.example.com/' }])
  })

  it('calls a function per locale', async () => {
    const entries = vi.fn(({ locale }: { locale?: string }) => [{ url: `/${locale}/contact` }])
    expect(await staticEntries(entries, { locale: 'de', req, siteUrl: SITE })).toEqual([{ url: `${SITE}/de/contact` }])
    expect(entries).toHaveBeenCalledWith({ locale: 'de', req, siteUrl: SITE })
  })
})
