const WIDTH = 116
const HEIGHT = 34
const PAD = 5
/** The most recent days are drawn in the accent colour. */
const RECENT_DAYS = 7

interface Point {
  day: number
  value: number
}

/**
 * Small trend line for a tile: the last weeks, with the personal baseline as a
 * hairline. It stretches to the space the tile has left, so the end marker is
 * an HTML dot that stays round at any width.
 */
interface Props {
  points: Point[]
  baseline: number | null
  /** A fixed value range; without it the line is scaled to its own points. */
  range?: [number, number]
}

export function Sparkline({ points, baseline, range }: Props) {
  if (points.length < 2) return null

  const values = points.map((p) => p.value)
  if (baseline !== null) values.push(baseline)
  const lo = range ? Math.min(range[0], ...values) : Math.min(...values)
  const hi = range ? Math.max(range[1], ...values) : Math.max(...values)
  const span = hi - lo || 1
  const firstDay = points[0].day
  const lastDay = points[points.length - 1].day
  const x = (day: number) => PAD + ((day - firstDay) / (lastDay - firstDay)) * (WIDTH - 2 * PAD)
  const y = (value: number) => HEIGHT - PAD - ((value - lo) / span) * (HEIGHT - 2 * PAD)
  const path = (ps: Point[]) =>
    ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`).join('')

  const recent = points.filter((p) => p.day > lastDay - RECENT_DAYS)
  const last = points[points.length - 1]
  const line = { fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' } as const

  return (
    <span className="relative ml-auto block min-w-12 flex-1" style={{ height: HEIGHT, maxWidth: WIDTH }} aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {baseline !== null && (
          <line x1={PAD} x2={WIDTH - PAD} y1={y(baseline)} y2={y(baseline)} className="stroke-axis" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <path d={path(points)} className="stroke-muted" strokeWidth="1.5" {...line} />
        {recent.length > 1 && <path d={path(recent)} className="stroke-series-1" strokeWidth="2" {...line} />}
      </svg>
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-series-1 ring-2 ring-surface"
        style={{ left: `${(x(last.day) / WIDTH) * 100}%`, top: y(last.value) }}
      />
    </span>
  )
}
