import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import { removeTempDataDirs, tempDataDir } from '../testing'

/*
 * Helpers shared by the API tests. Not used by the server itself.
 *
 * The tests call the real route files under src/app/api/v1, found on disk, the
 * way Next would: a Request and the path parameters. Nothing here imports
 * server code at the top, so each test can load the server afresh with its own
 * settings.
 */

export const API_BASE = '/api/v1'
/** 32 characters, like the token the guide asks for. Never a real secret. */
export const TEST_TOKEN = 'test-token-0123456789abcdefghijk'
export const TEST_CLIENT = 'test-device-01'

const ROUTES_DIR = fileURLToPath(new URL('../../app/api/v1', import.meta.url))

export interface RouteFile {
  /** Absolute path of the route.ts file. */
  file: string
  /** The address below /api/v1, parameters in braces, as OpenAPI writes it. */
  path: string
  /** True for the route that answers every address no other route file does. */
  catchAll: boolean
}

/** Every route file under src/app/api/v1, as found on disk. */
export function routeFiles(dir = ROUTES_DIR): RouteFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): RouteFile[] => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    if (entry.name !== 'route.ts') return []
    const segments = path.relative(ROUTES_DIR, dir).split(path.sep).filter(Boolean)
    return [
      {
        file: full,
        path: `/${segments.map((segment) => segment.replace(/^\[([^\].]+)\]$/, '{$1}')).join('/')}`,
        catchAll: segments.some((segment) => segment.startsWith('[[...')),
      },
    ]
  })
}

function match(route: RouteFile, pathname: string): Record<string, string> | null {
  const names: string[] = []
  const pattern = route.path.replace(/[.]/g, '\\.').replace(/\{([^}]+)\}/g, (_, name: string) => {
    names.push(name)
    return '([^/]+)'
  })
  const found = new RegExp(`^${pattern}$`).exec(pathname)
  return found && Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(found[index + 1])]))
}

export interface CallOptions {
  /** The bearer token to send. Default: the test token. null: no Authorization header. */
  token?: string | null
  /** The client name to send. Default: the test client. null: no header. */
  client?: string | null
  /** Sent as JSON. */
  json?: unknown
  /** Sent as it is, for bodies that are not JSON. */
  body?: BodyInit
  headers?: Record<string, string>
}

/** Sends a request to the API by calling the route file that answers the address, as Next would. */
export async function call(method: string, target: string, options: CallOptions = {}): Promise<Response> {
  const url = new URL(`http://demify.test${API_BASE}${target}`)
  const pathname = url.pathname.slice(API_BASE.length)
  const routes = routeFiles()
  const hit =
    routes.filter((route) => !route.catchAll).flatMap((route) => {
      const params = match(route, pathname)
      return params ? [{ route, params }] : []
    })[0] ?? { route: routes.find((route) => route.catchAll)!, params: {} }

  const headers = new Headers(options.headers)
  const token = options.token === undefined ? TEST_TOKEN : options.token
  if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  const client = options.client === undefined ? TEST_CLIENT : options.client
  if (client !== null) headers.set('X-Demify-Client', client)
  let body = options.body
  if (options.json !== undefined) {
    body = JSON.stringify(options.json)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  }

  const handlers = (await import(/* @vite-ignore */ hit.route.file)) as Record<string, unknown>
  // Next answers HEAD from GET when a route file exports no HEAD.
  const handler = handlers[method === 'HEAD' && !handlers.HEAD ? 'GET' : method]
  if (typeof handler !== 'function') throw new Error(`${hit.route.file} exports no ${method} handler.`)
  const request = new Request(url, { method, headers, body, ...(body ? { duplex: 'half' } : {}) } as RequestInit)
  return (await handler(request, { params: Promise.resolve(hit.params) })) as Response
}

export interface ServerSettings {
  /** The API token of the server. null: none configured. Default: the test token. */
  token?: string | null
  store?: 'sqlite' | 'json'
  /** Default: a new, empty temporary directory. */
  dataDir?: string
}

/** Starts a server afresh for one test: new settings, an empty data directory, no rate limit history. */
export async function startServer(settings: ServerSettings = {}): Promise<{ dataDir: string }> {
  await stopServer()
  const dataDir = settings.dataDir ?? (await tempDataDir())
  vi.stubEnv('DEMIFY_DATA_DIR', dataDir)
  vi.stubEnv('DEMIFY_STORE', settings.store ?? 'sqlite')
  vi.stubEnv('DEMIFY_API_TOKEN', settings.token === undefined ? TEST_TOKEN : (settings.token ?? ''))
  // The settings are read once per process; loading the modules again reads them again.
  vi.resetModules()
  const { writeLimiter } = await import('./rateLimit')
  writeLimiter().reset()
  return { dataDir }
}

export async function stopServer(): Promise<void> {
  const { closeRepository } = await import('../store')
  await closeRepository()
  vi.unstubAllEnvs()
}

export { removeTempDataDirs }

/** The repository of the running test server, to look at what the API stored. */
export async function repository() {
  const { getRepository } = await import('../store')
  return getRepository()
}

type JsonSchema = Record<string, unknown>

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

/**
 * Checks a value against a JSON Schema and returns what does not fit, with the
 * place. Knows the keywords the API's schemas use, and fails on one it does
 * not know, so a new keyword cannot go unchecked.
 */
export function schemaFaults(schema: JsonSchema, value: unknown, schemas: Record<string, JsonSchema>, at = '$'): string[] {
  if (typeof schema.$ref === 'string') {
    const name = schema.$ref.replace('#/components/schemas/', '')
    if (!schemas[name]) return [`${at}: reference to unknown schema ${schema.$ref}`]
    return schemaFaults(schemas[name], value, schemas, at)
  }
  const faults: string[] = []
  const known = new Set([
    'type', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minimum', 'maximum', 'minItems', 'maxItems',
    'pattern', 'description', 'format', 'default',
  ])
  for (const keyword of Object.keys(schema)) if (!known.has(keyword)) faults.push(`${at}: the test does not know the keyword "${keyword}"`)

  const actual = typeOf(value)
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    if (!allowed.includes(actual) && !(actual === 'integer' && allowed.includes('number'))) {
      return [...faults, `${at}: is ${actual}, expected ${allowed.join(' or ')}`]
    }
  }
  if (Array.isArray(schema.enum) && value !== null && !schema.enum.includes(value)) faults.push(`${at}: ${JSON.stringify(value)} is not one of the allowed values`)
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) faults.push(`${at}: below the minimum`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) faults.push(`${at}: above the maximum`)
  }
  if (typeof value === 'string' && typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
    faults.push(`${at}: does not match the pattern`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) faults.push(`${at}: too few items`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) faults.push(`${at}: too many items`)
    if (schema.items) value.forEach((item, index) => faults.push(...schemaFaults(schema.items as JsonSchema, item, schemas, `${at}[${index}]`)))
  }
  if (actual === 'object') {
    const object = value as Record<string, unknown>
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    for (const name of (schema.required ?? []) as string[]) if (!(name in object)) faults.push(`${at}.${name}: is missing`)
    for (const [name, member] of Object.entries(object)) {
      if (properties[name]) faults.push(...schemaFaults(properties[name], member, schemas, `${at}.${name}`))
      else if (schema.additionalProperties === false) faults.push(`${at}.${name}: is not in the schema`)
    }
  }
  return faults
}
