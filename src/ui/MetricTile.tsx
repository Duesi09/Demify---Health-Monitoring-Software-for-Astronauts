import { changeUnit, formatAverage, formatDelta, formatValue } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { Sparkline } from './Sparkline'
import { StatusBadge, TONE } from './status'
import { tileTone, type Tile } from './tiles'

const SPARK_DAYS = 30

interface Props {
  tile: Tile
  evaluation: Evaluation
  index: Record<MetricId, Map<number, number>>
  selected: boolean
  onSelect: () => void
}

function describe(daysSince: number | null): string {
  if (daysSince === null) return 'Not measured yet'
  if (daysSince === 0) return 'Measured today'
  return `Last measured ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago`
}

export function MetricTile({ tile, evaluation, index, selected, onSelect }: Props) {
  const primary = evaluation.assessments[tile.metrics[0]]
  const def = METRICS[primary.metric]
  const tone = tileTone(tile, evaluation)
  const stale = tone === 'stale'

  const value = tile.metrics
    .map((m) => {
      const v = evaluation.assessments[m].value
      return v === null ? '–' : formatValue(m, v)
    })
    .join('/')

  let note: string
  if (stale) note = describe(primary.daysSinceReading)
  else if (primary.delta !== null)
    note = `${formatDelta(primary.metric, primary.delta)} ${changeUnit(primary.metric)} vs pre-flight`
  else if (def.evaluateOn === 'avg7' && primary.recentMean !== null)
    note = `7-day average ${formatAverage(primary.metric, primary.recentMean)} ${def.unit}`
  else note = primary.band?.label ?? ''

  const series = index[primary.metric]
  const points = []
  for (let day = evaluation.day - SPARK_DAYS + 1; day <= evaluation.day; day++) {
    const v = series.get(day)
    if (v !== undefined) points.push({ day, value: v })
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-lg border bg-surface p-4 pt-5 text-left transition-colors hover:bg-raised ${
        selected ? 'border-series-1' : 'border-edge'
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${TONE[tone].bg}`} aria-hidden="true" />
      <span className="text-sm text-ink-2">{tile.label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={`shrink-0 ${stale ? 'text-muted' : 'text-ink'}`}>
          <span className="text-3xl font-semibold">{value}</span>
          <span className="ml-1 text-sm text-ink-2">{def.unit}</span>
        </span>
        <Sparkline points={points} baseline={primary.baseline} />
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <StatusBadge tone={tone} />
        <span className="text-xs text-muted">{note}</span>
      </span>
    </button>
  )
}
