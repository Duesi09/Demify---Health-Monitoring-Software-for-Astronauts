import { changeUnit, formatAverage, formatDelta } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { AnimatedNumber } from './AnimatedNumber'
import { RangeBar } from './RangeBar'
import { Sparkline } from './Sparkline'
import { needsAttention, StatusBadge, TONE } from './status'
import { tileTone, type Tile } from './tiles'

const SPARK_DAYS = 30

interface Props {
  tile: Tile
  evaluation: Evaluation
  index: Record<MetricId, Map<number, number>>
  selected: boolean
  /** Position in the grid, for the staggered entrance. */
  order: number
  onSelect: () => void
}

function describe(daysSince: number | null): string {
  if (daysSince === null) return 'Not measured yet'
  if (daysSince === 0) return 'Measured today'
  return `Last measured ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago`
}

export function MetricTile({ tile, evaluation, index, selected, order, onSelect }: Props) {
  const primary = evaluation.assessments[tile.metrics[0]]
  const def = METRICS[primary.metric]
  const tone = tileTone(tile, evaluation)
  const stale = tone === 'stale'

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
  // The bar marks the value the status is judged on.
  const judged = stale ? null : def.evaluateOn === 'avg7' ? (primary.recentMean ?? primary.value) : primary.value

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card rise relative flex flex-col gap-3 overflow-hidden p-5 text-left transition-[translate,box-shadow] duration-300 ease-(--ease-soft) hover:-translate-y-1 ${
        selected ? 'ring-2 ring-series-1' : ''
      }`}
      style={{ '--i': 6 + order } as React.CSSProperties}
    >
      {/* A wash of the status colour marks tiles that need attention. */}
      <span
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-3xl transition-[opacity,background-color] duration-700"
        style={{ background: TONE[tone].color, opacity: needsAttention(tone) ? 0.22 : 0 }}
        aria-hidden="true"
      />
      <span className="relative flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{tile.label}</span>
        <StatusBadge tone={tone} />
      </span>
      <span className="relative flex items-end justify-between gap-3">
        <span className={`shrink-0 ${stale ? 'text-muted' : 'text-ink'}`}>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {tile.metrics.map((m, i) => (
              <span key={m}>
                {i > 0 && '/'}
                <AnimatedNumber value={evaluation.assessments[m].value} decimals={METRICS[m].decimals} />
              </span>
            ))}
          </span>
          <span className="ml-1.5 text-sm text-ink-2">{def.unit}</span>
        </span>
        <Sparkline points={points} baseline={primary.baseline} />
      </span>
      <span className="relative block">
        <RangeBar metric={primary.metric} value={judged} />
      </span>
      <span className="relative text-xs text-muted">{note}</span>
    </button>
  )
}
