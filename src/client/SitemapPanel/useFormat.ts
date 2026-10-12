import { useTranslation } from '@payloadcms/ui'
import { formatDate } from '@payloadcms/ui/shared'

import { PLUGIN_NAME } from '@/shared/constants.js'

import { intlLanguage, relative } from './SitemapPanel.utils.js'

type Translate = (key: string, options?: Record<string, unknown>) => string

export const useFormat = () => {
  const { i18n, t } = useTranslation()
  const language = intlLanguage(i18n.language)
  const translate = (key: string, options?: Record<string, unknown>) =>
    (t as Translate)(`${PLUGIN_NAME}:${key}`, options)
  const strings = (i18n.translations as Record<string, Record<string, string> | undefined>)[PLUGIN_NAME] ?? {}
  return {
    ago: (value: string) => relative(value, language),
    count: (key: string, value: number) => {
      const form = `${key}_${new Intl.PluralRules(language).select(value)}`
      return translate(form in strings ? form : `${key}_other`)
    },
    date: (value?: null | string) => (value ? formatDate({ date: value, i18n, pattern: 'PPp' }) : undefined),
    language,
    number: (value: number) => new Intl.NumberFormat(language).format(value),
    t: t as Translate,
    translate,
  }
}
