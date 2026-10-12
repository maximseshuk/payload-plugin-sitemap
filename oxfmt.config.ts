import { oxfmtBase } from '@seshuk/payload-plugin-tooling/oxfmt'
import { defineConfig } from 'oxfmt'

export default defineConfig({
  ...oxfmtBase,
  ignorePatterns: [
    ...oxfmtBase.ignorePatterns,
    'tests/.next',
    '**/next-env.d.ts',
    'tests/tanstack/routeTree.gen.ts',
    'tests/tanstack/app/_payload/importMap.js',
  ],
})
