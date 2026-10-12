const SCHEME = /^[a-z][\d+.a-z-]*:/i

export const absoluteURL = (value: string, siteUrl: string): string => {
  if (SCHEME.test(value)) return value
  if (value.startsWith('//')) return `${new URL(siteUrl).protocol}${value}`
  return `${siteUrl}/${value.replace(/^\/+/, '')}`
}
