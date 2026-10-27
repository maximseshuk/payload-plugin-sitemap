import { SetStepNav } from '@payloadcms/ui'
import { DefaultTemplate } from '@payloadcms/ui/rsc'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { SitemapPanel } from '@/client/SitemapPanel/SitemapPanel.js'
import { sitemapFiles } from '@/server/status/sitemapFiles.js'
import { sitemapStatus } from '@/server/status/sitemapStatus.js'
import { PLUGIN_NAME } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const SitemapView = async ({
  initPageResult,
  params,
  searchParams,
  server,
  user,
}: AdminViewServerProps): Promise<React.JSX.Element> => {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const options = req.payload.config.custom?.[PLUGIN_NAME] as ResolvedOptions | undefined
  if (!options || !(await options.admin.access({ req }))) return server.notFound()
  const title = req.i18n.t(`${PLUGIN_NAME}:title` as never)
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <SetStepNav nav={[{ label: title }]} />
      <SitemapPanel
        files={options.endpoints.files}
        generate={options.endpoints.generate}
        initial={await sitemapStatus(req, options)}
        initialFiles={await sitemapFiles(req, options, {})}
      />
    </DefaultTemplate>
  )
}
