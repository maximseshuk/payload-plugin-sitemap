import type { GlobalConfig } from 'payload'

import { STATUS_SLUG } from '@/shared/constants.js'
import { label } from '@/shared/translations/index.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const statusGlobal = (options: ResolvedOptions): GlobalConfig => ({
  slug: STATUS_SLUG,
  access: {
    read: ({ req }) => options.admin.access({ req }),
    update: () => false,
  },
  admin: { hidden: true },
  authorship: false,
  fields: [
    { name: 'generatedAt', type: 'date' },
    { name: 'urls', type: 'number' },
    { name: 'error', type: 'textarea' },
    { name: 'errorAt', type: 'date' },
    { name: 'files', type: 'number' },
    { name: 'run', type: 'number' },
    { name: 'previousRun', type: 'number' },
  ],
  label: label('title'),
  versions: false,
})
