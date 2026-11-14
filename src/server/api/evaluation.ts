import 'server-only'
import { evaluate } from '@/domain/engine'
import { METRIC_IDS } from '@/domain/metrics'
import { READING_SOURCES, type Reading, type ReadingSource } from '@/domain/types'

/**
 * The rule engine's result for one mission day, as the API serves it. It is
 * the engine's own result, reshaped for JSON: assessments as a list, and each
 * with the source of the reading it rests on, so a console can tell a
 * simulated value from a measured one.
 */
export function evaluationView(crewId: string, readings: Reading[], day: number) {
  const result = evaluate(readings, day)

  // Same precedence as the engine: a later source in the list replaces an earlier one.
  const sources = new Map<string, ReadingSource>()
  for (const source of READING_SOURCES) {
    for (const r of readings) if (r.source === source) sources.set(`${r.day}:${r.metric}`, source)
  }

  return {
    crewId,
    day: result.day,
    status: result.status,
    findings: result.findings.map((f) => ({
      id: f.id,
      kind: f.kind,
      status: f.status,
      title: f.title,
      detail: f.detail,
      action: f.action,
      metrics: [...f.metrics],
    })),
    reminders: result.reminders.map((r) => ({ metric: r.metric, daysSinceReading: r.daysSinceReading })),
    assessments: METRIC_IDS.map((id) => {
      const a = result.assessments[id]
      return {
        metric: a.metric,
        status: a.status,
        value: a.value,
        source: a.latestDay === null ? null : (sources.get(`${a.latestDay}:${id}`) ?? null),
        latestDay: a.latestDay,
        daysSinceReading: a.daysSinceReading,
        stale: a.stale,
        // Without the band's upper bound: it is Infinity for the last band, which JSON cannot carry. The catalogue has the bounds.
        band: a.band ? { status: a.band.status, label: a.band.label, action: a.band.action ?? null } : null,
        baseline: a.baseline,
        recentMean: a.recentMean,
        delta: a.delta,
        driftStatus: a.driftStatus,
        driftDays: a.driftDays,
        recentPeak: a.recentPeak,
      }
    }),
  }
}
