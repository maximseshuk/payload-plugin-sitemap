import type { Config, Widget } from 'payload'

import { VIEW_PATH } from '@/shared/constants.js'
import { label } from '@/shared/translations/index.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

const RSC = '@seshuk/payload-plugin-sitemap/rsc'

const sitemapWidget: Widget = {
  slug: 'sitemap',
  Component: `${RSC}#SitemapWidget`,
  label: label('title'),
  maxWidth: 'full',
  minWidth: 'medium',
}

export const adminConfig = (admin: Config['admin'], options: ResolvedOptions): Config['admin'] => ({
  ...admin,
  ...(options.admin.view && {
    components: {
      ...admin?.components,
      afterNavLinks: [...(admin?.components?.afterNavLinks ?? []), `${RSC}#SitemapNavLink`],
      views: {
        ...admin?.components?.views,
        sitemap: {
          Component: `${RSC}#SitemapView`,
          exact: true,
          meta: { title: label('title').en },
          path: VIEW_PATH,
        },
      },
    },
  }),
  ...(options.admin.widget && {
    dashboard: { ...admin?.dashboard, widgets: [...(admin?.dashboard?.widgets ?? []), sitemapWidget] },
  }),
})
