export const PLUGIN_NAME = '@seshuk/payload-plugin-sitemap'
export const TASK_SLUG = 'sitemap-generate'
export const STATUS_SLUG = 'sitemap-status'
export const LOCKS_SLUG = 'sitemap-locks'
export const DEFAULT_FILES_SLUG = 'sitemap-files'
export const JOBS_SLUG = 'payload-jobs'
export const VIEW_PATH = '/sitemap'

export const MAX_URLS = 50_000
export const MAX_BYTES = 52_428_800
export const MAX_IMAGES = 1000
export const FILES_LIMIT = 100

export const CHANGEFREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'] as const

export const STATIC_SOURCE = 'static'

export const FIELD_MARKER = 'sitemap'
export const FIELD_KINDS = ['exclude', 'priority', 'changefreq'] as const

export const XML_TYPE = 'application/xml; charset=utf-8'
