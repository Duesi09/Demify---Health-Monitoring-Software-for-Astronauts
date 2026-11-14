'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDay } from '@/domain/format'
import { METRICS, classify } from '@/domain/metrics'
import {
  CAREER_LIMIT_MSV,
  MIN_PLOTTED_DOSE,
  formatDose,
  formatShare,
  limitShare,
  totalDose,
  type DoseDay,
  type DoseEvent,
  type Projection,
} from '@/domain/radiation'
import { MISSION_DAYS } from '@/domain/simulator'
import { StatusIcon } from '../status'
import { useReducedMotion } from './parts'

interface Props {
  /** One entry per mission day up to the selected day. Not empty. */
  log: DoseDay[]
  events: DoseEvent[]
  projection: Projection | null
}

const SERIES = 'var(--color-series-1)'
const DAY_TICKS = [1, 30, 60, 90, 120, 150, 180]
/** Both charts give their value axis the same room, so their day axes line up. */
const AXIS_WIDTH = 40
const MARGIN = { top: 12, right: 16, bottom: 0, left: 0 }
/** How long the lines take to draw themselves when the charts first appear. */
const DRAW_IN_MS = 900
/** The daily dose from which the indicator asks for the storm shelter. */
const SHELTER_FROM = METRICS.radiationDose.bands.find((b) => b.status === 'watch')!.below

const axisTick = { fill: 'var(--color-muted)', fontSize: 12 }
const labelText = { fill: 'var(--color-ink-2)', fontSize: 12 }

type TotalRow = { day: number; total?: number; projected?: number }
type DayRow = DoseDay & { plotted: number }

const tooltipBox = 'rounded-xl bg-raised px-3 py-2 text-sm shadow-xl ring-1 ring-edge'

function TotalTooltip({ active, payload }: { active?: boolean; payload?: { payload: TotalRow }[] }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  const measured = row.total !== undefined
  const value = row.total ?? row.projected
  if (value === undefined) return null
  return (
    <div className={tooltipBox}>
      <p className="text-xs text-ink-2">{formatDay(row.day)}</p>
      <p className="text-ink">
        <span className="text-ink-2">{measured ? 'Total so far ' : 'Projection '}</span>
        <span className="font-semibold">{measured ? formatDose(value) : Math.round(value)} mSv</span>
      </p>
      <p className="text-xs text-ink-2">{formatShare(limitShare(value))} of the career limit</p>
    </div>
  )
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayRow }[] }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return (
    <div className={tooltipBox}>
      <p className="text-xs text-ink-2">{formatDay(row.day)}</p>
      <p className="text-ink">
        <span className="font-semibold">{formatDose(row.dose)} mSv</span>
        <span className="text-ink-2"> that day</span>
      </p>
      <p className="text-xs text-ink-2">
        {row.estimated ? 'No reading: typical day counted' : classify('radiationDose', row.dose).label}
      </p>
    </div>
  )
}

/** A line key for the legend: what a mark in the chart looks like. */
function Key({ kind, children }: { kind: 'line' | 'dashed' | 'event'; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {kind === 'event' ? (
        <span className="h-3 w-3 rounded-[3px] bg-serious/30" aria-hidden="true" />
      ) : (
        <svg width="18" height="4" aria-hidden="true">
          <line
            x1="0"
            y1="2"
            x2="18"
            y2="2"
            stroke={kind === 'line' ? SERIES : 'var(--color-ink-2)'}
            strokeWidth="2"
            strokeDasharray={kind === 'dashed' ? '4 3' : undefined}
          />
        </svg>
      )}
      {children}
    </li>
  )
}

/**
 * The dose over the mission as two charts on one day axis. The running total
 * and the dose of a single day differ a hundredfold, so each gets its own
 * value axis instead of sharing one plot.
 */
export function DoseChart({ log, events, projection }: Props) {
  const reduced = useReducedMotion()
  // The lines draw themselves once; later changes of the day apply at once.
  const [drawIn, setDrawIn] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setDrawIn(false), DRAW_IN_MS + 100)
    return () => clearTimeout(timer)
  }, [])
  const animate = drawIn && !reduced

  const today = log[log.length - 1]
  const total = totalDose(log)
  const showProjection = projection !== null && projection.daysLeft > 0

  const totals: TotalRow[] = []
  for (let day = 1; day <= MISSION_DAYS; day++) {
    const row: TotalRow = { day }
    if (day <= today.day) row.total = log[day - 1].cumulative
    if (showProjection && day >= today.day) row.projected = total + projection.ratePerDay * (day - today.day)
    totals.push(row)
  }
  const days: DayRow[] = log.map((d) => ({ ...d, plotted: Math.max(d.dose, MIN_PLOTTED_DOSE) }))

  // The limit always stays in view, with a little air above it.
  const highest = Math.max(CAREER_LIMIT_MSV, total, showProjection ? projection.total : 0)
  const totalTop = Math.ceil((highest * 1.08) / 50) * 50
  const totalTicks: number[] = []
  for (let t = 0; t <= totalTop; t += 150) totalTicks.push(t)
  // Each step of the daily axis is ten times the one below.
  const dayTop = log.some((d) => d.dose > 100) ? 1000 : 100
  const dayTicks = dayTop === 1000 ? [1, 10, 100, 1000] : [1, 10, 100]

  // Labels grow away from the edge they are closest to, so none is cut off.
  const anchor = today.day > 150 ? 'end' : today.day < 24 ? 'start' : 'middle'
  const peak = events.length > 0 ? events.reduce((a, b) => (b.peak > a.peak ? b : a)) : null

  const dayAxis = (
    <XAxis
      dataKey="day"
      type="number"
      domain={[1, MISSION_DAYS]}
      ticks={DAY_TICKS}
      allowDecimals={false}
      tickFormatter={(d: number) => `D${d}`}
      tick={axisTick}
      stroke="var(--color-axis)"
      tickLine={false}
    />
  )
  const eventBands = events.map((e) => (
    <ReferenceArea
      key={e.firstDay}
      x1={Math.max(1, e.firstDay - 0.5)}
      x2={Math.min(MISSION_DAYS, e.lastDay + 0.5)}
      fill="var(--color-serious)"
      fillOpacity={0.22}
      stroke="none"
      ifOverflow="hidden"
    />
  ))

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold text-ink">Running total, mSv</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <Key kind="line">Measured total</Key>
          {showProjection && <Key kind="dashed">Projection</Key>}
          {events.length > 0 && <Key kind="event">Solar particle event</Key>}
        </ul>
      </div>
      <div className="mt-2 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={totals}
            margin={MARGIN}
            syncId="mission-dose"
            syncMethod="value"
            aria-label="Chart of the running total. The left and right arrow keys step through the days."
          >
            <defs>
              <linearGradient id="dose-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={SERIES} stopOpacity={0.28} />
                <stop offset="1" stopColor={SERIES} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-grid)" vertical={false} />
            {eventBands}
            {dayAxis}
            <YAxis
              domain={[0, totalTop]}
              ticks={totalTicks}
              width={AXIS_WIDTH}
              tick={axisTick}
              stroke="var(--color-axis)"
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine
              y={CAREER_LIMIT_MSV}
              stroke="var(--color-ink-2)"
              strokeWidth={1.5}
              label={{ value: `Career limit ${CAREER_LIMIT_MSV} mSv`, position: 'insideBottomLeft', ...labelText }}
            />
            <Tooltip content={<TotalTooltip />} cursor={{ stroke: 'var(--color-axis)' }} isAnimationActive={false} />
            <Area
              dataKey="total"
              stroke="none"
              fill="url(#dose-wash)"
              isAnimationActive={animate}
              animationDuration={DRAW_IN_MS}
              activeDot={false}
              tooltipType="none"
            />
            {showProjection && (
              <Line
                dataKey="projected"
                stroke="var(--color-ink-2)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-ink-2)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="total"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 5, fill: SERIES, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              isAnimationActive={animate}
              animationDuration={DRAW_IN_MS}
              animationEasing="ease-out"
            />
            {showProjection && projection.daysLeft >= 30 && (
              <ReferenceDot
                x={MISSION_DAYS}
                y={projection.total}
                shape={({ cx = 0, cy = 0 }) => (
                  <text x={cx} y={cy - 9} textAnchor="end" {...labelText}>
                    Projection {Math.round(projection.total)}
                  </text>
                )}
              />
            )}
            <ReferenceDot
              x={today.day}
              y={total}
              shape={({ cx = 0, cy = 0 }) => (
                <g>
                  <circle cx={cx} cy={cy} r={4.5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
                  <text x={cx} y={cy - 11} textAnchor={anchor} fill="var(--color-ink)" fontSize={13} fontWeight={600}>
                    {formatDose(total)}
                  </text>
                </g>
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <h3 className="mt-5 font-semibold text-ink">Dose per day, mSv</h3>
      <div className="mt-2 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={days}
            margin={MARGIN}
            syncId="mission-dose"
            syncMethod="value"
            aria-label="Chart of the dose per day. The left and right arrow keys step through the days."
          >
            <CartesianGrid stroke="var(--color-grid)" vertical={false} />
            {eventBands}
            {dayAxis}
            <YAxis
              scale="log"
              domain={[MIN_PLOTTED_DOSE, dayTop]}
              ticks={dayTicks}
              allowDataOverflow
              width={AXIS_WIDTH}
              tick={axisTick}
              stroke="var(--color-axis)"
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine
              y={SHELTER_FROM}
              stroke="var(--color-axis)"
              label={{ value: `Take shelter from ${SHELTER_FROM}`, position: 'insideBottomLeft', ...labelText }}
            />
            <Tooltip content={<DayTooltip />} cursor={{ stroke: 'var(--color-axis)' }} isAnimationActive={false} />
            <Line
              dataKey="plotted"
              stroke={SERIES}
              strokeWidth={1.5}
              strokeLinejoin="round"
              // Event days carry the status shape, so they stand out without relying on colour.
              dot={({ cx = 0, cy = 0, payload }: { cx?: number; cy?: number; payload?: DayRow }) =>
                payload?.event ? (
                  <StatusIcon
                    key={payload.day}
                    tone={classify('radiationDose', payload.dose).status}
                    size={14}
                    x={cx - 7}
                    y={cy - 7}
                  />
                ) : (
                  <g key={payload?.day} />
                )
              }
              activeDot={{ r: 4, fill: SERIES, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              isAnimationActive={animate}
              animationDuration={DRAW_IN_MS}
              animationEasing="ease-out"
            />
            {/* Marks the selected day, and keeps a mission of a single day visible. */}
            {!today.event && (
              <ReferenceDot
                x={today.day}
                y={Math.max(today.dose, MIN_PLOTTED_DOSE)}
                r={3.5}
                fill={SERIES}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            )}
            {peak && (
              <ReferenceDot
                x={peak.peakDay}
                y={Math.max(peak.peak, MIN_PLOTTED_DOSE)}
                shape={({ cx = 0, cy = 0 }) => (
                  <text x={cx - 12} y={cy + 4} textAnchor="end" fill="var(--color-ink)" fontSize={13} fontWeight={600}>
                    {formatDose(peak.peak)}
                  </text>
                )}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">
        The scale of the lower chart is logarithmic: each step up is ten times more. That keeps a normal day and an
        event day readable in one chart.
      </p>
    </div>
  )
}
