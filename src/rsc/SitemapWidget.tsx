import type { WidgetServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { SitemapPanel } from '@/client/SitemapPanel/SitemapPanel.js'
import { sitemapStatus } from '@/server/status/sitemapStatus.js'
import { PLUGIN_NAME, VIEW_PATH } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const SitemapWidget = async ({ req }: WidgetServerProps): Promise<React.JSX.Element | null> => {
  const options = req.payload.config.custom?.[PLUGIN_NAME] as ResolvedOptions | undefined
  if (!options || !(await options.admin.access({ req }))) return null
  return (
    <SitemapPanel
      generate={options.endpoints.generate}
      href={
        options.admin.view
          ? formatAdminURL({ adminRoute: req.payload.config.routes.admin, path: VIEW_PATH })
          : undefined
      }
      initial={await sitemapStatus(req, options)}
      widget
    />
  )
}
