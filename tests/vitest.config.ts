import { fileURLToPath } from 'node:url'

import { vitestBase } from '@seshuk/payload-plugin-tooling/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  ...vitestBase,
  oxc: { jsx: { runtime: 'automatic' } },
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    hookTimeout: 120_000,
    projects: [
      { extends: true, test: { include: ['tests/unit/**/*.spec.ts'], name: 'unit' } },
      { extends: true, test: { include: ['tests/integration/**/*.int.spec.ts'], name: 'int' } },
    ],
    testTimeout: 120_000,
  },
})
