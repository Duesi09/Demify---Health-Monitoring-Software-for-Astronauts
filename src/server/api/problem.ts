import 'server-only'
import { DOCS_PATH } from './limits'

/*
 * Every error of the API has one shape: a problem document, RFC 9457, sent as
 * application/problem+json. The kinds below are the complete list.
 */

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8'

export const PROBLEMS = {
  invalidRequest: {
    status: 400,
    slug: 'invalid-request',
    title: 'Invalid request',
    meaning: 'The request cannot be accepted as sent: a parameter, a header or the body is missing or not valid. `errors` lists each fault. Nothing was saved.',
  },
  unauthorized: {
    status: 401,
    slug: 'unauthorized',
    title: 'Unauthorized',
    meaning: 'The API token is missing or wrong. Send `Authorization: Bearer <token>`.',
  },
  notFound: {
    status: 404,
    slug: 'not-found',
    title: 'Not found',
    meaning: 'No such crew member, or no such address in this API.',
  },
  methodNotAllowed: {
    status: 405,
    slug: 'method-not-allowed',
    title: 'Method not allowed',
    meaning: 'The address exists but does not take this HTTP method. The `Allow` header lists the ones it takes.',
  },
  payloadTooLarge: {
    status: 413,
    slug: 'payload-too-large',
    title: 'Request body too large',
    meaning: 'The request body is larger than the limit. Send the readings in several batches.',
  },
  unsupportedMediaType: {
    status: 415,
    slug: 'unsupported-media-type',
    title: 'Unsupported media type',
    meaning: 'The request body must be JSON, sent with `Content-Type: application/json`.',
  },
  rateLimited: {
    status: 429,
    slug: 'rate-limited',
    title: 'Too many requests',
    meaning: 'This client sent too many write requests. `Retry-After` says how many seconds to wait.',
  },
  internalError: {
    status: 500,
    slug: 'internal-error',
    title: 'Internal error',
    meaning: 'The server failed to answer, for example because its storage could not be reached. The cause is in the server log, never in the response.',
  },
  notConfigured: {
    status: 503,
    slug: 'data-api-not-configured',
    title: 'Data API not configured',
    meaning: 'No API token is configured on the server, so crew data is not served. The operator sets `DEMIFY_API_TOKEN`.',
  },
  notReady: {
    status: 503,
    slug: 'not-ready',
    title: 'Not ready',
    meaning: 'The readiness check failed: storage cannot be reached or cannot take a write.',
  },
} as const

export type ProblemKind = keyof typeof PROBLEMS

/** Where in the request a fault is. */
export type FieldLocation = 'body' | 'query' | 'header' | 'path'

/** One fault in a request. `field` is a parameter or header name, or a path into the JSON body such as `readings[2].value`. */
export interface FieldError {
  in: FieldLocation
  field: string
  detail: string
}

export interface Problem {
  type: string
  title: string
  status: number
  detail: string
  errors?: FieldError[]
  [extension: string]: unknown
}

/** The `type` of a problem: the address of its entry on the documentation page. */
export function problemType(kind: ProblemKind): string {
  return `${DOCS_PATH}#problem-${PROBLEMS[kind].slug}`
}

export function problemOf(kind: ProblemKind, detail: string, errors?: readonly FieldError[], extensions?: Record<string, unknown>): Problem {
  const { status, title } = PROBLEMS[kind]
  return {
    type: problemType(kind),
    title,
    status,
    detail,
    ...(errors && errors.length > 0 ? { errors: [...errors] } : {}),
    ...extensions,
  }
}

interface ApiErrorOptions {
  errors?: readonly FieldError[]
  /** Response headers that belong to this error, such as Retry-After. */
  headers?: Record<string, string>
  /** Further members of the problem document. */
  extensions?: Record<string, unknown>
}

/** A request the API turns away. Thrown anywhere below the route handler and turned into a response there. */
export class ApiError extends Error {
  override name = 'ApiError'

  constructor(
    readonly kind: ProblemKind,
    detail: string,
    readonly options: ApiErrorOptions = {},
  ) {
    super(detail)
  }

  get status(): number {
    return PROBLEMS[this.kind].status
  }

  toProblem(): Problem {
    return problemOf(this.kind, this.message, this.options.errors, this.options.extensions)
  }
}

/** A 400 for one or more faults in the request. */
export function invalidRequest(errors: readonly FieldError[], detail?: string): ApiError {
  return new ApiError('invalidRequest', detail ?? (errors.length === 1 ? errors[0].detail : `The request has ${errors.length} faults; see errors.`), {
    errors,
  })
}

/** Headers of every response of the API: nothing here may be kept by a cache, shared or private. */
export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export function problemResponse(error: ApiError): Response {
  return new Response(JSON.stringify(error.toProblem()), {
    status: error.status,
    headers: { ...NO_STORE, ...error.options.headers, 'Content-Type': PROBLEM_CONTENT_TYPE },
  })
}
