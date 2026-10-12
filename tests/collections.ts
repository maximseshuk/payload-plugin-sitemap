import type { CollectionConfig } from 'payload'

export const users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [],
}

export const media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  fields: [],
  upload: true,
}

export const pages: CollectionConfig = {
  slug: 'pages',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', localized: true, required: true },
    { name: 'noindex', type: 'checkbox' },
  ],
  versions: { drafts: true },
}

export const posts: CollectionConfig = {
  slug: 'posts',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', required: true },
    { name: 'category', type: 'group', fields: [{ name: 'slug', type: 'text' }] },
    { name: 'featured', type: 'checkbox' },
    { name: 'image', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'gallery', type: 'array', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] },
  ],
}

export const categories: CollectionConfig = {
  slug: 'categories',
  access: { read: () => true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', required: true },
  ],
}

export const authors: CollectionConfig = {
  slug: 'authors',
  access: { read: () => true },
  admin: { useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true },
  ],
}

export const settings = {
  slug: 'settings',
  fields: [{ name: 'title', type: 'text' as const }],
}
