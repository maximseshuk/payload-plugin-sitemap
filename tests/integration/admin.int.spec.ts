import { NotFoundPage } from '@payloadcms/next/views'
import type { AdminViewServerProps, PayloadRequest, ServerProps, WidgetServerProps } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SitemapFile } from '@/index.js'
import { generateSitemap } from '@/index.js'
import { SitemapNavLink, SitemapView, SitemapWidget } from '@/rsc/index.js'

import { base, cleanup, reqOf, seed, start, userReq } from '../helpers/int/sitemap.js'

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  Link: () => null,
  SetStepNav: () => null,
  toast: {},
  useConfig: () => ({}),
  useTranslation: () => ({}),
}))
vi.mock('@payloadcms/next/templates', () => ({ DefaultTemplate: () => null }))
vi.mock('@payloadcms/next/views', () => ({ NotFoundPage: () => null }))

afterEach(cleanup)

describe('widget', () => {
  it('renders the summary with the stored status for users with access', async () => {
    const { payload } = await start()
    const req = await userReq(payload)
    await seed(payload)

    const anonymous = await SitemapWidget({ req: await reqOf(payload) } as WidgetServerProps)
    expect(anonymous).toBeNull()

    const empty = await SitemapWidget({ req } as WidgetServerProps)
    expect(empty?.props).toMatchObject({ href: '/admin/sitemap', initial: { files: 0, state: 'idle' }, widget: true })
    expect(empty?.props.initialFiles).toBeUndefined()
    expect(empty?.props.initial.generatedAt).toBeFalsy()

    await generateSitemap(req)
    const filled = await SitemapWidget({ req } as WidgetServerProps)
    expect(filled?.props.initial.urls).toBe(8)
    expect(filled?.props.initial.files).toBe(3)
  })

  it('leaves the page link out when the view is turned off', async () => {
    const { payload } = await start({ ...base, admin: { view: false } })
    const req = await userReq(payload)
    const widget = await SitemapWidget({ req } as WidgetServerProps)
    expect(widget?.props.widget).toBe(true)
    expect(widget?.props.href).toBeUndefined()
  })
})

describe('view', () => {
  const params = { segments: ['sitemap'] }
  const viewProps = (req: PayloadRequest) =>
    ({
      importMap: {},
      initPageResult: { permissions: {}, req, visibleEntities: { collections: [], globals: [] } },
      params,
      searchParams: {},
      user: req.user ?? undefined,
    }) as unknown as AdminViewServerProps
  const navProps = (req: PayloadRequest, segments = params.segments) =>
    ({
      i18n: req.i18n,
      params: { segments },
      payload: req.payload,
      user: req.user ?? undefined,
    }) as unknown as ServerProps

  it('renders the page and the nav link only for users that admin.access allows', async () => {
    const { payload } = await start({ ...base, admin: { access: ({ req }) => req.user?.email === 'dev@example.com' } })
    const req = await userReq(payload)
    const other = await userReq(payload, 'editor@example.com')
    await seed(payload)
    const anonymous = await reqOf(payload)

    for (const blocked of [anonymous, other]) {
      expect((await SitemapView(viewProps(blocked))).type).toBe(NotFoundPage)
      expect(await SitemapNavLink(navProps(blocked))).toBeNull()
    }

    await generateSitemap(req)
    const view = await SitemapView(viewProps(req))
    const [stepNav, panel] = view.props.children
    expect(stepNav.props.nav).toEqual([{ label: 'Sitemap' }])
    expect(panel.props.widget).toBeUndefined()
    expect(panel.props.initial.files).toBe(3)
    expect(panel.props.initialFiles.docs.map((file: SitemapFile) => file.filename)).toEqual([
      'sitemap.xml',
      'pages-1.xml',
      'posts-1.xml',
    ])

    const active = await SitemapNavLink(navProps(req))
    expect(active?.type).toBe('div')
    expect(active?.props).toMatchObject({ 'aria-current': 'page', className: 'nav__link', id: 'nav-sitemap' })
    const idle = await SitemapNavLink(navProps(req, ['collections', 'pages']))
    expect(idle?.props).toMatchObject({ className: 'nav__link', href: '/admin/sitemap', id: 'nav-sitemap' })
  })
})
