import 'server-only'
import { findCrewMember, isCrewId, type CrewMember } from '@/domain/crew'
import { StoreInputError } from '../repository'
import { requireToken } from './access'
import { allowedMethods, operationsAt, type HttpMethod, type OperationDef } from './definitions'
import { HANDLERS } from './handlers'
import { API_BASE, CLIENT_HEADER, DOCS_PATH, MAX_BODY_BYTES, WRITE_LIMIT } from './limits'
import { CREW_ID, readParameters } from './params'
import { ApiError, invalidRequest, NO_STORE, problemResponse } from './problem'
import { writeLimiter } from './rateLimit'

/*
 * Turns the operations of definitions.ts into the functions a Next route file
 * exports. Every request to the API takes the same path through here, in this
 * order: method, access, crew member, parameters, rate limit, body, handler.
 * A route file only names its path.
 */

export type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> }
export type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>

/** The method functions a route file exports. HEAD is left to Next, which answers it from GET. */
export type RouteHandlers = Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS', RouteHandler>

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function crewMember(id: string | string[] | undefined): CrewMember {
  const member = isCrewId(id) ? findCrewMember(id) : undefined
  if (!member) {
    // An id of the right shape is safe to repeat; anything else is not echoed.
    throw new ApiError('notFound', isCrewId(id) ? `There is no crew member with the id "${id}".` : 'There is no crew member with this id.')
  }
  return member
}

/** Reads the body up to the size limit, whatever Content-Length claims, and parses it as JSON. */
async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(contentType.trim())) {
    throw new ApiError('unsupportedMediaType', 'Send the body as JSON, with the header "Content-Type: application/json".')
  }
  const tooLarge = () =>
    new ApiError('payloadTooLarge', `The body is larger than ${MAX_BODY_BYTES} bytes (${MAX_BODY_BYTES / 1024} KiB). Send the readings in several batches.`)
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw tooLarge()

  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      // Stop reading: the rest of an oversized body is not worth the memory.
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }

  const notJson = () => invalidRequest([{ in: 'body', field: '', detail: 'The body is not valid JSON.' }])
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } catch {
    throw notJson()
  }
  try {
    return JSON.parse(text)
  } catch {
    throw notJson()
  }
}

function failure(operation: OperationDef, error: unknown): Response {
  if (error instanceof ApiError) return problemResponse(error)
  // The store checks its input once more; what it refuses is the client's to fix.
  if (error instanceof StoreInputError) return problemResponse(new ApiError('invalidRequest', error.message))
  // The cause goes to the server log only. A response must not carry paths, SQL or stack traces.
  console.error(`API operation ${operation.id} failed.`, error)
  return problemResponse(new ApiError('internalError', 'The server could not answer this request. The cause is in the server log.'))
}

function run(operation: OperationDef): RouteHandler {
  const hasCrew = operation.parameters.includes(CREW_ID)
  return async (request, context) => {
    try {
      // Access first: without the token a client learns nothing, not even which crew ids exist.
      if (operation.access === 'token') requireToken(request)
      const crew = hasCrew ? crewMember((await context.params).crewId) : undefined

      const { values, errors } = readParameters(operation.parameters, new URL(request.url), request.headers)
      if (errors.length > 0) throw invalidRequest(errors)

      if (operation.write) {
        const wait = writeLimiter().take(String(values[CLIENT_HEADER]))
        if (wait !== null) {
          throw new ApiError(
            'rateLimited',
            `This client sent more than ${WRITE_LIMIT.requests} write requests in ${WRITE_LIMIT.windowSeconds} seconds. Try again in ${wait} seconds.`,
            { headers: { 'Retry-After': String(wait) } },
          )
        }
      }

      const body = operation.requestBody ? await readJsonBody(request) : undefined
      return jsonResponse(await HANDLERS[operation.id]({ crew, params: values, body }))
    } catch (error) {
      return failure(operation, error)
    }
  }
}

/**
 * The exports of the route file for `path` (below /api/v1, parameters in
 * braces). Methods the path has no operation for answer 405 in the API's own
 * error format; left to Next they would answer with an empty body.
 */
export function routeHandlers(path: string): RouteHandlers {
  const operations = operationsAt(path)
  if (operations.length === 0) throw new Error(`No API operation is defined for ${path}. Add it to src/server/api/definitions.ts.`)
  const allow = allowedMethods(path).join(', ')

  const refuse: RouteHandler = async (request) =>
    problemResponse(
      new ApiError('methodNotAllowed', `${API_BASE}${path} does not take ${request.method}. It takes: ${allow}.`, { headers: { Allow: allow } }),
    )
  const handlerFor = (method: HttpMethod): RouteHandler => {
    const operation = operations.find((candidate) => candidate.method === method)
    return operation ? run(operation) : refuse
  }

  return {
    GET: handlerFor('GET'),
    POST: handlerFor('POST'),
    PUT: refuse,
    PATCH: refuse,
    DELETE: refuse,
    // No Access-Control headers, here or anywhere: cross-origin access from browsers is not supported.
    OPTIONS: async () => new Response(null, { status: 204, headers: { ...NO_STORE, Allow: allow } }),
  }
}

/** For the catch-all route: any address under /api/v1 that is not an endpoint answers 404 in the API's error format. */
export function unknownRouteHandlers(): RouteHandlers {
  const notFound: RouteHandler = async () =>
    problemResponse(
      new ApiError('notFound', `There is no such address in this API. The endpoints are listed at ${API_BASE}/openapi.json and ${DOCS_PATH}.`),
    )
  return { GET: notFound, POST: notFound, PUT: notFound, PATCH: notFound, DELETE: notFound, OPTIONS: notFound }
}
