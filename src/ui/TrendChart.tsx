'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDay, formatValue } from '@/domain/format'
import { METRICS, nominalRange } from '@/domain/metrics'
import type { MetricId } from '@/domain/types'
import { usePlaying } from './motion'

const SERIES_COLORS = ['var(--color-series-1)', 'var(--color-series-2)']

interface Props {
  metrics: MetricId[]
  index: Record<MetricId, Map<number, number>>
  fromDay: number
  toDay: number
  /** Personal baseline of the first metric; drawn for single-series charts. */
  baseline: number | null
}

/** Axis from round numbers: about four steps of 1, 2, 2.5 or 5 × 10ⁿ covering the data. */
function niceScale(lo: number, hi: number, ceiling: number): { ticks: number[]; min: number; max: number } {
  const span = hi - lo || Math.abs(hi) || 1
  const rough = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rough)!
  // Leave a little air above and below so the line never touches the frame.
  const min = Math.max(0, Math.floor((lo - step * 0.25) / step) * step)
  const max = Math.min(ceiling, Math.ceil((hi + step * 0.25) / step) * step)
  const ticks: number[] = []
  for (let t = min; t <= max + step / 1e6; t += step) ticks.push(Number(t.toFixed(6)))
  return { ticks, min, max }
}

type Row = { day: number } & Partial<Record<MetricId, number>>

function ChartTooltip({
  active,
  payload,
  metrics,
}: {
  active?: boolean
  payload?: { payload: Row }[]
  metrics: MetricId[]
}) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return (
    <div className="rounded-xl bg-raised px-3 py-2 text-sm shadow-xl ring-1 ring-edge">
      <p className="text-xs text-muted">{formatDay(row.day)}</p>
      {metrics.map((m, i) =>
        row[m] === undefined ? null : (
          <p key={m} className="flex items-center gap-2 text-ink">
            <span className="h-0.5 w-3" style={{ background: SERIES_COLORS[i] }} aria-hidden="true" />
            {metrics.length > 1 && <span className="text-ink-2">{METRICS[m].label}</span>}
            <span className="font-semibold">
              {formatValue(m, row[m])} {METRICS[m].unit}
            </span>
          </p>
        ),
      )}
    </div>
  )
}

/** How long the line takes to draw itself when the chart first appears. */
const DRAW_IN_MS = 900

export function TrendChart({ metrics, index, fromDay, toDay, baseline }: Props) {
  const playing = usePlaying()
  // The line draws itself once; later data changes (scrubbing, time-lapse) apply instantly.
  const [drawIn, setDrawIn] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setDrawIn(false), DRAW_IN_MS + 100)
    return () => clearTimeout(timer)
  }, [])

  const rows: Row[] = []
  const values: number[] = []
  for (let day = fromDay; day <= toDay; day++) {
    const row: Row = { day }
    let any = false
    for (const m of metrics) {
      const v = index[m].get(day)
      if (v !== undefined) {
        row[m] = v
        values.push(v)
        any = true
      }
    }
    if (any) rows.push(row)
  }
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No readings in this period.</p>
  }

  const single = metrics.length === 1
  if (single && baseline !== null) values.push(baseline)
  // During the time-lapse the value axis covers the whole mission, so the
  // chart scrolls sideways without its scale jumping from day to day.
  if (playing) for (const m of metrics) values.push(...index[m].values())

  // Percentages and the 1 to 5 scale have a ceiling the axis must not exceed.
  const def = METRICS[metrics[0]]
  const ceiling = def.unit === '%' || def.unit === '/ 5' ? def.inputMax : Infinity
  const { ticks, min: yMin, max: yMax } = niceScale(Math.min(...values), Math.max(...values), ceiling)

  const normal = single ? nominalRange(metrics[0]) : null
  const bandLow = normal ? Math.max(yMin, normal.min) : 0
  const bandHigh = normal ? Math.min(yMax, normal.max) : 0
  // Readings taken every few days need dots to be visible as measurements.
  const sparse = rows.length < (toDay - fromDay + 1) * 0.6

  return (
    <div>
      {!single && (
        <ul className="mb-1 flex flex-wrap justify-end gap-x-4 text-xs text-ink-2">
          {metrics.map((m, i) => (
            <li key={m} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ background: SERIES_COLORS[i] }} aria-hidden="true" />
              {METRICS[m].label}
            </li>
          ))}
        </ul>
      )}
      <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-series-1)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--color-series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          {normal && bandLow < bandHigh && (
            <ReferenceArea y1={bandLow} y2={bandHigh} fill="var(--color-good)" fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
          )}
          <XAxis
            dataKey="day"
            type="number"
            domain={[fromDay, toDay]}
            allowDecimals={false}
            tickFormatter={(d: number) => (d >= 1 ? `D${d}` : `L−${1 - d}`)}
            tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            stroke="var(--color-axis)"
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={ticks}
            width={40}
            tickFormatter={(v: number) => String(Number(v.toFixed(2)))}
            tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            stroke="var(--color-axis)"
            tickLine={false}
            axisLine={false}
          />
          {fromDay < 1 && (
            <ReferenceLine
              x={1}
              stroke="var(--color-axis)"
              label={{ value: 'Launch', position: 'insideTopLeft', fill: 'var(--color-muted)', fontSize: 12 }}
            />
          )}
          {single && baseline !== null && (
            <ReferenceLine y={baseline} stroke="var(--color-muted)" />
          )}
          <Tooltip
            content={<ChartTooltip metrics={metrics} />}
            cursor={{ stroke: 'var(--color-axis)' }}
            isAnimationActive={false}
          />
          {single && (
            <Area
              dataKey={metrics[0]}
              stroke="none"
              fill="url(#trend-wash)"
              connectNulls
              isAnimationActive={drawIn}
              animationDuration={DRAW_IN_MS}
              activeDot={false}
              tooltipType="none"
            />
          )}
          {metrics.map((m, i) => (
            <Line
              key={m}
              dataKey={m}
              name={METRICS[m].label}
              stroke={SERIES_COLORS[i]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={sparse ? { r: 3, fill: SERIES_COLORS[i], strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: SERIES_COLORS[i], stroke: 'var(--color-surface)', strokeWidth: 2 }}
              connectNulls
              isAnimationActive={drawIn}
              animationDuration={DRAW_IN_MS}
              animationEasing="ease-out"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
