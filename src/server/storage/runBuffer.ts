import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const bufferPath = (dir: string, name: string): string => path.join(dir, encodeURIComponent(name))

export const openBuffer = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'sitemap-'))

export const bufferBody = (dir: string, name: string, body: Buffer): Promise<void> =>
  writeFile(bufferPath(dir, name), body)

export const bufferedBody = (dir: string, name: string): Promise<Buffer | undefined> =>
  readFile(bufferPath(dir, name)).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return undefined
    throw err
  })

export const dropBody = (dir: string, name: string): Promise<void> => rm(bufferPath(dir, name), { force: true })

export const closeBuffer = (dir: string): Promise<void> => rm(dir, { force: true, recursive: true })
