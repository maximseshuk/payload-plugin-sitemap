import { fail } from './fail.js'

export const checkSiteUrl = (value: unknown, locale?: string, tenant?: number | string): string => {
  const parts = [tenant !== undefined && `tenant ${tenant}`, locale && `locale "${locale}"`].filter(Boolean)
  const where = parts.length ? ` for ${parts.join(' and ')}` : ''
  if (typeof value !== 'string') return fail(`siteUrl${where} must be a string, got ${String(value)}`)
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname.includes('undefined')) throw new Error()
  } catch {
    return fail(`siteUrl${where} must be an absolute http(s) URL, got "${value}"`)
  }
  return value.replace(/\/+$/, '')
}
