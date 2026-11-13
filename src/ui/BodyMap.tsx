'use client'

import { useState } from 'react'
import { BODY_REGIONS, regionStatus, type BodyRegion, type RegionId } from '@/domain/bodyRegions'
import { formatValue } from '@/domain/format'
import { HAZARDS, riskUrl } from '@/domain/hazards'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { StatusBadge, StatusIcon, TONE } from './status'
import { TILES, tileTone } from './tiles'

/** Where each body system sits on the figure, in the figure's own coordinates. */
const HOTSPOT: Record<RegionId, { x: number; y: number }> = {
  brain: { x: 100, y: 24 },
  eyes: { x: 100, y: 52 },
  immune: { x: 100, y: 82 },
  lungs: { x: 80, y: 128 },
  heart: { x: 120, y: 140 },
  metabolism: { x: 100, y: 194 },
  bones: { x: 79, y: 302 },
}

interface Props {
  evaluation: Evaluation
  selectedId: RegionId | null
  onSelectRegion: (id: RegionId | null) => void
  onSelectMetric: (metric: MetricId) => void
}

const link = 'underline underline-offset-2 hover:text-ink'

/**
 * A human figure with one marker per body system. Each marker shows the
 * system's status; selecting it explains what spaceflight does to that system,
 * how to protect it, and which indicators describe it.
 */
export function BodyMap({ evaluation, selectedId, onSelectRegion, onSelectMetric }: Props) {
  // Hovering or focusing a marker highlights its list entry, and the reverse.
  const [hoveredId, setHoveredId] = useState<RegionId | null>(null)
  const toggle = (id: RegionId) => onSelectRegion(selectedId === id ? null : id)

  return (
    <section aria-label="Body map" className="rounded-lg border border-edge bg-surface p-5">
      <h2 className="text-xl font-semibold">Body map</h2>
      <p className="mt-1 text-sm text-ink-2">
        Select a body system to see what spaceflight does to it and how to protect it.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start">
        <svg viewBox="0 0 200 440" className="mx-auto w-40 sm:w-full" role="group" aria-label="Human figure">
          <g className="fill-axis stroke-axis" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="100" cy="42" rx="27" ry="32" stroke="none" />
            <rect x="89" y="66" width="22" height="26" rx="4" stroke="none" />
            <path d="M58 98Q58 84 72 84H128Q142 84 142 98L134 196Q133 222 139 238H61Q67 222 66 196Z" stroke="none" />
            <path d="M55 100L41 170L35 238" fill="none" strokeWidth="19" />
            <path d="M145 100L159 170L165 238" fill="none" strokeWidth="19" />
            <path d="M80 236L78 330L76 420" fill="none" strokeWidth="27" />
            <path d="M120 236L122 330L124 420" fill="none" strokeWidth="27" />
          </g>

          {BODY_REGIONS.map((region) => {
            const { x, y } = HOTSPOT[region.id]
            const tone = regionStatus(region, evaluation)
            const active = region.id === selectedId || region.id === hoveredId
            return (
              <g
                key={region.id}
                role="button"
                tabIndex={0}
                aria-label={`${region.label}: ${TONE[tone].label}`}
                aria-pressed={region.id === selectedId}
                onClick={() => toggle(region.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle(region.id)
                  }
                }}
                onMouseEnter={() => setHoveredId(region.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(region.id)}
                onBlur={() => setHoveredId(null)}
                className="cursor-pointer outline-none"
              >
                <circle cx={x} cy={y} r="17" fill="transparent" />
                {active && <circle cx={x} cy={y} r="15" fill="none" className="stroke-series-1" strokeWidth="2" />}
                <circle cx={x} cy={y} r="12" className="fill-surface" />
                <StatusIcon tone={tone} size={20} x={x - 10} y={y - 10} />
              </g>
            )
          })}
        </svg>

        <ul className="flex flex-col gap-1">
          {BODY_REGIONS.map((region) => {
            const tone = regionStatus(region, evaluation)
            const open = region.id === selectedId
            return (
              <li key={region.id} className={`rounded-md ${open ? 'bg-raised' : ''}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(region.id)}
                  onMouseEnter={() => setHoveredId(region.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-raised ${
                    region.id === hoveredId ? 'bg-raised' : ''
                  }`}
                >
                  <StatusIcon tone={tone} size={18} />
                  <span className="min-w-0 flex-1 font-medium text-ink">{region.label}</span>
                  <span className="text-xs text-ink-2">{TONE[tone].label}</span>
                </button>
                {open && <RegionDetail region={region} evaluation={evaluation} onSelectMetric={onSelectMetric} />}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function RegionDetail({
  region,
  evaluation,
  onSelectMetric,
}: {
  region: BodyRegion
  evaluation: Evaluation
  onSelectMetric: (metric: MetricId) => void
}) {
  const tiles = TILES.filter((t) => t.metrics.some((m) => region.metrics.includes(m)))

  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-4 text-sm">
      {tiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => onSelectMetric(tile.metrics[0])}
              className="flex flex-col gap-1 rounded-md border border-edge bg-surface px-3 py-2 text-left hover:border-series-1"
            >
              <span className="text-xs text-ink-2">{tile.label}</span>
              <span className="text-ink">
                <span className="text-lg font-semibold">
                  {tile.metrics
                    .map((m) => {
                      const v = evaluation.assessments[m].value
                      return v === null ? '–' : formatValue(m, v)
                    })
                    .join('/')}
                </span>{' '}
                <span className="text-xs text-ink-2">{METRICS[tile.metrics[0]].unit}</span>
              </span>
              <StatusBadge tone={tileTone(tile, evaluation)} />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-ink-2">No indicator is tracked for this body system yet. {region.planned}</p>
      )}

      <dl className="flex flex-col gap-3">
        <div>
          <dt className="font-semibold text-ink">What it does</dt>
          <dd className="mt-0.5 text-ink-2">{region.role}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">What spaceflight does to it</dt>
          <dd className="mt-0.5 text-ink-2">{region.inSpace}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">How to protect it</dt>
          <dd className="mt-0.5 text-ink-2">
            <ul className="list-disc pl-5">
              {region.protect.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">NASA spaceflight hazard</dt>
          <dd className="mt-0.5 text-ink-2">
            <a href={HAZARDS[region.hazard].url} target="_blank" rel="noreferrer" className={link}>
              {HAZARDS[region.hazard].label}
            </a>
            {' · '}
            <a href={riskUrl(region.nasaRisk)} target="_blank" rel="noreferrer" className={link}>
              {region.nasaRisk}
            </a>
          </dd>
        </div>
      </dl>
    </div>
  )
}
