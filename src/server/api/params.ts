import 'server-only'
import { MISSION_DAYS, PREFLIGHT_DAYS } from '@/domain/simulator'
import { READING_SOURCES } from '@/domain/types'
import { AUDIT_PAGE, CLIENT_HEADER } from './limits'
import type { FieldError } from './problem'

/*
 * The parameters of the API. One definition serves three readers: the request
 * parser below, the OpenAPI document and the documentation page.
 */

export type ParameterSchema =
  | { type: 'integer'; minimum: number; maximum: number; default?: number }
  | { type: 'string'; enum?: readonly string[]; pattern?: string; minLength?: number; maxLength?: number }

export interface ParameterDef {
  name: string
  in: 'path' | 'query' | 'header'
  required: boolean
  description: string
  schema: ParameterSchema
  example: string | number
}

/** A parameter as the handlers get it: parsed, checked, and with its default filled in. */
export type ParameterValue = string | number | undefined

const WHOLE_NUMBER = /^-?\d{1,9}$/

/** A description without its Markdown code marks, for use in an error message. */
const plain = (description: string) => description.replaceAll('`', '')

/** Checks one raw value against its definition. Returns the parsed value, or what is wrong with it. */
export function parseParameter(def: ParameterDef, raw: string): { value: string | number } | { fault: string } {
  const schema = def.schema
  if (schema.type === 'integer') {
    const value = Number(raw)
    if (!WHOLE_NUMBER.test(raw) || value < schema.minimum || value > schema.maximum) {
      return { fault: `"${def.name}" must be a whole number from ${schema.minimum} to ${schema.maximum}.` }
    }
    return { value }
  }
  if (schema.enum && !schema.enum.includes(raw)) {
    return { fault: `"${def.name}" must be one of: ${schema.enum.join(', ')}.` }
  }
  if (
    (schema.minLength !== undefined && raw.length < schema.minLength) ||
    (schema.maxLength !== undefined && raw.length > schema.maxLength) ||
    (schema.pattern !== undefined && !new RegExp(schema.pattern).test(raw))
  ) {
    return { fault: `"${def.name}" is not valid. ${plain(def.description)}` }
  }
  return { value: raw }
}

/**
 * Reads the query and header parameters an operation declares. A query
 * parameter it does not declare is a fault: a mistyped filter must not be
 * ignored and answered with more data than was asked for.
 */
export function readParameters(
  defs: readonly ParameterDef[],
  url: URL,
  headers: Headers,
): { values: Record<string, ParameterValue>; errors: FieldError[] } {
  const values: Record<string, ParameterValue> = {}
  const errors: FieldError[] = []
  const queryDefs = defs.filter((def) => def.in === 'query')

  for (const name of new Set(url.searchParams.keys())) {
    if (!queryDefs.some((def) => def.name === name)) {
      const known = queryDefs.map((def) => def.name).join(', ')
      // Repeated in the answer so the caller finds the typo, but not at any length.
      const shown = name.length > 64 ? `${name.slice(0, 64)}...` : name
      errors.push({
        in: 'query',
        field: shown,
        detail: `Unknown query parameter "${shown}". ${known ? `This endpoint takes: ${known}.` : 'This endpoint takes none.'}`,
      })
    }
  }

  for (const def of defs) {
    if (def.in === 'path') continue
    const given = def.in === 'query' ? url.searchParams.getAll(def.name) : [headers.get(def.name)?.trim()].filter((v) => v !== undefined)
    const what = def.in === 'query' ? 'query parameter' : 'header'
    if (given.length > 1) {
      errors.push({ in: def.in, field: def.name, detail: `Send the ${what} "${def.name}" once.` })
      continue
    }
    const raw = given[0]
    if (raw === undefined || raw === '') {
      if (def.required) errors.push({ in: def.in, field: def.name, detail: `The ${what} "${def.name}" is required. ${plain(def.description)}` })
      else if (def.schema.type === 'integer') values[def.name] = def.schema.default
      continue
    }
    const parsed = parseParameter(def, raw)
    if ('fault' in parsed) errors.push({ in: def.in, field: def.name, detail: parsed.fault })
    else values[def.name] = parsed.value
  }
  return { values, errors }
}

const FIRST_DAY = 1 - PREFLIGHT_DAYS

export const CREW_ID: ParameterDef = {
  name: 'crewId',
  in: 'path',
  required: true,
  description: 'Id of a crew member, as listed by GET /crew.',
  schema: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,31}$' },
  example: 'morgan',
}

/** Becomes the actor `api:<name>` of the audit trail, which holds at most 64 characters. */
export const CLIENT: ParameterDef = {
  name: CLIENT_HEADER,
  in: 'header',
  required: true,
  description:
    'Name of the device or system sending the request: 1 to 48 characters, letters, digits, dot, hyphen and underscore, starting with a letter or digit. It is recorded in the audit trail as `api:<name>`. It is a label, not a secret.',
  schema: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$' },
  example: 'hr-monitor-01',
}

export const EVALUATION_DAY: ParameterDef = {
  name: 'day',
  in: 'query',
  required: true,
  description: 'The mission day to evaluate. Readings after this day are not looked at.',
  schema: { type: 'integer', minimum: 1, maximum: MISSION_DAYS },
  example: 51,
}

export const FROM_DAY: ParameterDef = {
  name: 'from',
  in: 'query',
  required: false,
  description: 'First mission day to return. Days of 0 and below are the pre-flight baseline of the simulated log.',
  schema: { type: 'integer', minimum: FIRST_DAY, maximum: MISSION_DAYS },
  example: 45,
}

export const TO_DAY: ParameterDef = {
  name: 'to',
  in: 'query',
  required: false,
  description: 'Last mission day to return. Must not be before `from`.',
  schema: { type: 'integer', minimum: FIRST_DAY, maximum: MISSION_DAYS },
  example: 51,
}

export const SOURCE: ParameterDef = {
  name: 'source',
  in: 'query',
  required: false,
  description: 'Return only readings from this source.',
  schema: { type: 'string', enum: READING_SOURCES },
  example: 'device',
}

export const LIMIT: ParameterDef = {
  name: 'limit',
  in: 'query',
  required: false,
  description: 'Most entries to return.',
  schema: { type: 'integer', minimum: 1, maximum: AUDIT_PAGE.max, default: AUDIT_PAGE.default },
  example: 20,
}

export const CURSOR: ParameterDef = {
  name: 'cursor',
  in: 'query',
  required: false,
  description: 'The `nextCursor` of the page before, to get the next, older entries. Treat it as opaque.',
  schema: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' },
  example: '128',
}
