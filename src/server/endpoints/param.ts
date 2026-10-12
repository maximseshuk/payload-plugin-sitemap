import type { PayloadRequest } from 'payload'

export const param = (req: PayloadRequest, name: string): string | undefined => {
  const value = req.query?.[name]
  return typeof value === 'string' && value ? value : undefined
}
