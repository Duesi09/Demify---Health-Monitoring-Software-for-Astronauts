import 'server-only'
import { HAZARD_IDS } from '@/domain/hazards'
import { METRIC_IDS } from '@/domain/metrics'
import { MISSION_DAYS } from '@/domain/simulator'
import { READING_SOURCES, STATUS_ORDER } from '@/domain/types'
import { STORE_DRIVERS } from '../config'
import { AUDIT_ACTIONS } from '../repository'
import { MAX_BATCH_READINGS } from './limits'

/*
 * The shapes of everything the API sends and takes, as JSON Schema (the
 * dialect OpenAPI 3.1 uses). Lists of allowed values come from the domain
 * code, so a new indicator or status shows up here without an edit.
 */

export type Schema = { readonly [keyword: string]: unknown }

/** A reference to one of the schemas below. A test checks that every reference leads somewhere. */
export function ref(name: string): Schema {
  return { $ref: `#/components/schemas/${name}` }
}

const metricId: Schema = { type: 'string', enum: METRIC_IDS, description: 'An indicator id from the metrics catalogue.' }
const status: Schema = { type: 'string', enum: STATUS_ORDER, description: 'Triage level, in rising order of urgency.' }
const source: Schema = {
  type: 'string',
  enum: READING_SOURCES,
  description:
    'Where the reading came from. `simulated`: the built-in simulated mission log, not a measurement. `device`: sent through this API. `manual`: entered by the crew member. For one day and indicator, `manual` is used before `device`, and `device` before `simulated`.',
}
const nullable = (schema: Schema): Schema => ({ ...schema, type: [schema.type, 'null'] })
const number: Schema = { type: 'number' }
const integer: Schema = { type: 'integer' }
const text: Schema = { type: 'string' }

function object(properties: Record<string, Schema>, extra: Schema = {}): Schema {
  // Every property is always sent, and nothing else is: clients can rely on the shape.
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false, ...extra }
}

const list = (items: Schema, extra: Schema = {}): Schema => ({ type: 'array', items, ...extra })

export const SCHEMAS = {
  Status: object({
    ready: { type: 'boolean', description: 'True when storage can be reached and can take a write.' },
    version: { ...text, description: 'Version of the Demify application.' },
    apiVersion: { ...text, description: 'Version of this API contract.' },
    dataApiEnabled: { type: 'boolean', description: 'True when an API token is configured, so the crew endpoints answer.' },
    storage: object({
      driver: { type: 'string', enum: STORE_DRIVERS },
      schemaVersion: { ...integer, description: 'Version of the database schema (sqlite) or of the file format (json).' },
      writable: { type: 'boolean' },
      audit: {
        type: 'string',
        enum: ['transactional', 'best-effort'],
        description: 'How the audit trail is kept: in the same transaction as the change, or appended after it.',
      },
    }),
  }),

  Band: object(
    {
      from: { ...nullable(number), description: 'Lowest value of the band (inclusive); null when the band has no lower end.' },
      below: { ...nullable(number), description: 'The band ends below this value (exclusive); null when it has no upper end.' },
      status,
      label: text,
      action: { ...nullable(text), description: 'What the crew member is told to do; null for a nominal band.' },
    },
    { description: 'A value range and what it means. Bands are listed from lowest to highest and leave no gap.' },
  ),

  Metric: object({
    id: metricId,
    label: text,
    unit: text,
    decimals: { ...integer, description: 'Decimal places a value is stored and shown with.' },
    input: object(
      {
        min: number,
        max: number,
        step: { ...number, description: 'A value must be a whole multiple of this.' },
      },
      { description: 'The limits a reading must keep to be accepted. Values outside are treated as faults, not as findings.' },
    ),
    evaluatedOn: {
      type: 'string',
      enum: ['latest', 'avg7'],
      description: 'Whether the bands judge the latest reading or the average of the last 7 days.',
    },
    staleAfterDays: { ...integer, description: 'Days without a reading before the value counts as out of date and is no longer judged.' },
    bands: list(ref('Band')),
    drift: {
      ...nullable(
        object({
          direction: { type: 'string', enum: ['up', 'down', 'both'] },
          watch: number,
          act: number,
          action: text,
        }),
      ),
      description: 'How a change of the 7-day average from the personal pre-flight baseline is judged; null when it is not.',
    },
    hazard: object(
      { id: { type: 'string', enum: HAZARD_IDS }, label: text, url: text },
      { description: 'The NASA spaceflight hazard that drives this indicator.' },
    ),
    reference: { ...text, description: 'Where the reference ranges come from.' },
  }),

  MetricsCatalog: object({
    notice: { ...text, description: 'What the ranges are and are not.' },
    missionDays: object({ first: integer, last: integer }, { description: 'The mission days a reading can be stored for.' }),
    statuses: list(status, { description: 'The triage levels, in rising order of urgency.' }),
    sources: list(source, { description: 'The sources of a reading, in rising order of precedence.' }),
    metrics: list(ref('Metric')),
  }),

  CrewMember: object({
    id: { ...text, description: 'Stable key: lower case letters, digits and hyphens.' },
    name: text,
    role: text,
    simulatedSensorLog: {
      type: 'boolean',
      description: 'True when this crew member has the built-in simulated mission log, returned with `source: simulated`.',
    },
  }),

  CrewList: object({ crew: list(ref('CrewMember')) }),

  Reading: object({
    day: { ...integer, description: 'Mission day. 1 is the first day in flight; 0 and below are pre-flight days of the simulated baseline.' },
    metric: metricId,
    value: number,
    source,
  }),

  ReadingList: object({
    crewId: text,
    count: integer,
    readings: list(ref('Reading'), { description: 'By mission day, then indicator, then source in rising precedence.' }),
  }),

  ReadingInput: object(
    {
      day: { ...integer, minimum: 1, maximum: MISSION_DAYS, description: 'Mission day the value was measured on.' },
      metric: metricId,
      value: { ...number, description: 'In the unit of the indicator, within its input limits and step (see the metrics catalogue).' },
    },
    { description: 'One reading to store. The source is always `device`; it cannot be set.' },
  ),

  ReadingBatch: object({
    readings: list(ref('ReadingInput'), { minItems: 1, maxItems: MAX_BATCH_READINGS }),
  }),

  SaveResult: object({
    crewId: text,
    actor: { ...text, description: 'Who the audit trail names for this change: `api:` and the client name.' },
    saved: { ...integer, description: 'Readings stored. Fewer than sent when the batch named a day and indicator twice: the last one counts.' },
    readings: list(ref('Reading'), { description: 'The readings as stored.' }),
  }),

  Finding: object({
    id: { ...text, description: 'Stable id of the rule, such as `range:restingHr` or `pattern:cardiac`.' },
    kind: { type: 'string', enum: ['range', 'drift', 'pattern'] },
    status: { type: 'string', enum: STATUS_ORDER.filter((s) => s !== 'nominal') },
    title: text,
    detail: text,
    action: { ...text, description: 'What the crew member is told to do.' },
    metrics: list(metricId, { description: 'The indicators behind the finding.' }),
  }),

  Reminder: object(
    {
      metric: metricId,
      daysSinceReading: { ...nullable(integer), description: 'Null when the indicator has never been measured.' },
    },
    { description: 'An indicator whose latest reading is too old to judge. It needs a new measurement.' },
  ),

  Assessment: object({
    metric: metricId,
    status: { ...status, description: 'The more urgent of the range check and the baseline-drift check. `nominal` when stale.' },
    value: { ...nullable(number), description: 'The latest reading up to the evaluated day; null when there is none.' },
    source: { ...nullable(source), description: 'Where the latest reading came from; null when there is none.' },
    latestDay: nullable(integer),
    daysSinceReading: nullable(integer),
    stale: { type: 'boolean', description: 'True when the latest reading is too old to judge. A stale indicator is not judged.' },
    band: {
      ...nullable(object({ status, label: text, action: nullable(text) })),
      description: 'The band the judged value falls in; null when the indicator is stale.',
    },
    baseline: { ...nullable(number), description: 'Personal pre-flight average.' },
    recentMean: { ...nullable(number), description: 'Average of the last 7 days.' },
    delta: { ...nullable(number), description: '`recentMean` minus `baseline`.' },
    driftStatus: status,
    driftDays: { ...integer, description: 'Days in a row, ending on the evaluated day, the 7-day average has been off baseline.' },
    recentPeak: { ...nullable(number), description: 'Highest reading of the last 14 days.' },
  }),

  Evaluation: object({
    crewId: text,
    day: integer,
    status: { ...status, description: 'Overall triage level: the most urgent finding.' },
    findings: list(ref('Finding'), { description: 'Most urgent first.' }),
    reminders: list(ref('Reminder')),
    assessments: list(ref('Assessment'), { description: 'One per indicator, in catalogue order.' }),
  }),

  AuditEntry: object({
    id: { ...integer, description: 'Rises with every entry.' },
    at: { ...text, format: 'date-time', description: 'When it happened, UTC.' },
    actor: { ...text, description: '`crew:<id>` for a crew member, `api:<client>` for a client of this API, `system:<name>` for the server itself.' },
    crewId: text,
    action: { type: 'string', enum: AUDIT_ACTIONS },
    day: integer,
    metric: { ...text, description: 'An indicator id, kept as stored.' },
    before: { ...nullable(number), description: 'The stored value before the change; null when there was none.' },
    after: { ...nullable(number), description: 'The stored value after the change; null when the reading was removed.' },
  }),

  AuditPage: object({
    crewId: text,
    entries: list(ref('AuditEntry'), { description: 'Newest first.' }),
    nextCursor: { ...nullable(text), description: 'Pass as `cursor` to get the next, older page; null on the last page.' },
  }),

  OpenApiDocument: {
    type: 'object',
    description: 'An OpenAPI 3.1 document: https://spec.openapis.org/oas/v3.1.0',
    properties: { openapi: text, info: { type: 'object' }, paths: { type: 'object' }, components: { type: 'object' } },
    required: ['openapi', 'info', 'paths', 'components'],
  },

  FieldError: object({
    in: { type: 'string', enum: ['body', 'query', 'header', 'path'] },
    field: { ...text, description: 'A parameter or header name, or a path into the JSON body such as `readings[2].value`. Empty for the body as a whole.' },
    detail: text,
  }),

  Problem: {
    type: 'object',
    description: 'An error, as a problem document (RFC 9457). Further members may be present.',
    properties: {
      type: { ...text, description: 'A URI reference that identifies the kind of problem and leads to its documentation.' },
      title: text,
      status: integer,
      detail: { ...text, description: 'What went wrong in this request, in plain words.' },
      errors: list(ref('FieldError'), { description: 'Only on 400: every fault found in the request.' }),
    },
    required: ['type', 'title', 'status', 'detail'],
  },
} as const satisfies Record<string, Schema>

export type SchemaName = keyof typeof SCHEMAS
