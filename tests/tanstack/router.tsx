import { payloadParseSearch, payloadStringifySearch } from '@payloadcms/tanstack-start/shared'
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen.js'

export const getRouter = () =>
  createRouter({
    parseSearch: payloadParseSearch,
    routeTree,
    scrollRestoration: true,
    stringifySearch: payloadStringifySearch,
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
