import { formatValue } from '@/domain/format'
import { METRICS, classify } from '@/domain/metrics'
import type { MetricId } from '@/domain/types'
import { TONE } from './status'

interface Props {
  metric: MetricId
  /** The judged value: the latest reading, or the 7-day average. */
  value: number | null
  /** Adds the threshold values under the bar. */
  detailed?: boolean
}

/** Labels closer together than this share of the bar would collide. */
const MIN_LABEL_GAP = 0.085

/**
 * Shows where a value sits among its ranges: one segment per range in its
 * status colour, and a marker at the value.
 */
export function RangeBar({ metric, value, detailed = false }: Props) {
  const def = METRICS[metric]
  const [lo, hi] = def.scale
  const share = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)))

  const segments: { from: number; to: number; tone: keyof typeof TONE }[] = []
  let from = lo
  for (const band of def.bands) {
    const to = Math.min(hi, band.below)
    if (to > from) {
      segments.push({ from, to, tone: band.status })
      from = to
    }
  }

  const thresholds: number[] = []
  for (const s of segments.slice(0, -1)) {
    const last = thresholds[thresholds.length - 1]
    if (last === undefined || share(s.to) - share(last) >= MIN_LABEL_GAP) thresholds.push(s.to)
  }

  const label =
    value === null
      ? `${def.label}: no reading`
      : `${def.label}: ${formatValue(metric, value)} ${def.unit}, ${classify(metric, value).label}`

  return (
    <div role="img" aria-label={label}>
      <div className="relative h-1.5">
        <div className="flex h-full gap-0.5">
          {segments.map((s) => (
            <span
              key={s.from}
              className="rounded-full opacity-55"
              style={{ flex: `${s.to - s.from} 0 0`, background: TONE[s.tone].color }}
            />
          ))}
        </div>
        {value !== null && (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-[3px] ring-surface transition-[left] duration-500 ease-(--ease-soft)"
            style={{ left: `${share(value) * 100}%` }}
          />
        )}
      </div>
      {detailed && (
        <div className="relative mt-2 h-4 text-[11px] text-muted tabular-nums" aria-hidden="true">
          {thresholds.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${share(t) * 100}%` }}>
              {Number(t.toFixed(1))}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
