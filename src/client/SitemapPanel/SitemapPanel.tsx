'use client'

import { Banner, Button, ErrorIcon, toast, useConfig } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import type { SitemapFilesPage, SitemapStatus } from '@/shared/types/index.js'

import { SitemapFiles } from './SitemapFiles.js'
import './SitemapPanel.css'
import type { Loaded } from './SitemapPanel.utils.js'
import { loadStatus } from './SitemapPanel.utils.js'
import { SitemapStats } from './SitemapStats.js'
import { useFormat } from './useFormat.js'

type Props = {
  files?: boolean
  generate?: boolean
  href?: string
  initial?: SitemapStatus
  initialFiles?: SitemapFilesPage
  widget?: boolean
}

const POLL = 3000

export const SitemapPanel: React.FC<Props> = ({
  files = true,
  generate = true,
  href,
  initial,
  initialFiles,
  widget = false,
}) => {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const { date, translate } = useFormat()
  const base = `${serverURL}${api}`

  const [loaded, setLoaded] = useState<Loaded | undefined>(initial ? { status: initial } : undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const state = loaded && 'status' in loaded ? loaded.status.state : undefined
    if (loaded && state !== 'queued' && state !== 'running') return
    let active = true
    const timer = setTimeout(
      async () => {
        const result = await loadStatus(base)
        if (active) setLoaded(result)
      },
      loaded ? POLL : 0,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [base, loaded])

  const status = loaded && 'status' in loaded ? loaded.status : undefined
  const pending = busy || status?.state === 'queued' || status?.state === 'running'

  const regenerate = async () => {
    setBusy(true)
    try {
      const response = await fetch(`${base}/sitemap/generate`, { credentials: 'include', method: 'POST' })
      if (response.status === 409) {
        toast.error(translate('busy'))
      } else if (response.status === 500) {
        toast.error(translate('regenerateError'))
      } else if (!response.ok) {
        throw new Error(response.statusText)
      } else if (response.status === 202) {
        toast.success(translate('regenerateQueued'))
      }
      setLoaded(await loadStatus(base))
    } catch {
      toast.error(translate('regenerateError'))
    } finally {
      setBusy(false)
    }
  }

  if (loaded && 'hidden' in loaded) return null

  const Title = widget ? 'h3' : 'h1'
  const label = pending
    ? busy || status?.state === 'running'
      ? 'running'
      : 'queued'
    : !status || status.generatedAt
      ? 'regenerate'
      : 'generate'

  const notice = (loaded && 'failed' in loaded) || (!widget && Boolean(status?.error))
  const body = (
    <>
      {loaded && 'failed' in loaded && (
        <p className="sitemap-panel__error" role="alert">
          {translate('loadError')}
        </p>
      )}
      {!widget && status?.error && (
        <Banner className="sitemap-panel__failed" icon={<ErrorIcon />} type="danger">
          <span className="sitemap-panel__failed-head">
            <strong>{translate('failedTitle')}</strong>
            {status.errorAt && (
              <time className="sitemap-panel__failed-at" dateTime={status.errorAt}>
                {date(status.errorAt)}
              </time>
            )}
          </span>
          <span className="sitemap-panel__failed-message">{status.error}</span>
        </Banner>
      )}
    </>
  )

  return (
    <section className={`sitemap-panel sitemap-panel--${widget ? 'widget' : 'page'}`}>
      <header className="sitemap-panel__header">
        <div className="sitemap-panel__title">
          <Title className="sitemap-panel__title-text">{translate('title')}</Title>
        </div>
        <div className="sitemap-panel__actions">
          {widget && href && (
            <Button buttonStyle="ghost" el="link" margin={false} size="medium" url={href}>
              {translate('open')}
            </Button>
          )}
          {generate && (
            <Button
              buttonStyle={widget ? 'secondary' : 'primary'}
              disabled={pending}
              margin={false}
              onClick={() => void regenerate()}
              size="medium"
            >
              {translate(label)}
            </Button>
          )}
        </div>
      </header>
      {widget ? body : notice && <div className="sitemap-panel__body">{body}</div>}
      {status && <SitemapStats status={status} widget={widget} />}
      {!widget && <SitemapFiles base={base} files={files} initial={initialFiles} status={status} />}
    </section>
  )
}
