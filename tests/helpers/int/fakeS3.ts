import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

type StoredObject = { body: Buffer; type: string }

export type FakeS3 = {
  calls: { method: string; path: string }[]
  close: () => Promise<void>
  endpoint: string
  objects: Map<string, StoredObject>
}

export const fakeS3 = async (): Promise<FakeS3> => {
  const objects = new Map<string, StoredObject>()
  const calls: FakeS3['calls'] = []
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://s3').pathname)
    const method = req.method ?? 'GET'
    calls.push({ method, path })
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)

    if (method === 'PUT') {
      objects.set(path, {
        body: Buffer.concat(chunks),
        type: req.headers['content-type'] ?? 'application/octet-stream',
      })
      res.writeHead(200, { ETag: '"fake"' }).end()
      return
    }
    if (method === 'DELETE') {
      objects.delete(path)
      res.writeHead(204).end()
      return
    }
    const found = objects.get(path)
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/xml' })
      res.end(method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>')
      return
    }
    res.writeHead(200, { 'Content-Length': found.body.length, 'Content-Type': found.type, ETag: '"fake"' })
    res.end(method === 'HEAD' ? undefined : found.body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    endpoint: `http://127.0.0.1:${port}`,
    objects,
  }
}
