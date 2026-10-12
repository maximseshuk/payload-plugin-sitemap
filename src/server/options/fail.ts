export const fail = (message: string): never => {
  throw new Error(`sitemap: ${message}`)
}
