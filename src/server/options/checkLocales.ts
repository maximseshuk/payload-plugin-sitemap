import type { Config } from 'payload'

import { LOCALE_PLACEHOLDER, placeholders } from '@/server/generate/fillPath.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

import { fail } from './fail.js'

export const checkLocales = (config: Config, options: ResolvedOptions): void => {
  const { localization } = config
  const codes = localization
    ? localization.locales.map((locale) => (typeof locale === 'string' ? locale : locale.code))
    : []
  options.sources.forEach((source, index) => {
    if (
      source.kind === 'collection' &&
      !localization &&
      placeholders(source.collection.pattern ?? '').includes(LOCALE_PLACEHOLDER)
    ) {
      fail(`sources[${index}].url uses :locale, but localization is off`)
    }
    for (const locale of source.locales ?? []) {
      if (!codes.includes(locale)) fail(`sources[${index}].locales: "${locale}" is not a configured locale`)
    }
  })
}
