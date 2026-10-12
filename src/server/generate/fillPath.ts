const PLACEHOLDER = /:(?:\{([A-Za-z_$][\w$.]*)\}|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*))/g

export const LOCALE_PLACEHOLDER = 'locale'

export const relationValue = (value: unknown, key?: string): unknown =>
  value !== null &&
  typeof value === 'object' &&
  key !== 'relationTo' &&
  key !== 'value' &&
  Object.keys(value).length === 2 &&
  typeof (value as { relationTo?: unknown }).relationTo === 'string' &&
  'value' in value
    ? value.value
    : value

export const valueAt = (source: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (current, key, index) =>
        ((index === 0 ? current : relationValue(current, key)) as Record<string, unknown> | null | undefined)?.[key],
      source,
    )

export const placeholders = (path: string): string[] =>
  [...path.matchAll(PLACEHOLDER)].map(([, braced, plain]) => (braced ?? plain)!)

export const pathFields = (path: string): string[] => placeholders(path).filter((field) => field !== LOCALE_PLACEHOLDER)

export const fillPath = (path: string, doc: Record<string, unknown>, locale?: string): string | undefined => {
  let missing = false
  const filled = path.replace(PLACEHOLDER, (_, braced: string | undefined, plain: string | undefined) => {
    const field = (braced ?? plain)!
    const value = field === LOCALE_PLACEHOLDER ? locale : valueAt(doc, field)
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
      missing = true
      return ''
    }
    return encodeURIComponent(String(value)).replaceAll('%2F', '/')
  })
  return missing ? undefined : filled
}
