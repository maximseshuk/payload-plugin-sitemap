import { fail } from './fail.js'

export const checkObject = (value: unknown, where: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${where} must be an object`)
  return value as Record<string, unknown>
}

export const checkKeys = (value: unknown, allowed: readonly string[], where: string): Record<string, unknown> => {
  const object = checkObject(value, where)
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(`unknown option "${key}" in ${where}. Allowed: ${allowed.join(', ')}`)
  }
  return object
}
