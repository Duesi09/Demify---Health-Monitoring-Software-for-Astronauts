import 'server-only'
import { MISSION_DAYS } from '@/domain/simulator'
import { AUDIT_PAGE, CLIENT_HEADER, MAX_BATCH_READINGS, MAX_BODY_BYTES, WRITE_LIMIT } from './limits'
import { CLIENT, CREW_ID, CURSOR, EVALUATION_DAY, FROM_DAY, LIMIT, SOURCE, TO_DAY, type ParameterDef } from './params'
import { PROBLEMS, type ProblemKind } from './problem'
import type { SchemaName } from './schemas'

/*
 * The operations of the API: the one list the router, the OpenAPI document,
 * the documentation page and the tests are all built from. An endpoint exists
 * when it is listed here, has a handler in handlers.ts and a route file under
 * src/app/api/v1; openapi.test.ts fails when the three disagree.
 */

export type OperationId =
  | 'getStatus'
  | 'getOpenApi'
  | 'getMetricsCatalog'
  | 'listCrew'
  | 'listReadings'
  | 'saveReadings'
  | 'getEvaluation'
  | 'listAudit'

export type HttpMethod = 'GET' | 'POST'

export const TAGS = [
  { name: 'Service', description: 'About the server itself. Open to anyone who can reach it; no crew data.' },
  { name: 'Reference', description: 'What the indicators are and how values are judged. Open; no crew data.' },
  { name: 'Crew data', description: 'Health data of crew members. Needs the API token.' },
] as const

export interface OperationDef {
  id: OperationId
  method: HttpMethod
  /** Below /api/v1, with path parameters in braces. */
  path: string
  tag: (typeof TAGS)[number]['name']
  summary: string
  description: string
  /** `open`: anyone who can reach the server. `token`: crew data, served only with the configured API token. */
  access: 'open' | 'token'
  /** Changes stored data, so the write rate limit counts it. */
  write?: true
  /** What a failure of storage is answered with; absent when the operation does not touch storage. */
  storageFailure?: 'internalError' | 'notReady'
  parameters: readonly ParameterDef[]
  requestBody?: { schema: SchemaName; description: string; example: unknown }
  success: { schema: SchemaName; description: string }
}

export const OPERATIONS: readonly OperationDef[] = [
  {
    id: 'getStatus',
    method: 'GET',
    path: '/status',
    tag: 'Service',
    summary: 'Readiness of the server',
    description:
      'Says whether the server can do its job: storage can be reached and can take a write. Answers 200 when ready and 503 when not, so it can serve as a readiness probe. Also tells the application version and whether the data API is enabled. Carries no crew data and no secrets.',
    access: 'open',
    storageFailure: 'notReady',
    parameters: [],
    success: { schema: 'Status', description: 'The server is ready.' },
  },
  {
    id: 'getOpenApi',
    method: 'GET',
    path: '/openapi.json',
    tag: 'Service',
    summary: 'This API as an OpenAPI 3.1 document',
    description: 'The machine-readable description of every endpoint, generated from the same definitions the server routes requests with.',
    access: 'open',
    parameters: [],
    success: { schema: 'OpenApiDocument', description: 'The OpenAPI document.' },
  },
  {
    id: 'getMetricsCatalog',
    method: 'GET',
    path: '/metrics-catalog',
    tag: 'Reference',
    summary: 'The indicator catalogue',
    description:
      'Every health indicator the monitor tracks: id, label, unit, the limits a reading must keep to be accepted, the bands a value is judged by with their status and label, and the NASA hazard behind it. A device vendor or a ground tool can validate and label data from this alone.',
    access: 'open',
    parameters: [],
    success: { schema: 'MetricsCatalog', description: 'The catalogue.' },
  },
  {
    id: 'listCrew',
    method: 'GET',
    path: '/crew',
    tag: 'Crew data',
    summary: 'The crew members',
    description: 'The crew members readings can be stored for. Their ids are the `crewId` of the other endpoints.',
    access: 'token',
    parameters: [],
    success: { schema: 'CrewList', description: 'The crew.' },
  },
  {
    id: 'listReadings',
    method: 'GET',
    path: '/crew/{crewId}/readings',
    tag: 'Crew data',
    summary: 'Readings of a crew member',
    description:
      'Everything the monitor holds for a crew member, and so everything an evaluation rests on: the stored readings (`device`, `manual`) and, for a crew member with a simulated sensor log, the simulated ones. Every reading names its `source`; a `simulated` reading is not a measurement. One day can hold up to one reading per source for an indicator. Narrow the answer with `from`, `to` and `source`; without them the whole mission is returned, which is a few thousand readings.',
    access: 'token',
    storageFailure: 'internalError',
    parameters: [CREW_ID, FROM_DAY, TO_DAY, SOURCE],
    success: { schema: 'ReadingList', description: 'The readings.' },
  },
  {
    id: 'saveReadings',
    method: 'POST',
    path: '/crew/{crewId}/readings',
    tag: 'Crew data',
    summary: 'Send a batch of readings',
    description: `For devices and ground systems. The readings are checked with the rules of the monitor's own entry forms: the indicator exists, the value keeps its input limits and step (see the metrics catalogue), the day is a mission day from 1 to ${MISSION_DAYS}, and systolic pressure is above diastolic when both arrive for one day. All of the batch is saved or none of it, and a refusal lists every fault.

Sending is idempotent: a reading replaces the earlier \`device\` reading for the same day and indicator, so a batch can be sent again after a lost answer. Readings are stored with the source \`device\`. They take the place of a simulated value for that day and never overwrite one the crew member entered by hand.

The \`${CLIENT_HEADER}\` header names the sender; each stored reading gets an entry in the audit trail with the actor \`api:<name>\`.

Limits: 1 to ${MAX_BATCH_READINGS} readings and at most ${MAX_BODY_BYTES / 1024} KiB per request; ${WRITE_LIMIT.requests} write requests per ${WRITE_LIMIT.windowSeconds} seconds per client name, counted per server process.`,
    access: 'token',
    write: true,
    storageFailure: 'internalError',
    parameters: [CREW_ID, CLIENT],
    requestBody: {
      schema: 'ReadingBatch',
      description: 'The readings to store.',
      example: {
        readings: [
          { day: 51, metric: 'restingHr', value: 130 },
          { day: 51, metric: 'spo2', value: 97 },
        ],
      },
    },
    success: { schema: 'SaveResult', description: 'Every reading of the batch is stored.' },
  },
  {
    id: 'getEvaluation',
    method: 'GET',
    path: '/crew/{crewId}/evaluation',
    tag: 'Crew data',
    summary: 'The result of the rule engine for a mission day',
    description:
      'What the monitor concludes on the given day from the readings up to that day: the overall triage status, the findings with what to do, the indicators that need a new measurement, and one assessment per indicator. It is the same result the crew member sees. This is the endpoint a ground console polls; the answer is computed on every request and reflects a reading the moment it is stored.',
    access: 'token',
    storageFailure: 'internalError',
    parameters: [CREW_ID, EVALUATION_DAY],
    success: { schema: 'Evaluation', description: 'The evaluation.' },
  },
  {
    id: 'listAudit',
    method: 'GET',
    path: '/crew/{crewId}/audit',
    tag: 'Crew data',
    summary: 'The audit trail of a crew member',
    description: `Every change to a stored reading of this crew member, newest first: who made it, when, and the value before and after. Entries are only ever added. Returns ${AUDIT_PAGE.default} entries unless \`limit\` says otherwise; \`nextCursor\` leads to the next, older page.`,
    access: 'token',
    storageFailure: 'internalError',
    parameters: [CREW_ID, LIMIT, CURSOR],
    success: { schema: 'AuditPage', description: 'One page of the trail.' },
  },
]

export function operationsAt(path: string): OperationDef[] {
  return OPERATIONS.filter((operation) => operation.path === path)
}

/** The methods a path answers besides the ones its operations define: HEAD comes with GET, OPTIONS with everything. */
export function allowedMethods(path: string): string[] {
  const methods = operationsAt(path).map((operation) => operation.method)
  return [...methods, ...(methods.includes('GET') ? ['HEAD'] : []), 'OPTIONS']
}

export interface DeclaredResponse {
  status: number
  /** `success`, or the kind of problem. */
  kind: 'success' | ProblemKind
  description: string
}

/**
 * Every response an operation can give, worked out from what it is. The
 * router refuses requests by the same properties, so the document cannot
 * promise a status the server does not send, or leave one out.
 */
export function declaredResponses(operation: OperationDef): DeclaredResponse[] {
  const responses: DeclaredResponse[] = [{ status: 200, kind: 'success', description: operation.success.description }]
  const add = (kind: ProblemKind, description: string) => responses.push({ status: PROBLEMS[kind].status, kind, description })

  const takesInput = operation.parameters.some((p) => p.in !== 'path') || operation.requestBody !== undefined
  add(
    'invalidRequest',
    takesInput
      ? 'A parameter, a header or the body is missing or not valid. `errors` lists every fault.'
      : 'The request carries a query parameter; this endpoint takes none.',
  )
  if (operation.access === 'token') add('unauthorized', 'The API token is missing or not valid.')
  if (operation.parameters.includes(CREW_ID)) add('notFound', 'There is no crew member with this id.')
  if (operation.requestBody) {
    add('payloadTooLarge', `The body is larger than ${MAX_BODY_BYTES / 1024} KiB.`)
    add('unsupportedMediaType', 'The body was not sent as `application/json`.')
  }
  if (operation.write) add('rateLimited', 'This client name sent too many write requests. Wait for the seconds in `Retry-After`.')
  if (operation.storageFailure === 'internalError') add('internalError', 'The server failed to answer, for example because storage could not be reached.')
  if (operation.storageFailure === 'notReady') add('notReady', 'Storage cannot be reached or cannot take a write.')
  if (operation.access === 'token') add('notConfigured', 'No API token is configured on the server, so crew data is not served.')
  return responses.sort((a, b) => a.status - b.status)
}
