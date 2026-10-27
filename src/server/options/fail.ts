export class SitemapError extends Error {}

export const fail = (message: string): never => {
  throw new SitemapError(`sitemap: ${message}`)
}
