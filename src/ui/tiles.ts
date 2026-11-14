import { METRICS } from '@/domain/metrics'
import { worst, type Evaluation, type MetricId, type Status } from '@/domain/types'
import type { Tone } from './status'

/** One card on the dashboard. Blood pressure shows its two values together. */
export interface Tile {
  id: string
  label: string
  metrics: MetricId[]
}

const single = (id: MetricId): Tile => ({ id, label: METRICS[id].label, metrics: [id] })

export const TILES: Tile[] = [
  single('restingHr'),
  { id: 'bloodPressure', label: 'Blood pressure', metrics: ['systolic', 'diastolic'] },
  single('bodyTemp'),
  single('spo2'),
  single('glucose'),
  single('sleepHours'),
  single('mood'),
  single('exerciseMin'),
  single('cabinCo2'),
  single('radiationDose'),
]

export function tileFor(metric: MetricId): Tile {
  return TILES.find((t) => t.metrics.includes(metric)) ?? TILES[0]
}

export function tileTone(tile: Tile, evaluation: Evaluation): Tone {
  const fresh = tile.metrics.map((m) => evaluation.assessments[m]).filter((a) => !a.stale)
  if (fresh.length === 0) return 'stale'
  let status = fresh.reduce<Status>((s, a) => worst(s, a.status), 'nominal')
  // A dose limit can be reached while each daily reading is unremarkable.
  for (const finding of evaluation.findings) {
    if (finding.kind === 'limit' && finding.metrics.some((m) => tile.metrics.includes(m))) {
      status = worst(status, finding.status)
    }
  }
  return status
}
