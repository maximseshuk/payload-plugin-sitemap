import type { OpenAPIV3_1 } from '@scalar/openapi-types'

const TAGS = ['Sitemap']

const xml = (description: string): OpenAPIV3_1.ResponseObject => ({
  content: { 'application/xml': { schema: { type: 'string' } } },
  description,
})

const fileResponses: OpenAPIV3_1.ResponsesObject = {
  '200': {
    ...xml('The file.'),
    headers: {
      'Cache-Control': { description: '`public, max-age=300`.', schema: { type: 'string' } },
      ETag: { description: 'sha256 of the file content, in quotes.', schema: { type: 'string' } },
    },
  },
  '304': {
    description: 'The file did not change: `If-None-Match` matches its `ETag`. No body.',
    headers: {
      'Cache-Control': { description: '`public, max-age=300`.', schema: { type: 'string' } },
      ETag: { description: 'sha256 of the file content, in quotes.', schema: { type: 'string' } },
    },
  },
  '404': {
    content: { 'text/plain': { schema: { type: 'string' } } },
    description: 'No such file in the last run, an invalid name, or the stored file could not be read.',
  },
}

const ifNoneMatch: OpenAPIV3_1.ParameterObject = {
  description: '`ETag` of a copy the client has. A match returns 304.',
  in: 'header',
  name: 'If-None-Match',
  schema: { type: 'string' },
}

export const indexOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Returns the sitemap index written by the last run. With `output.splitLocales` there is one index per locale, and with `tenants` one per tenant. Public.',
  parameters: [
    {
      description:
        'Locale of the index, with `output.splitLocales`. Unknown or missing locales use the default locale.',
      in: 'query',
      name: 'locale',
      schema: { type: 'string' },
    },
    {
      description: 'Tenant id of the index, with `tenants`. Without it, the endpoint returns 404.',
      in: 'query',
      name: 'tenant',
      schema: { type: 'string' },
    },
    ifNoneMatch,
  ],
  responses: fileResponses,
  security: [],
  summary: 'Get the sitemap index',
  tags: TAGS,
}

export const fileOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Returns one file of the last run by its name from `output.filename`, for example `pages-1.xml` or `en/pages-1.xml`. Public.',
  parameters: [
    {
      description: 'File name, with folders when `output.filename` uses them.',
      in: 'path',
      name: 'filename',
      required: true,
      schema: { pattern: '^[\\w.-]+(/[\\w.-]+)*\\.xml$', type: 'string' },
    },
    {
      description: 'Tenant id, with `tenants`. When set, files of other tenants return 404.',
      in: 'query',
      name: 'tenant',
      schema: { type: 'string' },
    },
    ifNoneMatch,
  ],
  responses: fileResponses,
  security: [],
  summary: 'Get a child sitemap',
  tags: TAGS,
}

const file: OpenAPIV3_1.SchemaObject = {
  properties: {
    filename: { type: 'string' },
    hash: { description: 'sha256 of the file content.', type: 'string' },
    kind: { enum: ['file', 'index'], type: 'string' },
    lastmod: { description: 'Newest `lastmod` in the file.', format: 'date-time', type: 'string' },
    locale: { description: 'Locale, with `output.splitLocales`.', type: 'string' },
    size: { description: 'Size in bytes.', type: 'integer' },
    source: { description: 'Source name, for a child sitemap.', type: 'string' },
    tenant: { description: 'Tenant id, with `tenants`.', type: 'string' },
    url: { description: 'URL of the stored file.', type: 'string' },
    urls: { description: 'Number of URLs. 0 for an index.', type: 'integer' },
  },
  required: ['filename', 'hash', 'kind', 'size', 'url', 'urls'],
  type: 'object',
}

const message: OpenAPIV3_1.ResponseObject = {
  content: {
    'application/json': { schema: { properties: { message: { type: 'string' } }, type: 'object' } },
  },
  description: '',
}

const forbidden: OpenAPIV3_1.ResponseObject = { ...message, description: 'Denied by `admin.access`.' }

export const statusOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Returns the last run, its error and the number of files and URLs, with the state of the generation job, or of the run lock with `jobs: false`. Allowed by `admin.access`, by default users of the admin user collection.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              error: { description: 'Message of the last failed run.', type: ['string', 'null'] },
              errorAt: { format: 'date-time', type: ['string', 'null'] },
              files: { description: 'Files in the last successful run.', type: 'integer' },
              generatedAt: {
                description: 'End of the last successful run.',
                format: 'date-time',
                type: ['string', 'null'],
              },
              state: { enum: ['idle', 'queued', 'running'], type: 'string' },
              urls: { description: 'URLs in the last successful run.', type: ['integer', 'null'] },
            },
            required: ['files', 'state'],
            type: 'object',
          },
        },
      },
      description: 'Sitemap status.',
    },
    '403': forbidden,
  },
  summary: 'Get the sitemap status',
  tags: TAGS,
}

export const filesOperation: OpenAPIV3_1.OperationObject = {
  description:
    'Lists the files of the last successful run, by default index files first, then by name. Allowed by `admin.access`.',
  parameters: [
    { description: 'Page number, from 1.', in: 'query', name: 'page', schema: { minimum: 1, type: 'integer' } },
    {
      description: 'Group the files by this field. Only fields the config has: `tenant`, `locale`, `source`.',
      in: 'query',
      name: 'groupBy',
      schema: { enum: ['locale', 'source', 'tenant'], type: 'string' },
    },
    {
      description: 'With `groupBy`: only the files of this group, paged. Empty for files without the field.',
      in: 'query',
      name: 'group',
      schema: { type: 'string' },
    },
    {
      description: 'Files per page, from 1 to 100.',
      in: 'query',
      name: 'limit',
      schema: { default: 100, maximum: 100, minimum: 1, type: 'integer' },
    },
    {
      description: 'Only files of this tenant, with `tenants`.',
      in: 'query',
      name: 'tenant',
      schema: { type: 'string' },
    },
    { description: 'Only files of this locale.', in: 'query', name: 'locale', schema: { type: 'string' } },
    {
      description: 'Only files whose name contains every word of this text.',
      in: 'query',
      name: 'search',
      schema: { type: 'string' },
    },
    {
      description:
        'Sort by this field, `-` first for descending: `filename`, `locale`, `source`, `urls`, `size` or `lastmod`. Default: index files first, then by name.',
      in: 'query',
      name: 'sort',
      schema: { type: 'string' },
    },
    {
      description: 'Only files of this source. Index files have no source.',
      in: 'query',
      name: 'source',
      schema: { type: 'string' },
    },
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              docs: { items: file, type: 'array' },
              groupBy: { enum: ['locale', 'source', 'tenant'], type: 'string' },
              groups: {
                description: 'Groups of the page, with `groupBy`. Page counts then count groups.',
                items: {
                  properties: {
                    docs: { items: file, type: 'array' },
                    page: { type: 'integer' },
                    totalDocs: { type: 'integer' },
                    totalPages: { type: 'integer' },
                    value: { type: ['string', 'null'] },
                  },
                  required: ['docs', 'page', 'totalDocs', 'totalPages', 'value'],
                  type: 'object',
                },
                type: 'array',
              },
              limit: { description: 'Files per page.', type: 'integer' },
              locale: { description: 'The locale filter.', type: 'string' },
              locales: {
                description: 'Locale codes with `output.splitLocales`, else empty.',
                items: { type: 'string' },
                type: 'array',
              },
              page: { type: 'integer' },
              sort: { description: 'The sort, when one was applied.', type: 'string' },
              source: { description: 'The source filter.', type: 'string' },
              sources: { description: 'Names of the configured sources.', items: { type: 'string' }, type: 'array' },
              tenant: { description: 'The tenant filter, with `tenants`.', type: 'string' },
              tenants: {
                description: 'Tenants of the live files, sorted by title, with `tenants`.',
                items: {
                  properties: { id: { type: 'string' }, title: { type: 'string' } },
                  required: ['id', 'title'],
                  type: 'object',
                },
                type: 'array',
              },
              totalDocs: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
            required: ['docs', 'limit', 'locales', 'page', 'sources', 'totalDocs', 'totalPages'],
            type: 'object',
          },
        },
      },
      description: 'One page of files.',
    },
    '403': forbidden,
  },
  summary: 'List the sitemap files',
  tags: TAGS,
}

export const generateOperation: OpenAPIV3_1.OperationObject = {
  description:
    'With jobs, queues a generation run now, or moves a waiting run forward, and a jobs runner must pick it up. With `jobs: false`, runs the generation in the request. Allowed by `admin.access`.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            properties: {
              files: { description: 'Files written.', type: 'integer' },
              urls: { description: 'URLs written.', type: 'integer' },
            },
            required: ['files', 'urls'],
            type: 'object',
          },
        },
      },
      description: 'Run finished, with `jobs: false`.',
    },
    '202': {
      content: {
        'application/json': {
          schema: {
            properties: { id: { description: 'Id of the queued job.', type: ['string', 'number'] } },
            required: ['id'],
            type: 'object',
          },
        },
      },
      description: 'Run queued.',
    },
    '403': forbidden,
    '409': { ...message, description: 'Another run holds the lock, with `jobs: false`.' },
    '500': { ...message, description: 'The run failed, with `jobs: false`.' },
  },
  summary: 'Start a sitemap run',
  tags: TAGS,
}
