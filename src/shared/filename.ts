const SEGMENT = /^[\w.-]+$/

export const isFilename = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.endsWith('.xml') &&
  name.split('/').every((segment) => SEGMENT.test(segment) && segment !== '.' && segment !== '..')

export const folderOf = (name: string): string => name.slice(0, name.lastIndexOf('/') + 1)
