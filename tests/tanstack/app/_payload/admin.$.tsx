import { payloadAdminSplatRoute } from '@payloadcms/tanstack-start/client'
import payloadStyles from '@payloadcms/ui/css/app.css?url'
import { createFileRoute } from '@tanstack/react-router'

import { loadAdminPageRSC } from './server.functions.js'

const adminRoute = payloadAdminSplatRoute({ load: loadAdminPageRSC })

export const Route = createFileRoute('/_payload/admin/$')({
  ...adminRoute,
  head: (context) => {
    const head = adminRoute.head(context)
    return { ...head, links: [...head.links, { href: payloadStyles, rel: 'stylesheet' }] }
  },
})
