import type { CollectionConfig, Field } from 'payload'

import { label } from '@/shared/translations/index.js'
import type { ResolvedOptions } from '@/shared/types/index.js'

export const filesCollection = (options: ResolvedOptions): CollectionConfig => {
  const { fields, ...overrides } = options.storage.overrides
  const upload = !options.storage.upload
  const defaultFields: Field[] = [
    { name: 'name', type: 'text', admin: { readOnly: true }, index: true, label: label('file') },
    { name: 'kind', type: 'text', admin: { hidden: true }, index: true },
    { name: 'source', type: 'text', admin: { hidden: true } },
    { name: 'urls', type: 'number', admin: { readOnly: true }, label: label('urls') },
    { name: 'locale', type: 'text', admin: { readOnly: true }, label: label('locale') },
    ...(options.tenants
      ? [{ name: 'tenant', type: 'text', admin: { readOnly: true }, index: true, label: label('tenant') } as const]
      : []),
    { name: 'size', type: 'number', admin: { readOnly: true }, label: label('size') },
    { name: 'lastmod', type: 'text', admin: { hidden: true } },
    { name: 'run', type: 'number', admin: { hidden: true }, index: true },
    { name: 'hash', type: 'text', admin: { hidden: true } },
    { name: 'published', type: 'text', admin: { hidden: true } },
    ...(upload
      ? []
      : [
          { name: 'filename', type: 'text', admin: { hidden: true } } as const,
          { name: 'url', type: 'text', admin: { hidden: true } } as const,
        ]),
  ]
  return {
    access: {
      create: () => false,
      delete: () => false,
      read: ({ req }) => options.admin.access({ req }),
      update: () => false,
    },
    admin: {
      defaultColumns: ['name', 'urls', 'locale', 'updatedAt'],
      hidden: true,
      useAsTitle: 'name',
    },
    labels: { plural: label('files'), singular: label('file') },
    upload,
    versions: false,
    ...overrides,
    slug: options.storage.collection,
    fields: fields ? fields({ defaultFields }) : defaultFields,
  }
}
