import { describe, expect, it } from 'vitest'

import { intlLanguage } from '@/client/SitemapPanel/SitemapPanel.utils.js'
import { PLUGIN_NAME } from '@/shared/constants.js'
import { translations } from '@/shared/translations/index.js'

describe('translations', () => {
  it('has every translation key in every language', () => {
    const counted = /^(urlCount|fileCount)_/
    const keys = Object.keys(translations.en[PLUGIN_NAME])
      .filter((key) => !counted.test(key))
      .toSorted()
    const languages = Object.entries(translations)
    expect(languages).toHaveLength(44)
    expect(
      Object.fromEntries(
        languages.map(([language, strings]) => [
          language,
          Object.keys(strings[PLUGIN_NAME])
            .filter((key) => !counted.test(key))
            .toSorted(),
        ]),
      ),
    ).toEqual(Object.fromEntries(languages.map(([language]) => [language, keys])))
  })

  it('has a count label for every plural form of every language', () => {
    const missing = Object.entries(translations).flatMap(([language, strings]) =>
      new Intl.PluralRules(intlLanguage(language))
        .resolvedOptions()
        .pluralCategories.flatMap((form) => ['urlCount', 'fileCount'].map((key) => `${key}_${form}`))
        .filter((key) => !strings[PLUGIN_NAME][key])
        .map((key) => `${language}:${key}`),
    )
    expect(missing).toEqual([])
  })
})
