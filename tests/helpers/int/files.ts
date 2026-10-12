import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect } from 'vitest'

const HASHED = /\.[\da-f]{12}\.xml$/

export const publicName = (stored: string): string => stored.replace(HASHED, '.xml')

export const storedNames = (dir: string): string[] => readdirSync(dir).filter((name) => HASHED.test(name))

export const read = (dir: string, filename: string): string => {
  const found = storedNames(dir).filter((name) => publicName(name) === filename)
  expect(found).toHaveLength(1)
  return readFileSync(join(dir, found[0]!), 'utf8')
}
