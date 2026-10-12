import { Link } from '@payloadcms/ui'
import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { PLUGIN_NAME, VIEW_PATH } from '@/shared/constants.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const SitemapNavLink = async ({ i18n, params, payload, user }: ServerProps) => {
  const options = payload.config.custom?.[PLUGIN_NAME] as ResolvedOptions | undefined
  if (!user || !options || !(await options.admin.access({ req: await createLocalReq({ user }, payload) }))) return null
  const segments = params?.segments
  const active = (Array.isArray(segments) ? `/${segments.join('/')}` : '') === VIEW_PATH
  const label = (
    <>
      {active && <div className="nav__link-indicator" />}
      <span className="nav__link-label">{i18n.t(`${PLUGIN_NAME}:title` as never)}</span>
    </>
  )
  return active ? (
    <div aria-current="page" className="nav__link" id="nav-sitemap">
      {label}
    </div>
  ) : (
    <Link
      className="nav__link"
      href={formatAdminURL({ adminRoute: payload.config.routes.admin, path: VIEW_PATH })}
      id="nav-sitemap"
      prefetch={false}
    >
      {label}
    </Link>
  )
}
