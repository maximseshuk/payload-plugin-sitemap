'use client'

import {
  ChevronIcon,
  ListQueryProvider,
  PageControlsComponent,
  Pill,
  Popup,
  PopupList,
  ReactSelect,
  SearchFilter,
  SearchIcon,
  SortColumn,
  Table,
} from '@payloadcms/ui'
import type { ClientCollectionConfig, ClientField, Column, PaginatedDocs } from 'payload'
import React, { useEffect, useId, useRef, useState } from 'react'

import { FILES_LIMIT } from '@/shared/constants.js'
import type {
  SitemapFile,
  SitemapFilesGroup,
  SitemapFilesGroupBy,
  SitemapFilesPage,
  SitemapStatus,
} from '@/shared/types/index.js'

import type { FileFilters } from './SitemapPanel.utils.js'
import { formatSize, loadFiles, sortFiles } from './SitemapPanel.utils.js'
import { useFormat } from './useFormat.js'

type Props = {
  base: string
  initial?: SitemapFilesPage
  status?: SitemapStatus
}

type Option = { label: string; value: string }

const all = (label: string, values: Option[]): Option[] => [{ label, value: '' }, ...values]

const options = (values: string[]): Option[] => values.map((value) => ({ label: value, value }))

const unsorted = new Set(['tenant'])

const pageConfig = {} as ClientCollectionConfig

const column = (accessor: string, label: string, renderedCells: React.ReactNode[]): Column => ({
  accessor,
  active: true,
  field: { name: accessor, type: 'text' } as ClientField,
  Heading: <SortColumn disable={unsorted.has(accessor)} Label={label} name={accessor} />,
  renderedCells,
})

const paginated = (
  docs: SitemapFile[],
  { page, totalDocs, totalPages }: Pick<SitemapFilesGroup, 'page' | 'totalDocs' | 'totalPages'>,
  limit: number,
): PaginatedDocs<SitemapFile> => ({
  docs,
  hasNextPage: page < totalPages,
  hasPrevPage: page > 1,
  limit,
  nextPage: page + 1,
  page,
  pagingCounter: (page - 1) * limit + 1,
  prevPage: page - 1,
  totalDocs,
  totalPages,
})

export const SitemapFiles: React.FC<Props> = ({ base, initial, status }) => {
  const { date, language, number, t, translate } = useFormat()
  const [files, setFiles] = useState<SitemapFilesPage | undefined>(initial)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [filters, setFilters] = useState<FileFilters>({})
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<string | undefined>(undefined)
  const [groupBy, setGroupBy] = useState<SitemapFilesGroupBy | undefined>(undefined)
  const [limit, setLimit] = useState(initial?.limit ?? FILES_LIMIT)
  const tenants = (files?.tenants ?? []).map(({ id, title }) => ({ label: title, value: id }))
  const tenant = tenants.some(({ value }) => value === filters.tenant) ? filters.tenant : undefined
  const { locale, source } = filters
  const scope = JSON.stringify([status?.generatedAt, groupBy, limit, locale, search, sort, source, tenant])
  const [paging, setPaging] = useState({ page: 1, scope })
  const page = paging.scope === scope ? paging.page : 1
  const key = `${scope}|${page}`
  const [loadedKey, setLoadedKey] = useState(initial ? key : undefined)
  const [groupPages, setGroupPages] = useState<{ groups: Record<string, SitemapFilesGroup>; key?: string }>({
    groups: {},
  })
  const id = useId()
  const latestGroup = useRef<Record<string, string>>({})
  const ready = Boolean(status)
  const query = { groupBy, limit, locale, search: search || undefined, sort, source, tenant }

  useEffect(() => {
    if (!ready || key === loadedKey) return
    let active = true
    latestGroup.current = {}
    const load = async () => {
      const result = await loadFiles(base, {
        groupBy,
        limit,
        locale,
        page,
        search: search || undefined,
        sort,
        source,
        tenant,
      })
      if (!active) return
      setFailed(!result)
      if (result) setFiles(result)
      setLoadedKey(key)
    }
    void load()
    return () => {
      active = false
    }
  }, [base, groupBy, key, limit, loadedKey, locale, page, ready, search, sort, source, tenant])

  const loadGroup = async (value: null | string, groupPage: number) => {
    const request = `${loadedKey}|${value ?? ''}|${groupPage}`
    latestGroup.current[value ?? ''] = request
    const result = await loadFiles(base, { ...query, group: value ?? '', page: groupPage })
    if (latestGroup.current[value ?? ''] !== request) return
    setFailed(!result)
    if (!result) return
    setGroupPages((previous) => ({
      groups: { ...(previous.key === loadedKey ? previous.groups : {}), [value ?? '']: { ...result, value } },
      key: loadedKey,
    }))
  }

  const locales = files?.locales ?? []
  const sources = files?.sources ?? []
  const titles = new Map(tenants.map(({ label, value }) => [value, label]))
  const fields: { label: string; value: SitemapFilesGroupBy }[] = [
    ...(tenants.length > 0 ? [{ label: translate('tenant'), value: 'tenant' as const }] : []),
    ...(locales.length > 1 ? [{ label: translate('locale'), value: 'locale' as const }] : []),
    ...(sources.length > 1 ? [{ label: translate('source'), value: 'source' as const }] : []),
  ]
  const grouped = files?.groupBy
  const groupLabel = (value: null | string) =>
    value === null
      ? grouped === 'source'
        ? translate('index')
        : t('general:noValue')
      : grouped === 'tenant'
        ? (titles.get(value) ?? value)
        : value
  const filtered = Boolean(tenant || locale || source)
  const filter = (name: keyof FileFilters, label: string, choices: Option[]) => (
    <div className="sitemap-panel__filter">
      <label className="sitemap-panel__filter-label" htmlFor={`${id}-${name}`}>
        {label}
      </label>
      <div className="sitemap-panel__filter-select">
        <ReactSelect
          inputId={`${id}-${name}`}
          isClearable={false}
          onChange={(option) => {
            if (!Array.isArray(option)) setFilters({ ...filters, [name]: String(option.value) || undefined })
          }}
          options={choices}
          value={choices.find(({ value }) => value === (filters[name] ?? '')) ?? choices[0]}
        />
      </div>
    </div>
  )
  const ordered = (list: SitemapFile[]) => (files?.sort ? list : sortFiles(list))
  const columns = (list: SitemapFile[]) => {
    const docs = ordered(list)
    return [
      column(
        'filename',
        t('upload:fileName'),
        docs.map(({ filename, kind }) => (
          <a href={`${base}/sitemaps/${filename}`} key={filename} rel="noreferrer" target="_blank">
            <span className="sitemap-panel__file-name">{filename}</span>
            {kind === 'index' && (
              <Pill className="sitemap-panel__kind" pillStyle="light-gray" size="small">
                {translate('index')}
              </Pill>
            )}
          </a>
        )),
      ),
      ...(tenants.length > 0 && !tenant && grouped !== 'tenant'
        ? [
            column(
              'tenant',
              translate('tenant'),
              docs.map((doc) => (doc.tenant && titles.get(doc.tenant)) ?? '–'),
            ),
          ]
        : []),
      ...(locales.length > 1 && grouped !== 'locale'
        ? [
            column(
              'locale',
              translate('locale'),
              docs.map((doc) => doc.locale ?? '–'),
            ),
          ]
        : []),
      ...(sources.length > 1 && grouped !== 'source'
        ? [
            column(
              'source',
              translate('source'),
              docs.map((doc) => doc.source ?? '–'),
            ),
          ]
        : []),
      column(
        'urls',
        translate('urls'),
        docs.map(({ kind, urls }) => (kind === 'index' ? '–' : number(urls))),
      ),
      column(
        'size',
        translate('size'),
        docs.map(({ size }) => <bdi key="size">{formatSize(size, language)}</bdi>),
      ),
      column(
        'lastmod',
        t('general:lastModified'),
        docs.map(({ lastmod }) => date(lastmod) ?? '–'),
      ),
    ]
  }
  const groups = (files?.groups ?? []).map(
    (group) => (groupPages.key === loadedKey && groupPages.groups[group.value ?? '']) || group,
  )
  const hasFilters = tenants.length > 0 || locales.length > 1 || sources.length > 1
  const empty = files && !failed && (grouped ? !groups.length : !files.docs.length)
  const groupByLabel = t('general:groupByLabel', {
    label: fields.find(({ value }) => value === groupBy)?.label ?? '',
  })

  return (
    <ListQueryProvider
      data={undefined}
      modifySearchParams={false}
      onQueryChange={(value) => setSort(typeof value.sort === 'string' ? value.sort : undefined)}
      query={{ sort }}
    >
      <div className="sitemap-panel__files">
        <div className="sitemap-panel__controls">
          <div className="search-bar">
            <SearchIcon />
            <SearchFilter
              handleChange={(value) => setSearch(value?.trim() ?? '')}
              label={t('general:searchBy', { label: t('upload:fileName') })}
            />
            {(hasFilters || fields.length > 0) && (
              <div className="search-bar__actions">
                {hasFilters && (
                  <Pill
                    aria-controls={`${id}-where`}
                    aria-expanded={open}
                    icon={<ChevronIcon direction={open ? 'up' : 'down'} />}
                    onClick={() => setOpen(!open)}
                    pillStyle={filtered ? 'dark' : 'light'}
                    size="small"
                  >
                    {t('general:filters')}
                  </Pill>
                )}
                {fields.length > 0 && (
                  <Popup
                    button={
                      <Pill
                        icon={<ChevronIcon direction={menu ? 'up' : 'down'} />}
                        pillStyle={groupBy ? 'dark' : 'light'}
                        size="small"
                      >
                        {groupByLabel}
                      </Pill>
                    }
                    buttonType="custom"
                    horizontalAlign="right"
                    onToggleClose={() => setMenu(false)}
                    onToggleOpen={setMenu}
                    render={({ close }) => (
                      <PopupList.ButtonGroup>
                        {[{ label: t('general:none'), value: undefined }, ...fields].map(({ label, value }) => (
                          <PopupList.Button
                            active={value === groupBy}
                            key={value ?? ''}
                            onClick={() => {
                              close()
                              setGroupBy(value)
                            }}
                          >
                            {label}
                          </PopupList.Button>
                        ))}
                      </PopupList.ButtonGroup>
                    )}
                    verticalAlign="bottom"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        {hasFilters && open && (
          <div className="sitemap-panel__where" id={`${id}-where`}>
            {tenants.length > 0 && filter('tenant', translate('tenant'), all(t('general:all'), tenants))}
            {locales.length > 1 &&
              filter('locale', translate('locale'), all(t('general:allLocales'), options(locales)))}
            {sources.length > 1 && filter('source', translate('source'), all(t('general:all'), options(sources)))}
          </div>
        )}
        {failed && (
          <p className="sitemap-panel__error sitemap-panel__files-note" role="alert">
            {translate('loadError')}
          </p>
        )}
        {empty && <p className="sitemap-panel__files-note">{t('general:noResultsDescription')}</p>}
        {files && !grouped && files.docs.length > 0 && (
          <div className="sitemap-panel__table">
            <Table columns={columns(files.docs)} data={ordered(files.docs).map(({ filename }) => ({ id: filename }))} />
          </div>
        )}
        {files &&
          grouped &&
          groups.map((group) => (
            <div className="table-wrap table-wrap--group-by sitemap-panel__table" key={group.value ?? ''}>
              <header className="group-by-header">
                <h4 className="group-by-header__heading">{groupLabel(group.value)}</h4>
              </header>
              <Table
                columns={columns(group.docs)}
                data={ordered(group.docs).map(({ filename }) => ({ id: filename }))}
              />
              <PageControlsComponent
                collectionConfig={pageConfig}
                data={paginated(group.docs, group, files.limit)}
                handlePageChange={async (value) => loadGroup(group.value, value)}
                handlePerPageChange={async (value) => setLimit(value)}
                limit={limit}
              />
            </div>
          ))}
        {files && (
          <PageControlsComponent
            collectionConfig={pageConfig}
            data={paginated(files.docs, files, files.limit)}
            handlePageChange={async (value) => setPaging({ page: value, scope })}
            handlePerPageChange={async (value) => setLimit(value)}
            limit={limit}
          />
        )}
      </div>
    </ListQueryProvider>
  )
}
