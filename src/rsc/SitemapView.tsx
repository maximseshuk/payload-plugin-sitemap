import { DefaultTemplate } from '@payloadcms/next/templates'
import { NotFoundPage } from '@payloadcms/next/views'
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { SitemapPanel } from '@/client/SitemapPanel/SitemapPanel.js'
import { sitemapFiles } from '@/server/status/sitemapFiles.js'
import { sitemapStatus } from '@/server/status/sitemapStatus.js'
import { PLUGIN_NAME } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const SitemapView = async ({ importMap, initPageResult, params, searchParams, user }: AdminViewServerProps) => {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const options = req.payload.config.custom?.[PLUGIN_NAME] as ResolvedOptions | undefined
  if (!options || !(await options.admin.access({ req }))) {
    return (
      <NotFoundPage
        config={Promise.resolve(req.payload.config)}
        importMap={importMap}
        params={Promise.resolve(params as { segments: string[] })}
        searchParams={Promise.resolve(searchParams as Record<string, string | string[]>)}
      />
    )
  }
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
      <SitemapPanel initial={await sitemapStatus(req, options)} initialFiles={await sitemapFiles(req, options, {})} />
    </DefaultTemplate>
  )
}
