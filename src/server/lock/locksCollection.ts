import type { CollectionConfig } from 'payload'

import { LOCKS_SLUG } from '@/shared/constants.js'

export const locksCollection = (): CollectionConfig => ({
  slug: LOCKS_SLUG,
  access: {
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  admin: { hidden: true },
  fields: [
    { name: 'key', type: 'text', index: true, required: true, unique: true },
    { name: 'expiresAt', type: 'date' },
    { name: 'owner', type: 'text' },
  ],
  versions: false,
})
