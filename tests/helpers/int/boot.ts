import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { testDatabase } from '@seshuk/payload-plugin-tooling/test-database'
import type { Config, Payload, Plugin } from 'payload'
import { buildConfig, getPayload } from 'payload'

import type { SitemapPluginOptions } from '@/index.js'
import { sitemap } from '@/index.js'

import { media, pages, posts, settings, users } from '../../collections.js'

process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true'

export const SERVER = 'http://cms.test'

const staticDir =
  (dir: string): Plugin =>
  (config) => ({
    ...config,
    collections: config.collections?.map((collection) =>
      collection.upload
        ? { ...collection, upload: { ...(collection.upload === true ? {} : collection.upload), staticDir: dir } }
        : collection,
    ),
  })

export const boot = async (
  options: SitemapPluginOptions,
  extra: Partial<Config> = {},
  before: Plugin[] = [],
): Promise<{ dir: string; payload: Payload; teardown: () => Promise<void> }> => {
  const dir = mkdtempSync(join(tmpdir(), 'sitemap-'))
  const payload = await getPayload({
    config: buildConfig({
      collections: [users, media, pages, posts].map((collection) => ({
        ...collection,
        fields: [...collection.fields],
      })),
      db: await testDatabase(),
      globals: [settings],
      localization: { defaultLocale: 'en', locales: ['en', 'de'] },
      plugins: [...before, sitemap(options), staticDir(dir)],
      secret: 'sitemap-test',
      serverURL: SERVER,
      typescript: { autoGenerate: false },
      ...extra,
    }),
  }).catch((error: unknown) => {
    rmSync(dir, { force: true, recursive: true })
    throw error
  })

  const teardown = async () => {
    const db = payload.db as { connection?: { dropDatabase?: () => Promise<unknown> }; destroy?: () => Promise<void> }
    await db.connection?.dropDatabase?.()
    await db.destroy?.()
    ;(globalThis as { _payload?: Map<string, unknown> })._payload?.delete('default')
    rmSync(dir, { force: true, recursive: true })
  }

  return { dir, payload, teardown }
}
