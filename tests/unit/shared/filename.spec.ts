import { describe, expect, it } from 'vitest'

import { folderOf, isFilename } from '@/shared/filename.js'

describe('filename', () => {
  it('accepts names with folders and rejects unsafe ones', () => {
    for (const name of ['sitemap.xml', 'en/posts-1.xml', 'a/b/c.d_e-1.xml']) expect(isFilename(name)).toBe(true)
    for (const name of ['', 'a.txt', '/a.xml', 'a//b.xml', '../a.xml', 'a/./b.xml', 'a b.xml', 'a/..', 1]) {
      expect(isFilename(name)).toBe(false)
    }
    expect(folderOf('sitemap.xml')).toBe('')
    expect(folderOf('en/blog/posts-1.xml')).toBe('en/blog/')
  })
})
