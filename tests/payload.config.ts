import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { buildConfig } from 'payload'

import { sitemapFields } from '@/fields/index.js'
import { sitemap } from '@/index.js'

import { authors, categories, media, pages, posts, settings, users } from './collections.js'
import { seed } from './seed.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const SITES: Record<string, string> = {
  de: 'https://example.de',
  en: 'https://example.com',
  fr: 'https://example.fr',
}

const PRODUCTS = ['mug', 'kettle', 'grinder', 'scale', 'filter', 'tamper', 'carafe', 'dripper']

export default buildConfig({
  admin: { importMap: { baseDir: dirname }, user: users.slug },
  collections: [
    {
      ...users,
      fields: [
        {
          name: 'role',
          type: 'select',
          defaultValue: 'editor',
          options: ['admin', 'editor'],
          required: true,
          saveToJWT: true,
        },
      ],
    },
    media,
    pages,
    posts,
    categories,
    authors,
  ],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./tests/payload.db' } }),
  globals: [settings],
  jobs: { autoRun: [{ cron: '*/5 * * * * *', queue: 'default' }] },
  localization: { defaultLocale: 'en', locales: ['en', 'de', 'fr'] },
  onInit: seed,
  telemetry: false,
  plugins: [
    seoPlugin({
      collections: ['pages'],
      fields: ({ defaultFields }) => [...defaultFields, ...sitemapFields()],
      tabbedUI: true,
    }),
    sitemap({
      admin: { access: ({ req }) => (req.user as { role?: string } | null)?.role === 'admin' },
      jobs: { regenerate: { delay: 5000, globals: ['settings'] } },
      output: { maxUrlsPerFile: 100, splitLocales: true },
      siteUrl: ({ locale }) => SITES[locale ?? 'en'] ?? SITES.en!,
      sources: [
        {
          type: 'static',
          entries: ({ locale }) => [
            { changefreq: 'monthly', url: `/${locale}/contact` },
            { changefreq: 'monthly', url: `/${locale}/shop` },
          ],
        },
        {
          type: 'collection',
          collection: 'authors',
          fields: { exclude: true },
          locales: ['en'],
          url: '/en/authors/:slug',
        },
        {
          type: 'collection',
          collection: 'categories',
          changefreq: 'daily',
          fields: true,
          url: ({ doc, locale }) => `/${locale}/c/${doc.slug}`,
        },
        {
          type: 'collection',
          collection: 'pages',
          changefreq: 'weekly',
          query: { where: { noindex: { not_equals: true } } },
          url: ({ doc, locale }) => `/${locale}/${doc.slug === 'home' ? '' : doc.slug}`,
        },
        {
          type: 'collection',
          collection: 'posts',
          fields: { exclude: true, position: { after: 'featured' }, priority: true },
          images: ['image', 'cover', 'gallery.image'],
          locales: ['en'],
          query: { sort: '-publishedAt' },
          url: '/en/blog/:slug',
          priority: ({ doc }) => (doc.featured ? 1 : 0.6),
        },
        {
          type: 'custom',
          entries: function* ({ locale }) {
            for (const product of PRODUCTS) {
              for (let size = 1; size <= 40; size++) yield { url: `/${locale}/shop/${product}-${size}` }
            }
          },
          name: 'products',
        },
      ],
    }),
  ],
  secret: 'sitemap-dev-secret',
  serverURL: 'http://localhost:3104',
  typescript: { autoGenerate: false },
})
