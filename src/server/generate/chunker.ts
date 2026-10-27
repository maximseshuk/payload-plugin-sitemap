import { URLSET_CLOSE, URLSET_OPEN } from './xml.js'

const FRAME_BYTES = Buffer.byteLength(URLSET_OPEN + URLSET_CLOSE)

export type Chunk = { body: Buffer; lastmod?: string; urls: number }

export const chunker = (
  maxUrls: number,
  maxBytes: number,
): { add: (xml: string, entryLastmod?: string) => Chunk | undefined; end: () => Chunk | undefined } => {
  let parts: string[] = []
  let bytes = FRAME_BYTES
  let urls = 0
  let lastmod: string | undefined

  const end = (): Chunk | undefined => {
    if (urls === 0) return undefined
    const chunk = { body: Buffer.from(URLSET_OPEN + parts.join('') + URLSET_CLOSE), lastmod, urls }
    parts = []
    bytes = FRAME_BYTES
    urls = 0
    lastmod = undefined
    return chunk
  }

  const add = (xml: string, entryLastmod?: string): Chunk | undefined => {
    const size = Buffer.byteLength(xml)
    const full = urls > 0 && (urls >= maxUrls || bytes + size > maxBytes) ? end() : undefined
    parts.push(xml)
    bytes += size
    urls++
    if (entryLastmod && (!lastmod || entryLastmod > lastmod)) lastmod = entryLastmod
    return full
  }

  return { add, end }
}
