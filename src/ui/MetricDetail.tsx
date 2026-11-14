'use client'

import { useState } from 'react'
import { formatDay, formatValue } from '@/domain/format'
import { HAZARDS, riskUrl } from '@/domain/hazards'
import { METRICS, RADIATION_LIMITS } from '@/domain/metrics'
import { PREFLIGHT_DAYS } from '@/domain/simulator'
import { STATUS_ORDER, type Evaluation, type MetricId, type Reading } from '@/domain/types'
import { DoseBar } from './DoseBar'
import { LogForm } from './LogForm'
import { RangeBar } from './RangeBar'
import { StatusBadge } from './status'
import { tileTone, type Tile } from './tiles'
import { TrendChart } from './TrendChart'

const PERIODS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: Infinity, label: 'Whole mission' },
]
const TABLE_ROWS = 14

interface Props {
  tile: Tile
  evaluation: Evaluation
  index: Record<MetricId, Map<number, number>>
  manualKeys: Set<string>
  onLogged: (readings: Reading[]) => void
}

export function MetricDetail({ tile, evaluation, index, manualKeys, onLogged }: Props) {
  const [periodDays, setPeriodDays] = useState(30)
  const day = evaluation.day
  const primary = evaluation.assessments[tile.metrics[0]]
  const def = METRICS[primary.metric]
  const tone = tileTone(tile, evaluation)
  // The badge names the range of whichever value is furthest out.
  const leading = tile.metrics
    .map((m) => evaluation.assessments[m])
    .reduce((a, b) => (STATUS_ORDER.indexOf(b.status) > STATUS_ORDER.indexOf(a.status) ? b : a))
  const firstDay = -PREFLIGHT_DAYS + 1
  const fromDay = Math.max(firstDay, day - periodDays + 1)

  const tableDays: number[] = []
  for (let d = day; d >= firstDay && tableDays.length < TABLE_ROWS; d--) {
    if (tile.metrics.some((m) => index[m].has(d))) tableDays.push(d)
  }

  return (
    <section aria-label={`${tile.label} details`} className="card swap-in flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{tile.label}</h2>
          <p className="text-sm text-muted">
            {def.unit === '/ 5' ? 'Self-rated, 1 to 5' : def.unit}
            {def.evaluateOn === 'avg7' ? ' | judged on the 7-day average' : ''}
          </p>
        </div>
        <StatusBadge tone={tone} label={tone === 'stale' ? undefined : leading.band?.label} />
      </header>

      <div>
        <p className="eyebrow mb-3">Where you are</p>
        <div className="flex flex-col gap-4">
          {tile.metrics.map((m) => {
            const a = evaluation.assessments[m]
            const judged = a.stale ? null : METRICS[m].evaluateOn === 'avg7' ? (a.recentMean ?? a.value) : a.value
            return (
              <div key={m}>
                {tile.metrics.length > 1 && <p className="mb-2 text-xs text-ink-2">{METRICS[m].label}</p>}
                <RangeBar metric={m} value={judged} detailed />
              </div>
            )
          })}
        </div>
      </div>

      {tile.metrics.includes('radiationDose') && (
        <div className="flex flex-col gap-5">
          <p className="eyebrow">Accumulated dose</p>
          <DoseBar
            label="Mission dose"
            dose={evaluation.radiation.missionDose}
            limit={RADIATION_LIMITS.career}
            limitName="career limit"
          />
          {evaluation.radiation.eventDose > 0 && (
            <DoseBar
              label="This solar particle event"
              dose={evaluation.radiation.eventDose}
              limit={RADIATION_LIMITS.event}
              limitName="limit for one event"
            />
          )}
        </div>
      )}

      <div>
        <div className="mb-3 flex gap-1 rounded-full bg-page/60 p-1 ring-1 ring-edge w-fit" role="group" aria-label="Period shown">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={periodDays === p.days}
              onClick={() => setPeriodDays(p.days)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                periodDays === p.days ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <TrendChart
          metrics={tile.metrics}
          index={index}
          fromDay={fromDay}
          toDay={day}
          baseline={def.drift ? primary.baseline : null}
        />
        {tile.metrics.length === 1 && (
          <p className="mt-1 text-xs text-muted">
            Shaded band: normal range.{def.drift && primary.baseline !== null ? ' Grey line: your pre-flight baseline.' : ''}
          </p>
        )}
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ink-2">Show readings as a table</summary>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Day</th>
                {tile.metrics.map((m) => (
                  <th key={m} className="py-1 font-normal">
                    {METRICS[m].label} ({METRICS[m].unit})
                  </th>
                ))}
                <th className="py-1 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {tableDays.map((d) => (
                <tr key={d} className="border-t border-grid">
                  <td className="py-1 text-ink-2">{formatDay(d)}</td>
                  {tile.metrics.map((m) => {
                    const v = index[m].get(d)
                    return (
                      <td key={m} className="py-1 text-ink">
                        {v === undefined ? '--' : formatValue(m, v)}
                      </td>
                    )
                  })}
                  <td className="py-1 text-ink-2">
                    {tile.metrics.some((m) => manualKeys.has(`${d}:${m}`)) ? 'Entered by you' : 'Sensor'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
        <h3 className="mb-3 font-semibold">Log a reading for {formatDay(day).toLowerCase()}</h3>
        <LogForm key={`${tile.id}:${day}`} metrics={tile.metrics} day={day} onLogged={onLogged} />
      </div>

      <dl className="flex flex-col gap-4 text-sm">
        <div>
          <dt className="font-semibold text-ink">Why it matters in space</dt>
          <dd className="mt-1 text-ink-2">{def.whyInSpace}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">How to measure</dt>
          <dd className="mt-1 text-ink-2">{def.howToMeasure}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">NASA spaceflight hazard</dt>
          <dd className="mt-1 text-ink-2">
            <a href={HAZARDS[def.hazard].url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
              {HAZARDS[def.hazard].label}
            </a>
            {def.nasaRisk && (
              <>
                {' | '}
                <a href={riskUrl(def.nasaRisk)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                  {def.nasaRisk}
                </a>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Reference</dt>
          <dd className="mt-1 text-muted">{def.reference}</dd>
        </div>
      </dl>
    </section>
  )
}
