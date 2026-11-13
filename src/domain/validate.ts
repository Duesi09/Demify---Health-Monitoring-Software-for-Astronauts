import { METRICS } from './metrics'
import { MISSION_DAYS } from './simulator'
import type { MetricId } from './types'

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && Object.hasOwn(METRICS, value)
}

/** Returns a message for the crew member when the value cannot be right, else null. */
export function validateReading(metric: MetricId, value: unknown): string | null {
  const def = METRICS[metric]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${def.label}: enter a number.`
  }
  if (value < def.inputMin || value > def.inputMax) {
    return `${def.label}: enter a value between ${def.inputMin} and ${def.inputMax} ${def.unit}.`
  }
  if (def.decimals === 0 && !Number.isInteger(value)) {
    return `${def.label}: enter a whole number.`
  }
  return null
}

export function isMissionDay(day: unknown): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= MISSION_DAYS
}
