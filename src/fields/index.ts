import type { CheckboxField, Field, NumberField, SelectField } from 'payload'

import { CHANGEFREQ, FIELD_KINDS, FIELD_MARKER } from '@/shared/constants.js'
import { label } from '@/shared/translations/index.js'

export type SitemapFieldKind = (typeof FIELD_KINDS)[number]

export const sitemapExcludeField = (): CheckboxField => ({
  name: 'sitemapExclude',
  type: 'checkbox',
  custom: { [FIELD_MARKER]: 'exclude' },
  label: label('exclude'),
})

export const sitemapPriorityField = (): NumberField => ({
  name: 'sitemapPriority',
  type: 'number',
  admin: { step: 0.1 },
  custom: { [FIELD_MARKER]: 'priority' },
  label: label('priority'),
  max: 1,
  min: 0,
})

export const sitemapChangefreqField = (): SelectField => ({
  name: 'sitemapChangefreq',
  type: 'select',
  custom: { [FIELD_MARKER]: 'changefreq' },
  label: label('changefreq'),
  options: CHANGEFREQ.map((value) => ({ label: value, value })),
})

const builders: Record<SitemapFieldKind, () => Field> = {
  changefreq: sitemapChangefreqField,
  exclude: sitemapExcludeField,
  priority: sitemapPriorityField,
}

export const sitemapFields = (
  pick: Partial<Record<SitemapFieldKind, boolean>> = { changefreq: true, exclude: true, priority: true },
): Field[] => FIELD_KINDS.filter((kind) => pick[kind]).map((kind) => builders[kind]())
