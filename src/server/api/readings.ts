import 'server-only'
import { METRICS } from '@/domain/metrics'
import { MISSION_DAYS } from '@/domain/simulator'
import type { Reading, ReadingSource } from '@/domain/types'
import { isMetricId, isMissionDay, validateReading } from '@/domain/validate'
import { byDayThenMetric } from '../repository'
import { inputStepOf } from './catalog'
import { API_BASE, MAX_BATCH_READINGS } from './limits'
import { invalidRequest, type FieldError } from './problem'

/** Faults listed in one response. A batch that is wrong throughout does not need 500 lines to say so. */
const MAX_ERRORS = 50

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Values arrive as binary fractions, so "a multiple of 0.1" needs a small tolerance. */
function keepsStep(value: number, step: number): boolean {
  const steps = value / step
  return Math.abs(steps - Math.round(steps)) < 1e-6
}

/**
 * Checks a batch a device or ground system sent and returns the readings to
 * store. The rules are those of the entry forms: the indicator exists, the
 * value keeps its input limits and step, the day is a mission day, and
 * systolic is above diastolic when both arrive for one day. One fault refuses
 * the whole batch, and every fault found is reported, not only the first.
 */
export function parseBatch(body: unknown): Reading[] {
  const errors: FieldError[] = []
  const fault = (field: string, detail: string) => errors.push({ in: 'body', field, detail })

  if (!isPlainObject(body)) {
    throw invalidRequest([{ in: 'body', field: '', detail: 'Send a JSON object with a "readings" list.' }])
  }
  for (const key of Object.keys(body)) {
    if (key !== 'readings') fault(key, `Unknown field "${key}". The body takes "readings" only.`)
  }
  const entries = body.readings
  if (!Array.isArray(entries)) {
    fault('readings', '"readings" must be a list of readings.')
    throw invalidRequest(errors)
  }
  if (entries.length === 0 || entries.length > MAX_BATCH_READINGS) {
    fault('readings', `Send 1 to ${MAX_BATCH_READINGS} readings in one batch. This batch has ${entries.length}.`)
    throw invalidRequest(errors)
  }

  const unique = new Map<string, { reading: Reading; index: number }>()
  entries.forEach((entry: unknown, index) => {
    const at = `readings[${index}]`
    if (!isPlainObject(entry)) {
      fault(at, 'A reading is an object with "day", "metric" and "value".')
      return
    }
    const before = errors.length
    for (const key of Object.keys(entry)) {
      if (key !== 'day' && key !== 'metric' && key !== 'value') {
        fault(
          `${at}.${key}`,
          key === 'source'
            ? 'The source cannot be set: readings sent through the API are stored with the source "device".'
            : `Unknown field "${key}". A reading takes "day", "metric" and "value".`,
        )
      }
    }
    const { day, metric, value } = entry
    if (!isMissionDay(day)) fault(`${at}.day`, `"day" must be a mission day: a whole number from 1 to ${MISSION_DAYS}.`)
    if (!isMetricId(metric)) {
      fault(`${at}.metric`, `Unknown indicator. The ids are listed by GET ${API_BASE}/metrics-catalog.`)
    } else {
      const def = METRICS[metric]
      const problem = validateReading(metric, value)
      if (problem) fault(`${at}.value`, problem)
      else if (!keepsStep(value as number, inputStepOf(def))) {
        fault(`${at}.value`, `${def.label}: enter a value in steps of ${inputStepOf(def)} ${def.unit}.`)
      }
    }
    if (errors.length > before) return
    const reading: Reading = {
      day: day as number,
      metric: metric as Reading['metric'],
      // Brought to the indicator's own precision, as the entry forms do: 36.900000001 is stored as 36.9.
      value: Number((value as number).toFixed(METRICS[metric as Reading['metric']].decimals)),
      source: 'device',
    }
    // The same day and indicator twice in one batch: the later entry is the one that counts.
    unique.set(`${reading.day}:${reading.metric}`, { reading, index })
  })

  for (const { reading, index } of unique.values()) {
    if (reading.metric !== 'systolic') continue
    const diastolic = unique.get(`${reading.day}:diastolic`)?.reading
    if (diastolic && reading.value <= diastolic.value) {
      fault(`readings[${index}].value`, `Systolic pressure must be higher than diastolic pressure (mission day ${reading.day}).`)
    }
  }

  if (errors.length > 0) {
    const listed = errors.slice(0, MAX_ERRORS)
    throw invalidRequest(
      listed,
      errors.length === 1
        ? errors[0].detail
        : `The batch has ${errors.length} faults${errors.length > MAX_ERRORS ? `; the first ${MAX_ERRORS} are listed` : ''}. Nothing was saved.`,
    )
  }
  return [...unique.values()].map(({ reading }) => reading)
}

export interface ReadingFilter {
  from?: number
  to?: number
  source?: ReadingSource
}

/**
 * The readings that pass the filter: by mission day, then indicator, then
 * source in rising precedence. Every reading keeps its source, so a simulated
 * value is never taken for a measured one.
 */
export function filterReadings(readings: readonly Reading[], { from, to, source }: ReadingFilter): Reading[] {
  if (from !== undefined && to !== undefined && from > to) {
    throw invalidRequest([{ in: 'query', field: 'from', detail: '"from" must not be after "to".' }])
  }
  return readings
    .filter((r) => (from === undefined || r.day >= from) && (to === undefined || r.day <= to) && (source === undefined || r.source === source))
    .map((r) => ({ day: r.day, metric: r.metric, value: r.value, source: r.source }))
    .sort(byDayThenMetric)
}
