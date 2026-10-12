import { oxlintBase } from '@seshuk/payload-plugin-tooling/oxlint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...oxlintBase,
  ignorePatterns: [
    ...oxlintBase.ignorePatterns,
    'tests/.next',
    '**/next-env.d.ts',
    'tests/tanstack/routeTree.gen.ts',
    'tests/tanstack/app/_payload/importMap.js',
  ],
  overrides: [
    ...oxlintBase.overrides,
    {
      files: ['tests/**'],
      rules: {
        'no-await-in-loop': 'off',
      },
    },
  ],
})
