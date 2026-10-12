import type { SitemapFile, SitemapFilesPage, SitemapStatus } from '@/shared/types/index.js'

export type Loaded = { failed: true } | { hidden: true } | { status: SitemapStatus }

export type FileFilters = { locale?: string; source?: string; tenant?: string }

export type FileQuery = FileFilters & {
  group?: string
  groupBy?: string
  limit: number
  page: number
  search?: string
  sort?: string
}

export const loadStatus = async (base: string): Promise<Loaded> => {
  try {
    const response = await fetch(`${base}/sitemap/status`, { credentials: 'include' })
    if (response.status === 401 || response.status === 403) return { hidden: true }
    if (!response.ok) return { failed: true }
    return { status: (await response.json()) as SitemapStatus }
  } catch {
    return { failed: true }
  }
}

export const loadFiles = async (base: string, query: FileQuery): Promise<SitemapFilesPage | undefined> => {
  try {
    const params = new URLSearchParams(
      Object.entries(query).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])),
    )
    const response = await fetch(`${base}/sitemap/files?${params}`, { credentials: 'include' })
    return response.ok ? ((await response.json()) as SitemapFilesPage) : undefined
  } catch {
    return undefined
  }
}

const INTL_LANGUAGES: Record<string, string> = { rs: 'sr', 'rs-latin': 'sr-Latn' }

export const intlLanguage = (language: string): string => INTL_LANGUAGES[language] ?? language

export const formatSize = (bytes: number, locale: string): string =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: 'unit',
    unit: bytes < 1_048_576 ? 'kilobyte' : 'megabyte',
    unitDisplay: 'short',
  }).format(bytes < 1_048_576 ? bytes / 1024 : bytes / 1_048_576)

export const sortFiles = (files: SitemapFile[]): SitemapFile[] =>
  files.toSorted(
    (a, b) =>
      Number(b.kind === 'index') - Number(a.kind === 'index') ||
      a.filename.localeCompare(b.filename, 'en', { numeric: true }),
  )

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.34524],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

export const relative = (value: string, language: string) => {
  let amount = Math.min(0, (new Date(value).getTime() - Date.now()) / 1000)
  for (const [unit, size] of UNITS) {
    const rounded = Math.round(amount)
    if (Math.abs(rounded) < size)
      return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(rounded, unit)
    amount /= size
  }
  return ''
}
