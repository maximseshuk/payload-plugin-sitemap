import { oxlintBase } from '@seshuk/payload-plugin-tooling/oxlint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...oxlintBase,
  ignorePatterns: [...oxlintBase.ignorePatterns, 'tests/.next', '**/next-env.d.ts'],
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
