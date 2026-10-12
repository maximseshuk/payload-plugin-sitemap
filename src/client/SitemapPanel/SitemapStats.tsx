'use client'

import { CalendarIcon, CopyIcon, LinkIcon, XIcon } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import type { SitemapStatus } from '@/shared/types/index.js'

import { useFormat } from './useFormat.js'

type Props = {
  status: SitemapStatus
  widget?: boolean
}

export const SitemapStats: React.FC<Props> = ({ status, widget }) => {
  const { ago, count, date, number, translate } = useFormat()
  const [, setNow] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])

  const when = (at: string) => (
    <time dateTime={at} suppressHydrationWarning title={date(at)}>
      {ago(at)}
    </time>
  )
  const never = !status.generatedAt && <p className="sitemap-panel__never">{translate('never')}</p>
  const stats = status.generatedAt
    ? [
        {
          icon: <LinkIcon />,
          key: 'urls',
          label: count('urlCount', status.urls ?? 0),
          value: number(status.urls ?? 0),
        },
        {
          icon: <CopyIcon />,
          key: 'files',
          label: count('fileCount', status.files ?? 0),
          value: number(status.files ?? 0),
        },
        {
          icon: <CalendarIcon />,
          key: 'generatedAt',
          label: translate('generatedAt'),
          value: when(status.generatedAt),
        },
      ]
    : []
  if (!widget) {
    return (
      never || (
        <dl className="sitemap-panel__summary">
          {stats.map(({ key, label, value }) => (
            <div className="sitemap-panel__summary-item" key={key}>
              <dt className="sitemap-panel__stat-label">{label}</dt>
              <dd className="sitemap-panel__stat-value">{value}</dd>
            </div>
          ))}
        </dl>
      )
    )
  }
  const cards = status.error
    ? [
        ...stats.slice(0, 2),
        {
          icon: <XIcon />,
          key: 'failed',
          label: <span title={status.error}>{translate('failed', { error: status.error })}</span>,
          value: status.errorAt ? when(status.errorAt) : translate('failedShort'),
        },
      ]
    : stats
  return (
    <>
      {never}
      {cards.length > 0 && (
        <ul className="sitemap-panel__stats">
          {cards.map(({ icon, key, label, value }) => (
            <li className={`card sitemap-panel__stat sitemap-panel__stat--${key}`} key={key}>
              <span aria-hidden="true" className="sitemap-panel__stat-icon">
                {icon}
              </span>
              <span className="sitemap-panel__stat-value">{value}</span>
              <span className="sitemap-panel__stat-label">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
