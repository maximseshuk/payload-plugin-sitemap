import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { checkSort } from '@/server/options/checkSort.js'
import { resolveOptions } from '@/server/options/resolveOptions.js'

describe('checkSort', () => {
  it('rejects a sort field with many values', () => {
    const payload = {
      collections: { posts: { config: { flattenedFields: [{ name: 'tags', type: 'text', hasMany: true }] } } },
    } as unknown as Payload
    const options = resolveOptions({
      siteUrl: 'https://example.com',
      sources: [{ type: 'collection', collection: 'posts', query: { sort: 'tags' } }],
    })
    expect(() => checkSort(payload, options)).toThrow('sources[0].query.sort: "tags" has many values')
  })
})
