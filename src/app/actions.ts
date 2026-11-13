'use server'

import { METRICS } from '@/domain/metrics'
import { isMetricId, isMissionDay, validateReading } from '@/domain/validate'
import type { Reading } from '@/domain/types'
import { clearManualReadings, saveManualReadings } from '@/server/readingStore'

export type LogResult = { ok: true; readings: Reading[] } | { ok: false; error: string }

/**
 * Saves readings a crew member entered by hand. Server actions are reachable
 * by anyone who can reach the server, so every argument is checked here even
 * though the form checks it too.
 */
export async function logReadings(day: unknown, entries: unknown): Promise<LogResult> {
  if (!isMissionDay(day)) return { ok: false, error: 'That mission day does not exist.' }
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 10) {
    return { ok: false, error: 'Nothing to save.' }
  }

  const readings: Reading[] = []
  for (const entry of entries as { metric?: unknown; value?: unknown }[]) {
    if (!isMetricId(entry?.metric)) return { ok: false, error: 'Unknown health indicator.' }
    const error = validateReading(entry.metric, entry.value)
    if (error) return { ok: false, error }
    const decimals = METRICS[entry.metric].decimals
    readings.push({
      day,
      metric: entry.metric,
      value: Number((entry.value as number).toFixed(decimals)),
      source: 'manual',
    })
  }

  const systolic = readings.find((r) => r.metric === 'systolic')
  const diastolic = readings.find((r) => r.metric === 'diastolic')
  if (systolic && diastolic && systolic.value <= diastolic.value) {
    return { ok: false, error: 'Systolic pressure must be higher than diastolic pressure.' }
  }

  await saveManualReadings(readings)
  return { ok: true, readings }
}

export async function resetManualReadings(): Promise<void> {
  await clearManualReadings()
}
