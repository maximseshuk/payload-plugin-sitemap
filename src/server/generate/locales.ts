import type { PayloadRequest } from 'payload'

export type Locales = { all: (string | undefined)[]; defaultLocale?: string }

export const localesOf = (req: PayloadRequest): Locales => {
  const { localization } = req.payload.config
  if (!localization) return { all: [undefined] }
  return { all: localization.localeCodes, defaultLocale: localization.defaultLocale }
}
