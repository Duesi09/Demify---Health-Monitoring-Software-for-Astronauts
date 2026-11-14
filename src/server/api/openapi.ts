import 'server-only'
import { CREW } from '@/domain/crew'
import { simulateMission } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { metricsCatalog } from './catalog'
import { crewList } from './crew'
import { declaredResponses, OPERATIONS, TAGS, type DeclaredResponse, type OperationDef, type OperationId } from './definitions'
import { evaluationView } from './evaluation'
import { API_BASE, API_VERSION, CLIENT_HEADER, DOCS_PATH, MAX_BATCH_READINGS, MAX_BODY_BYTES, WRITE_LIMIT } from './limits'
import type { ParameterDef } from './params'
import { problemOf, type Problem, type ProblemKind } from './problem'
import { filterReadings } from './readings'
import { ref, SCHEMAS } from './schemas'
import { APP_VERSION } from './status'

/*
 * The OpenAPI 3.1 description of the API, built from definitions.ts, params.ts
 * and schemas.ts: the same objects the router works from. Nothing in the
 * document is written twice, so it cannot fall behind the code.
 */

export const SECURITY_SCHEME = 'bearerToken'

const KIB = MAX_BODY_BYTES / 1024

const DESCRIPTION = `The HTTP API of Demify, a health monitor for astronauts on long missions. Devices and ground systems send readings through it and read back what the monitor concludes.

**Simulated data.** The mission data that ships with Demify is simulated. Every reading carries a \`source\`: \`simulated\` (the built-in mission log, not a measurement), \`device\` (sent through this API) or \`manual\` (entered by the crew member). For one day and indicator a \`manual\` reading is used before a \`device\` reading, and a \`device\` reading before a \`simulated\` one. The reference ranges are demo defaults, not flight rules and not medical advice.

**Access.** The endpoints under *Service* and *Reference* are open. The endpoints under *Crew data* carry health data: they need \`Authorization: Bearer <token>\`, where the token is the server's \`DEMIFY_API_TOKEN\`. A server without a configured token answers these endpoints with 503 and serves no crew data at all. Use HTTPS in front of the server; the token is a shared secret.

**Errors.** Every error is a problem document (RFC 9457, \`application/problem+json\`) with \`type\`, \`title\`, \`status\` and \`detail\`; a 400 also lists every fault under \`errors\`. Bad input is always 400. A method an address does not take answers 405 with an \`Allow\` header, an address that does not exist under ${API_BASE} answers 404, and an unexpected failure answers 500, all in the same format. The kinds of problem are explained at ${DOCS_PATH}.

**Limits.** A request body may be ${KIB} KiB at most and a batch may hold 1 to ${MAX_BATCH_READINGS} readings. Each client name may send ${WRITE_LIMIT.requests} write requests per ${WRITE_LIMIT.windowSeconds} seconds; the count is kept in memory per server process. A query parameter an endpoint does not document is refused with 400.

**Caching and browsers.** Every response is \`Cache-Control: no-store\`. Cross-origin access (CORS) is not supported: the API sends no \`Access-Control\` headers, so a web page on another origin cannot read it.`

/** A device heart rate of 130 on mission day 51, on top of the simulated log: the case the guide walks through. */
const EXAMPLE_DAY = 51
const EXAMPLE_CLIENT = 'hr-monitor-01'
const EXAMPLE_READING: Reading = { day: EXAMPLE_DAY, metric: 'restingHr', value: 130, source: 'device' }

function exampleReadings(): Reading[] {
  return [...simulateMission(), EXAMPLE_READING]
}

/** An example of each 200 response. Built by the code that builds the real ones, then cut short. */
const SUCCESS_EXAMPLES: Record<OperationId, () => unknown> = {
  getStatus: () => ({
    ready: true,
    version: APP_VERSION,
    apiVersion: API_VERSION,
    dataApiEnabled: true,
    storage: { driver: 'sqlite', schemaVersion: 2, writable: true, audit: 'transactional' },
  }),
  getOpenApi: () => ({ openapi: '3.1.0', info: { title: 'Demify API', version: API_VERSION }, paths: {}, components: {} }),
  getMetricsCatalog: () => {
    const catalog = metricsCatalog()
    return { ...catalog, metrics: catalog.metrics.slice(0, 1) }
  },
  listCrew: () => crewList(),
  listReadings: () => {
    const readings = filterReadings(exampleReadings(), { from: EXAMPLE_DAY, to: EXAMPLE_DAY }).filter(
      (r) => r.metric === 'restingHr' || r.metric === 'spo2',
    )
    return { crewId: CREW[0].id, count: readings.length, readings }
  },
  saveReadings: () => ({
    crewId: CREW[0].id,
    actor: `api:${EXAMPLE_CLIENT}`,
    saved: 2,
    readings: [EXAMPLE_READING, { day: EXAMPLE_DAY, metric: 'spo2', value: 97, source: 'device' }],
  }),
  getEvaluation: () => {
    const view = evaluationView(CREW[0].id, exampleReadings(), EXAMPLE_DAY)
    return { ...view, assessments: view.assessments.slice(0, 1) }
  },
  listAudit: () => ({
    crewId: CREW[0].id,
    entries: [
      {
        id: 2,
        at: '2031-03-01T08:00:05.000Z',
        actor: `api:${EXAMPLE_CLIENT}`,
        crewId: CREW[0].id,
        action: 'replace',
        day: EXAMPLE_DAY,
        metric: 'restingHr',
        before: 128,
        after: 130,
      },
      {
        id: 1,
        at: '2031-03-01T08:00:00.000Z',
        actor: `api:${EXAMPLE_CLIENT}`,
        crewId: CREW[0].id,
        action: 'create',
        day: EXAMPLE_DAY,
        metric: 'restingHr',
        before: null,
        after: 128,
      },
    ],
    nextCursor: null,
  }),
}

/** An example of each kind of problem, as the server words it. */
const PROBLEM_EXAMPLES: Record<ProblemKind, Problem> = {
  invalidRequest: problemOf('invalidRequest', 'Resting heart rate: enter a value between 25 and 230 bpm.', [
    { in: 'body', field: 'readings[0].value', detail: 'Resting heart rate: enter a value between 25 and 230 bpm.' },
  ]),
  unauthorized: problemOf('unauthorized', 'The API token is not valid.'),
  notFound: problemOf('notFound', 'There is no crew member with the id "nobody".'),
  methodNotAllowed: problemOf('methodNotAllowed', `${API_BASE}/crew does not take DELETE. It takes: GET, HEAD, OPTIONS.`),
  payloadTooLarge: problemOf('payloadTooLarge', `The body is larger than ${MAX_BODY_BYTES} bytes (${KIB} KiB). Send the readings in several batches.`),
  unsupportedMediaType: problemOf('unsupportedMediaType', 'Send the body as JSON, with the header "Content-Type: application/json".'),
  rateLimited: problemOf(
    'rateLimited',
    `This client sent more than ${WRITE_LIMIT.requests} write requests in ${WRITE_LIMIT.windowSeconds} seconds. Try again in 42 seconds.`,
  ),
  internalError: problemOf('internalError', 'The server could not answer this request. The cause is in the server log.'),
  notConfigured: problemOf(
    'notConfigured',
    'The data API is not configured on this server, so crew data is not served. The operator sets DEMIFY_API_TOKEN (16 to 512 characters) and restarts the server.',
  ),
  notReady: problemOf('notReady', 'Storage cannot take a write right now, for example because the disk is read-only.', undefined, {
    ready: false,
    version: APP_VERSION,
    apiVersion: API_VERSION,
    dataApiEnabled: true,
    storage: { driver: 'sqlite', schemaVersion: 2, writable: false, audit: 'transactional' },
  }),
}

const text = { type: 'string' } as const

const RESPONSE_HEADERS: Partial<Record<ProblemKind, Record<string, unknown>>> = {
  unauthorized: {
    'WWW-Authenticate': { description: 'The challenge: `Bearer realm="demify"`, with `error="invalid_token"` when a token was sent and is wrong.', schema: text },
  },
  rateLimited: {
    'Retry-After': { description: 'Whole seconds to wait before the next write request.', schema: { type: 'integer', minimum: 1 } },
  },
}

function parameterObject(def: ParameterDef) {
  return { name: def.name, in: def.in, required: def.required, description: def.description, schema: def.schema, example: def.example }
}

function responseObject(operation: OperationDef, response: DeclaredResponse) {
  if (response.kind === 'success') {
    return {
      description: response.description,
      content: { 'application/json': { schema: ref(operation.success.schema), example: SUCCESS_EXAMPLES[operation.id]() } },
    }
  }
  const headers = RESPONSE_HEADERS[response.kind]
  return {
    description: response.description,
    ...(headers ? { headers } : {}),
    content: { 'application/problem+json': { schema: ref('Problem'), example: PROBLEM_EXAMPLES[response.kind] } },
  }
}

function operationObject(operation: OperationDef) {
  return {
    operationId: operation.id,
    tags: [operation.tag],
    summary: operation.summary,
    description: operation.description,
    // An empty list says "no token needed" out loud, instead of leaving it to a default.
    security: operation.access === 'token' ? [{ [SECURITY_SCHEME]: [] }] : [],
    ...(operation.parameters.length > 0 ? { parameters: operation.parameters.map(parameterObject) } : {}),
    ...(operation.requestBody
      ? {
          requestBody: {
            required: true,
            description: operation.requestBody.description,
            content: { 'application/json': { schema: ref(operation.requestBody.schema), example: operation.requestBody.example } },
          },
        }
      : {}),
    responses: Object.fromEntries(declaredResponses(operation).map((response) => [String(response.status), responseObject(operation, response)])),
  }
}

export type OpenApiDocument = ReturnType<typeof buildOpenApiDocument>

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, ReturnType<typeof operationObject>>> = {}
  for (const operation of OPERATIONS) {
    paths[operation.path] ??= {}
    paths[operation.path][operation.method.toLowerCase()] = operationObject(operation)
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Demify API',
      summary: 'Send health readings of a crew member and read back the evaluation of the monitor.',
      description: DESCRIPTION,
      // The version of the contract. The version of the application is in GET /status.
      version: API_VERSION,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: API_BASE, description: 'This server' }],
    tags: TAGS.map((tag) => ({ ...tag })),
    paths,
    components: {
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: 'http',
          scheme: 'bearer',
          description: `The shared secret configured on the server as DEMIFY_API_TOKEN (16 to 512 printable characters). Sent as "Authorization: Bearer <token>". Requests that write also name their sender in the ${CLIENT_HEADER} header.`,
        },
      },
      schemas: SCHEMAS,
    },
  }
}
