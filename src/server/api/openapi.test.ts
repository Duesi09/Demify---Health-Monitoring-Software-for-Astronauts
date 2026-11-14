import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tempDataDir } from '../testing'
import {
  call,
  removeTempDataDirs,
  repository,
  routeFiles,
  schemaFaults,
  startServer,
  stopServer,
  TEST_TOKEN,
  type CallOptions,
} from './testing'

// The en dash and the em dash, by code so that this file holds neither.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/*
 * The OpenAPI document against the server. The document is generated from the
 * definitions the router uses, so these tests check the places where the two
 * could still part ways: the route files on disk, the methods they export, the
 * parameters the server really reads, the statuses it really sends, and
 * whether its answers have the documented shape.
 *
 * They fail when a route, a method, a parameter or a status code exists on one
 * side and not on the other.
 */

interface Operation {
  operationId: string
  security: Record<string, string[]>[]
  parameters?: { name: string; in: string; required: boolean; schema: Record<string, unknown>; example: unknown }[]
  requestBody?: { content: Record<string, { schema: Record<string, unknown>; example: unknown }> }
  responses: Record<string, { description: string; headers?: Record<string, unknown>; content: Record<string, { schema: Record<string, unknown>; example: unknown }> }>
}

interface Document {
  openapi: string
  paths: Record<string, Record<string, Operation>>
  components: { schemas: Record<string, Record<string, unknown>>; securitySchemes: Record<string, { type: string; scheme: string }> }
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const HEART_RATE = { readings: [{ day: 51, metric: 'restingHr', value: 130 }] }

async function document(): Promise<Document> {
  return (await (await call('GET', '/openapi.json', { token: null })).json()) as Document
}

/** Every operation of the document, with its method and path. */
function operationsOf(doc: Document) {
  return Object.entries(doc.paths).flatMap(([route, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ route, method: method.toUpperCase(), operation })),
  )
}

/** The address of an operation with its path parameters filled in from their examples. */
function addressOf(route: string, operation: Operation): string {
  return route.replace(/\{([^}]+)\}/g, (_, name: string) => String(operation.parameters?.find((p) => p.in === 'path' && p.name === name)?.example))
}

/** A request that the operation answers with 200: required parameters from their examples, the body from its example. */
function validRequest(route: string, operation: Operation): { target: string; options: CallOptions } {
  const query = (operation.parameters ?? [])
    .filter((p) => p.in === 'query' && p.required)
    .map((p) => `${p.name}=${encodeURIComponent(String(p.example))}`)
    .join('&')
  const body = operation.requestBody?.content['application/json'].example
  return { target: `${addressOf(route, operation)}${query ? `?${query}` : ''}`, options: body === undefined ? {} : { json: body } }
}

async function brokenStorage(): Promise<void> {
  const file = path.join(await tempDataDir(), 'not-a-directory')
  await writeFile(file, '')
  await startServer({ dataDir: path.join(file, 'data') })
}

/**
 * How to make the server send each status. Keyed by status, then by the kind
 * of problem where one status has two. A recipe changes the valid request of
 * the operation, or the server, in the one way that leads to that status.
 */
const RECIPES: Record<string, (request: { target: string; options: CallOptions }, method: string) => Promise<Response>> = {
  '200': ({ target, options }, method) => call(method, target, options),
  '400': ({ target, options }, method) => call(method, `${target}${target.includes('?') ? '&' : '?'}undocumented=1`, options),
  '401': ({ target, options }, method) => call(method, target, { ...options, token: 'not-the-token-not-the-token' }),
  '404': ({ target, options }, method) => call(method, target.replace('/crew/morgan/', '/crew/nobody/'), options),
  '413': ({ target }, method) =>
    call(method, target, { body: JSON.stringify({ padding: 'x'.repeat(64 * 1024) }), headers: { 'Content-Type': 'application/json' } }),
  '415': ({ target }, method) => call(method, target, { body: JSON.stringify(HEART_RATE), headers: { 'Content-Type': 'text/plain' } }),
  '429': async ({ target, options }, method) => {
    let response = await call(method, target, options)
    for (let sent = 0; sent < 60; sent++) response = await call(method, target, options)
    return response
  },
  '500': async ({ target, options }, method) => {
    await brokenStorage()
    return call(method, target, options)
  },
  '503 data-api-not-configured': async ({ target, options }, method) => {
    await startServer({ token: null })
    return call(method, target, options)
  },
  '503 not-ready': async ({ target, options }, method) => {
    await brokenStorage()
    return call(method, target, options)
  },
}

beforeEach(async () => {
  await startServer()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  await stopServer()
  vi.restoreAllMocks()
})

afterAll(removeTempDataDirs)

describe('the OpenAPI document', () => {
  it('is an OpenAPI 3.1 document with the bearer token as its security scheme', async () => {
    const doc = await document()
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.components.securitySchemes).toEqual({ bearerToken: expect.objectContaining({ type: 'http', scheme: 'bearer' }) })
    const ids = operationsOf(doc).map(({ operation }) => operation.operationId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(8)
  })

  it('only refers to schemas that exist, and has no schema nothing refers to', async () => {
    const doc = await document()
    const text = JSON.stringify(doc)
    const referred = new Set([...text.matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)].map((found) => found[1]))
    expect([...referred].sort()).toEqual(Object.keys(doc.components.schemas).sort())
    expect(text).not.toMatch(/"\$ref":"(?!#\/components\/schemas\/)/)
  })

  it('gives every response and every request body an example that fits its schema', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      const bodies = [
        ...Object.entries(operation.responses).flatMap(([status, response]) =>
          Object.entries(response.content).map(([type, media]) => ({ where: `${method} ${route} ${status} ${type}`, media })),
        ),
        ...Object.entries(operation.requestBody?.content ?? {}).map(([type, media]) => ({ where: `${method} ${route} request ${type}`, media })),
      ]
      for (const { where, media } of bodies) {
        expect(media.example, where).toBeDefined()
        expect(schemaFaults(media.schema, media.example, doc.components.schemas), where).toEqual([])
      }
    }
  })

  it('gives every parameter an example that the server accepts', async () => {
    const { parseParameter } = await import('./params')
    const { OPERATIONS } = await import('./definitions')
    for (const operation of OPERATIONS) {
      for (const parameter of operation.parameters) {
        expect(parseParameter(parameter, String(parameter.example)), `${operation.id} ${parameter.name}`).toEqual({ value: parameter.example })
      }
    }
  })

  it('names no em dash or en dash and holds no token', async () => {
    const text = JSON.stringify(await document())
    expect(text).not.toMatch(DASHES)
    expect(text).not.toContain(TEST_TOKEN)
  })
})

describe('routes: the files under src/app/api/v1 and the paths of the document', () => {
  it('has one route file per documented path, and no other besides the catch-all', async () => {
    const doc = await document()
    const files = routeFiles()
    expect(files.filter((file) => file.catchAll).map((file) => file.path)).toEqual(['/[[...rest]]'])
    expect(files.filter((file) => !file.catchAll).map((file) => file.path).sort()).toEqual(Object.keys(doc.paths).sort())
  })

  it('declares the path parameters of every path, and no other', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      const inPath = [...route.matchAll(/\{([^}]+)\}/g)].map((found) => found[1])
      const declared = (operation.parameters ?? []).filter((p) => p.in === 'path')
      expect(declared.map((p) => p.name), `${method} ${route}`).toEqual(inPath)
      expect(declared.every((p) => p.required), `${method} ${route}`).toBe(true)
    }
  })
})

describe('methods: what the route files answer and what the document lists', () => {
  it('answers exactly the documented methods, and every other with 405 and the documented ones in Allow', async () => {
    const doc = await document()
    for (const file of routeFiles().filter((candidate) => !candidate.catchAll)) {
      const exported = Object.keys((await import(/* @vite-ignore */ file.file)) as object).sort()
      expect(exported, file.path).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'dynamic'])

      const documented = Object.keys(doc.paths[file.path]).map((method) => method.toUpperCase())
      const allow = [...documented, ...(documented.includes('GET') ? ['HEAD'] : []), 'OPTIONS'].join(', ')
      const target = file.path.replace('{crewId}', 'morgan')
      for (const method of METHODS) {
        const response = await call(method, target, { json: method === 'GET' ? undefined : HEART_RATE })
        if (documented.includes(method)) {
          expect(response.status, `${method} ${file.path}`).not.toBe(405)
        } else {
          expect(response.status, `${method} ${file.path}`).toBe(405)
          expect(response.headers.get('allow'), `${method} ${file.path}`).toBe(allow)
          expect(response.headers.get('content-type')).toContain('application/problem+json')
        }
      }
      const options = await call('OPTIONS', target)
      expect([options.status, options.headers.get('allow')], file.path).toEqual([204, allow])
    }
  })

  it('answers HEAD wherever it answers GET', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      if (method !== 'GET') continue
      const { target, options } = validRequest(route, operation)
      expect((await call('HEAD', target, options)).status, route).toBe(200)
    }
  })
})

describe('access: the security of every operation', () => {
  it('asks for the token exactly where the document says so', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      const { target, options } = validRequest(route, operation)
      const withoutToken = await call(method, target, { ...options, token: null })
      if (operation.security.length > 0) {
        expect(operation.security, route).toEqual([{ bearerToken: [] }])
        expect(withoutToken.status, `${method} ${route}`).toBe(401)
        expect(route.startsWith('/crew'), route).toBe(true)
      } else {
        expect(withoutToken.status, `${method} ${route}`).toBe(200)
        expect(route.startsWith('/crew'), route).toBe(false)
      }
    }
  })
})

describe('parameters: what the server reads and what the document declares', () => {
  it('refuses a query parameter the document does not declare, on every operation', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      const { target, options } = validRequest(route, operation)
      const response = await call(method, `${target}${target.includes('?') ? '&' : '?'}undocumented=1`, options)
      expect(response.status, `${method} ${route}`).toBe(400)
      expect((await response.json()).errors, `${method} ${route}`).toEqual([{ in: 'query', field: 'undocumented', detail: expect.any(String) }])
    }
  })

  it('reads every declared query and header parameter: a value outside its schema is refused by name', async () => {
    const doc = await document()
    let checked = 0
    for (const { route, method, operation } of operationsOf(doc)) {
      for (const parameter of operation.parameters ?? []) {
        if (parameter.in === 'path') continue
        const { target, options } = validRequest(route, operation)
        // No schema of the API accepts this: not a whole number, not an allowed value, not a valid name.
        const invalid = 'not valid!'
        const url = new URL(target, 'http://demify.test')
        if (parameter.in === 'query') url.searchParams.set(parameter.name, invalid)
        const response = await call(method, `${url.pathname}${url.search}`, {
          ...options,
          ...(parameter.in === 'header' ? { client: null, headers: { [parameter.name]: invalid } } : {}),
        })
        expect(response.status, `${method} ${route} ${parameter.name}`).toBe(400)
        expect((await response.json()).errors, `${method} ${route} ${parameter.name}`).toEqual([
          { in: parameter.in, field: parameter.name, detail: expect.any(String) },
        ])
        checked++
      }
    }
    expect(checked).toBe(7)
  })

  it('needs every parameter the document marks as required, and no other', async () => {
    const doc = await document()
    for (const { route, method, operation } of operationsOf(doc)) {
      // The valid request holds the required parameters only, so its 200 shows that the optional ones are optional.
      const { target, options } = validRequest(route, operation)
      expect((await call(method, target, options)).status, `${method} ${route}`).toBe(200)

      for (const parameter of (operation.parameters ?? []).filter((p) => p.required && p.in !== 'path')) {
        const url = new URL(target, 'http://demify.test')
        url.searchParams.delete(parameter.name)
        const response = await call(method, `${url.pathname}${url.search}`, { ...options, ...(parameter.in === 'header' ? { client: null } : {}) })
        expect(response.status, `${method} ${route} without ${parameter.name}`).toBe(400)
      }
    }
  })
})

describe('status codes: what the server sends and what the document declares', () => {
  it('has a way to produce every declared status, and declares no status without one', async () => {
    const doc = await document()
    const declared = new Set(operationsOf(doc).flatMap(({ operation }) => Object.keys(operation.responses)))
    const produced = new Set(Object.keys(RECIPES).map((key) => key.split(' ')[0]))
    expect([...declared].sort()).toEqual([...produced].sort())
  })

  it('sends every status the document declares for an operation, in the declared shape', async () => {
    const doc = await document()
    let checked = 0
    for (const { route, method, operation } of operationsOf(doc)) {
      for (const [status, declared] of Object.entries(operation.responses)) {
        await startServer()
        const example = Object.values(declared.content)[0].example as { type?: string }
        // 503 has two causes; the example of the declared response says which one is meant.
        const recipe = RECIPES[status] ?? RECIPES[`${status} ${String(example.type).split('#problem-')[1]}`]
        expect(recipe, `${method} ${route} ${status}`).toBeDefined()

        const response = await recipe(validRequest(route, operation), method)
        const where = `${method} ${route} ${status}`
        expect(response.status, where).toBe(Number(status))

        const [contentType, media] = Object.entries(declared.content)[0]
        expect(Object.keys(declared.content), where).toHaveLength(1)
        expect(response.headers.get('content-type'), where).toBe(`${contentType}; charset=utf-8`)
        const body = (await response.json()) as { type?: string }
        expect(schemaFaults(media.schema, body, doc.components.schemas), where).toEqual([])
        if (status !== '200') expect(body.type, where).toBe(example.type)
        for (const header of Object.keys(declared.headers ?? {})) expect(response.headers.get(header), `${where} ${header}`).toEqual(expect.any(String))
        checked++
      }
    }
    // 8 operations: each 200 and 400; 5 with 401, 503 and (4 of them) 404 and 500; the write with 413, 415 and 429; status with its 503.
    expect(checked).toBe(8 * 2 + 5 * 2 + 4 * 2 + 3 + 1)
  })

  it('stores nothing when it refuses a write', async () => {
    const doc = await document()
    const { route, operation } = operationsOf(doc).find(({ method }) => method === 'POST')!
    for (const status of ['400', '401', '404', '413', '415']) {
      await RECIPES[status](validRequest(route, operation), 'POST')
    }
    expect(await (await repository()).listReadings('morgan')).toEqual([])
  })
})
