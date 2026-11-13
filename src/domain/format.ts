import { METRICS } from './metrics'
import type { MetricId } from './types'

export function formatValue(metric: MetricId, value: number): string {
  return value.toFixed(METRICS[metric].decimals)
}

/**
 * Formats an average. Small scales such as mood (1–5) get one decimal, since
 * a whole-number average would hide the change that matters.
 */
export function formatAverage(metric: MetricId, value: number): string {
  const def = METRICS[metric]
  const smallScale = def.inputMax - def.inputMin <= 20
  return value.toFixed(smallScale ? Math.max(1, def.decimals) : def.decimals)
}

/** Unit to print after a change: a change in % or on a 1–5 scale is in points. */
export function changeUnit(metric: MetricId): string {
  const unit = METRICS[metric].unit
  return unit === '%' || unit === '/ 5' ? 'points' : unit
}

/** Signed change with a true minus sign; changes get at least one decimal. */
export function formatDelta(metric: MetricId, delta: number): string {
  const decimals = Math.max(1, METRICS[metric].decimals)
  const rounded = Number(delta.toFixed(decimals))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`
}

export function formatDay(day: number): string {
  return day >= 1 ? `Mission day ${day}` : `${1 - day} d before launch`
}
