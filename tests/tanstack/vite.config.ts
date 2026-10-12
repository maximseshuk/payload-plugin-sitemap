import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/tanstack-start'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(
  withPayload(
    ({ pluginOptions }) => ({
      plugins: [rsc(pluginOptions.rsc), tanstackStart(pluginOptions.tanstackStart), viteReact(pluginOptions.react)],
      resolve: { alias: { '@/': `${path.resolve(dirname, '../../src')}/` } },
      server: { port: 3104, strictPort: true },
    }),
    {
      payloadConfigPath: path.resolve(dirname, '../payload.config.ts'),
      routesDirectory: 'app',
      srcDirectory: path.relative(process.cwd(), dirname),
    },
  ),
)
