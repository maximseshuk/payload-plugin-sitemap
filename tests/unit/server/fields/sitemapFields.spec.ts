import { findFieldPaths } from '@seshuk/payload-plugin-tooling/fields'
import type { CollectionConfig, Config, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { sitemapFields } from '@/fields/index.js'
import type { SitemapCollectionSource } from '@/index.js'
import { sitemap } from '@/index.js'

const SITE = 'https://example.com'

const seoMeta: Field = {
  name: 'meta',
  type: 'group',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
  ],
}

const postsWith = (fields: Field[]): CollectionConfig => ({ slug: 'posts', fields })

const fieldsOf = (
  fields: SitemapCollectionSource['fields'],
  collection = postsWith([{ name: 'slug', type: 'text' }]),
) => {
  const config = sitemap({ siteUrl: SITE, sources: [{ type: 'collection', collection: 'posts', fields }] })({
    collections: [collection],
    secret: 'x',
  } as unknown as Config) as Config
  return config.collections!.find(({ slug }) => slug === 'posts')!.fields as Record<string, any>[]
}

describe('fields option', () => {
  it('adds all three fields in a sidebar group for true', () => {
    const group = fieldsOf(true).at(-1)!
    expect(group).toMatchObject({ admin: { position: 'sidebar' }, type: 'group' })
    expect(group.name).toBeUndefined()
    expect(group.label.en).toBe('Sitemap')
    expect(group.fields.map((field: { name: string }) => field.name)).toEqual([
      'sitemapExclude',
      'sitemapPriority',
      'sitemapChangefreq',
    ])
  })

  it('adds only the chosen fields and keeps two or more in a group', () => {
    const group = fieldsOf({ changefreq: true, exclude: true }).at(-1)!
    expect(group.type).toBe('group')
    expect(group.fields.map((field: { name: string }) => field.name)).toEqual(['sitemapExclude', 'sitemapChangefreq'])
  })

  it('shows a single field on its own', () => {
    const fields = fieldsOf({ exclude: true })
    expect(fields).toHaveLength(2)
    expect(fields.at(-1)).toMatchObject({ admin: { position: 'sidebar' }, name: 'sitemapExclude', type: 'checkbox' })
  })

  it('adds nothing for false or when left out', () => {
    expect(fieldsOf(false)).toHaveLength(1)
    expect(fieldsOf(undefined)).toHaveLength(1)
  })

  it('inserts after or before a nested path through named tabs and groups', () => {
    const collection = postsWith([
      { name: 'title', type: 'text' },
      {
        type: 'tabs',
        tabs: [
          { fields: [{ name: 'body', type: 'text' }], label: 'Content' },
          { fields: [seoMeta], label: 'SEO' },
        ],
      },
    ])
    const after = fieldsOf({ exclude: true, position: { after: 'meta.description' } }, collection)
    expect(findFieldPaths(after as Field[], () => true)).toEqual([
      'title',
      'body',
      'meta',
      'meta.title',
      'meta.description',
      'meta.sitemapExclude',
    ])
    const before = fieldsOf({ position: { before: 'title' }, priority: true }, collection)
    expect(before[0]).toMatchObject({ name: 'sitemapPriority' })
    expect(before[0]!.admin?.position).toBeUndefined()
    const suffix = fieldsOf({ exclude: true, position: { after: 'description' } }, collection)
    expect(findFieldPaths(suffix as Field[], () => true)).toContain('meta.sitemapExclude')
  })

  it('names the collection and hints at plugin order for a missing path', () => {
    expect(() => fieldsOf({ exclude: true, position: { after: 'meta.description' } })).toThrow(
      'sitemap: sources[0].fields.position: Field path "meta.description" not found in collection "posts". A field added by another plugin, such as the meta group of seoPlugin, exists only when that plugin comes before sitemap in plugins.',
    )
    const twice = postsWith([seoMeta, { name: 'hero', type: 'group', fields: [{ name: 'title', type: 'text' }] }])
    expect(() => fieldsOf({ exclude: true, position: { after: 'title' } }, twice)).toThrow(
      'Field path "title" is ambiguous, use the full path: meta.title, hero.title in collection "posts".',
    )
  })

  it('refuses to add fields twice or to a missing collection', () => {
    expect(() => fieldsOf(true, postsWith([{ name: 'seo', type: 'group', fields: sitemapFields() }]))).toThrow(
      'sources[0].fields: the collection already has sitemap fields',
    )
    const config = { collections: [], secret: 'x' } as unknown as Config
    expect(() =>
      sitemap({
        siteUrl: SITE,
        sources: [
          { type: 'static', entries: [] },
          { type: 'collection', collection: 'posts', fields: true },
        ],
      })(config),
    ).toThrow('sources[1].fields: collection "posts" does not exist')
  })

  it('adds the fields once for a collection listed in two sources', () => {
    const config = sitemap({
      siteUrl: SITE,
      sources: [
        { type: 'collection', collection: 'posts' },
        { type: 'collection', collection: 'posts', fields: { exclude: true }, name: 'news' },
      ],
    })({ collections: [postsWith([{ name: 'slug', type: 'text' }])], secret: 'x' } as unknown as Config) as Config
    const fields = config.collections!.find(({ slug }) => slug === 'posts')!.fields
    expect(fields.map((field) => ('name' in field ? field.name : ''))).toEqual(['slug', 'sitemapExclude'])
  })
})
