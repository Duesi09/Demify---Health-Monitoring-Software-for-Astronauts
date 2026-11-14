'use client'

import { useState } from 'react'
import { BODY_REGIONS, regionStatus, type BodyRegion, type RegionId } from '@/domain/bodyRegions'
import { formatValue } from '@/domain/format'
import { HAZARDS, riskUrl } from '@/domain/hazards'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { needsAttention, StatusBadge, StatusIcon, TONE, type Tone } from './status'
import { TILES, tileTone } from './tiles'

const WIDTH = 260
const HEIGHT = 548

/**
 * Left half of the body outline from the neck down to the crotch, as curves:
 * [controlX, controlY, endX, endY]. The right half is its mirror image.
 */
const HALF_OUTLINE: [number, number, number, number][] = [
  [116, 96, 100, 100], // neck to shoulder
  [72, 104, 66, 126], // shoulder
  [60, 160, 56, 198], // upper arm, outside
  [50, 236, 44, 270], // forearm, outside
  [38, 288, 40, 302], // hand
  [44, 314, 52, 306],
  [58, 292, 58, 274],
  [66, 236, 72, 204], // forearm, inside
  [80, 170, 86, 140], // upper arm, inside, up to the armpit
  [88, 180, 92, 214], // chest down to the waist
  [84, 244, 84, 270], // hip
  [86, 330, 94, 392], // thigh, outside, down to the knee
  [92, 440, 100, 496], // calf, outside
  [94, 512, 91, 522], // foot
  [98, 532, 117, 528],
  [121, 512, 116, 496],
  [122, 440, 120, 392], // calf, inside
  [126, 330, 130, 286], // thigh, inside, up to the crotch
]

function bodyOutline(): string {
  const ends: [number, number][] = [[118, 88], ...HALF_OUTLINE.map(([, , x, y]) => [x, y] as [number, number])]
  let d = 'M118 74L118 88'
  for (const [cx, cy, x, y] of HALF_OUTLINE) d += `Q${cx} ${cy} ${x} ${y}`
  for (let i = HALF_OUTLINE.length - 1; i >= 0; i--) {
    const [cx, cy] = HALF_OUTLINE[i]
    const [x, y] = ends[i]
    d += `Q${WIDTH - cx} ${cy} ${WIDTH - x} ${y}`
  }
  return `${d}L142 74Z`
}
/** The figure: body and head. Drawn once in neutral grey and once more as the whole-body system. */
const FIGURE = (
  <>
    <path d={bodyOutline()} />
    <ellipse cx="130" cy="46" rx="26" ry="32" />
  </>
)

/** Where each body system is marked: centre and size of its selection ring, and where its status badge sits. */
const MARKER: Record<RegionId, { x: number; y: number; r: number; badge: [number, number] }> = {
  brain: { x: 130, y: 35, r: 21, badge: [152, 20] },
  eyes: { x: 130, y: 60, r: 14, badge: [150, 66] },
  balance: { x: 155.5, y: 50, r: 10, badge: [166, 42] },
  immune: { x: 138, y: 86, r: 9, badge: [150, 80] },
  lungs: { x: 110, y: 144, r: 17, badge: [96, 120] },
  heart: { x: 134, y: 149, r: 17, badge: [152, 134] },
  metabolism: { x: 117, y: 190, r: 17, badge: [98, 198] },
  kidneys: { x: 146, y: 224, r: 13, badge: [160, 214] },
  bones: { x: 107, y: 332, r: 15, badge: [122, 318] },
  // The dosimeter on the shoulder, clear of the lung, the armpit lymph node and the arm bone.
  wholeBody: { x: 172, y: 116, r: 9, badge: [190, 102] },
}

/** Drawn back to front, so the heart sits on top of the lungs. */
const DRAW_ORDER: RegionId[] = ['wholeBody', 'bones', 'lungs', 'metabolism', 'kidneys', 'heart', 'immune', 'brain', 'eyes', 'balance']

/**
 * The shapes of one body system. Measured systems are filled in their status
 * colour; systems without an indicator are dashed outlines.
 */
function Organ({ id, hollow }: { id: RegionId; hollow: boolean }) {
  const paint = hollow
    ? ({ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeDasharray: '3 2.5' } as const)
    : ({ fill: 'currentColor' } as const)
  const bone = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' } as const
  const fold = { fill: 'none', stroke: 'var(--color-page)', strokeOpacity: 0.4, strokeWidth: 1.2, strokeLinecap: 'round' } as const

  switch (id) {
    case 'brain':
      return (
        <>
          <path {...paint} d="M130 20c-11 0-19 7-19 16 0 8 6 13 14 13h10c8 0 14-5 14-13 0-9-8-16-19-16z" />
          {!hollow && <path {...fold} d="M130 22v25M120 28q6 5 0 12M140 28q-6 5 0 12" />}
        </>
      )
    case 'eyes':
      return (
        <>
          <ellipse {...paint} cx="120" cy="60" rx="5.5" ry="3.5" />
          <ellipse {...paint} cx="140" cy="60" rx="5.5" ry="3.5" />
        </>
      )
    case 'balance':
      return (
        <>
          <ellipse {...paint} cx="104.5" cy="50" rx="3" ry="6.5" />
          <ellipse {...paint} cx="155.5" cy="50" rx="3" ry="6.5" />
        </>
      )
    case 'immune':
      // Lymph nodes at the neck, the armpits and the groin.
      return (
        <>
          {[
            [122, 86],
            [138, 86],
            [93, 142],
            [167, 142],
            [114, 270],
            [146, 270],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} {...paint} cx={cx} cy={cy} r="3.4" />
          ))}
        </>
      )
    case 'lungs':
      return (
        <>
          <path {...paint} d="M124 108C110 110 100 130 100 158C100 170 105 176 113 174C120 172 124 164 124 152Z" />
          <path {...paint} d="M136 108C150 110 160 130 160 158C160 170 155 176 147 174C140 172 136 164 136 152Z" />
        </>
      )
    case 'heart':
      return (
        <path
          {...paint}
          stroke="var(--color-surface)"
          strokeWidth="2"
          d="M134 140c3-6 13-5 13 4 0 7-7 12-13 18-6-6-13-11-13-18 0-9 10-10 13-4z"
        />
      )
    case 'metabolism':
      // Liver on the left of the picture, stomach and pancreas on the right.
      return (
        <>
          <path {...paint} d="M98 184C110 176 126 178 136 184C134 198 124 202 112 200C104 198 98 192 98 184Z" />
          <path {...paint} d="M142 184C152 180 160 184 160 192C160 200 152 204 146 202C140 198 140 190 142 184Z" />
        </>
      )
    case 'kidneys':
      return (
        <>
          <ellipse {...paint} cx="114" cy="224" rx="6" ry="10" transform="rotate(12 114 224)" />
          <ellipse {...paint} cx="146" cy="224" rx="6" ry="10" transform="rotate(-12 146 224)" />
        </>
      )
    case 'bones':
      // The lower spine, the pelvis and the long bones of arms and legs.
      return (
        <>
          <path {...bone} strokeWidth="5" strokeDasharray="0.1 7" d="M130 180V250" />
          <path {...bone} strokeWidth="4" d="M108 256Q130 268 152 256" />
          <path {...bone} strokeWidth="4" d="M76 128L65 196M184 128L195 196" />
          <path {...bone} strokeWidth="3.5" d="M63 208L51 268M197 208L209 268" />
          <path {...bone} strokeWidth="5" d="M106 284L107 382M154 284L153 382" />
          <path {...bone} strokeWidth="4" d="M107 402L108 488M153 402L152 488" />
        </>
      )
    case 'wholeBody':
      // Radiation reaches every cell, so the outline of the figure itself carries the status.
      // The small badge on the shoulder is the personal dosimeter, which gives the marker something to sit on.
      return (
        <>
          <g fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            {FIGURE}
          </g>
          <rect {...paint} x="167.5" y="110.5" width="9" height="11" rx="2.5" />
        </>
      )
  }
}

interface Props {
  evaluation: Evaluation
  selectedId: RegionId | null
  onSelectRegion: (id: RegionId | null) => void
  onSelectMetric: (metric: MetricId) => void
}

const link = 'underline underline-offset-2 hover:text-ink'

/**
 * A human figure showing every body system in its status colour. Selecting a
 * system explains what spaceflight does to it, how to protect it, and which
 * indicators describe it.
 */
export function BodyMap({ evaluation, selectedId, onSelectRegion, onSelectMetric }: Props) {
  // Hovering or focusing a system on the figure highlights its list entry, and the reverse.
  const [hoveredId, setHoveredId] = useState<RegionId | null>(null)
  const toggle = (id: RegionId) => onSelectRegion(selectedId === id ? null : id)
  const tones = Object.fromEntries(BODY_REGIONS.map((r) => [r.id, regionStatus(r, evaluation)])) as Record<
    RegionId,
    Tone
  >

  return (
    <section aria-label="Body map" className="card rise @container p-6" style={{ '--i': 3 } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight">Body map</h2>
      <p className="mt-1 text-sm text-ink-2">
        Select a body system to see what spaceflight does to it and how to protect it.
      </p>

      <div className="mt-5 grid gap-5 @md:grid-cols-[250px_minmax(0,1fr)] @md:items-start">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mx-auto w-60 @md:w-full"
          role="group"
          aria-label="Human figure"
        >
          <defs>
            <linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <g fill="url(#body-fill)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="1.5" strokeLinejoin="round">
            {FIGURE}
          </g>

          {DRAW_ORDER.map((id) => {
            const region = BODY_REGIONS.find((r) => r.id === id)!
            const tone = tones[id]
            const marker = MARKER[id]
            const active = id === selectedId || id === hoveredId
            const attention = needsAttention(tone)
            const strength = active ? 1 : attention ? 0.95 : tone === 'nominal' ? 0.5 : tone === 'stale' ? 0.35 : 0.75
            return (
              <g
                key={id}
                role="button"
                tabIndex={0}
                aria-label={`${region.label}: ${TONE[tone].label}`}
                aria-pressed={id === selectedId}
                onClick={() => toggle(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle(id)
                  }
                }}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(id)}
                onBlur={() => setHoveredId(null)}
                className="cursor-pointer outline-none"
                style={{ color: TONE[tone].color, pointerEvents: 'all' }}
              >
                {attention && (
                  <circle
                    cx={marker.x}
                    cy={marker.y}
                    r={marker.r * 0.7}
                    fill="currentColor"
                    className={`ripple ${tone === 'critical' ? 'ripple-fast' : ''}`}
                  />
                )}
                <g opacity={strength} className="transition-[opacity,color] duration-500">
                  <Organ id={id} hollow={tone === 'unmonitored'} />
                </g>
                {/* A generous target, since some systems are drawn very small. */}
                <circle cx={marker.x} cy={marker.y} r={Math.max(marker.r, 11)} fill="transparent" />
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.r + 4}
                  fill="none"
                  className="stroke-series-1 transition-opacity duration-200"
                  strokeWidth="2"
                  opacity={active ? 1 : 0}
                />
                {attention && (
                  <>
                    <circle cx={marker.badge[0]} cy={marker.badge[1]} r="9" className="fill-surface" />
                    <StatusIcon tone={tone} size={14} x={marker.badge[0] - 7} y={marker.badge[1] - 7} />
                  </>
                )}
              </g>
            )
          })}
        </svg>

        <ul className="flex flex-col gap-1">
          {BODY_REGIONS.map((region) => {
            const tone = tones[region.id]
            const open = region.id === selectedId
            return (
              <li
                key={region.id}
                className={`rounded-2xl transition-colors duration-300 ${open ? 'bg-white/[0.05] ring-1 ring-edge' : ''}`}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(region.id)}
                  onMouseEnter={() => setHoveredId(region.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-raised ${
                    region.id === hoveredId && !open ? 'bg-raised' : ''
                  }`}
                >
                  <StatusIcon tone={tone} size={18} />
                  <span className="min-w-0 flex-1 font-medium text-ink">{region.label}</span>
                  <span className="text-xs text-ink-2">{TONE[tone].label}</span>
                </button>
                {/* Kept in the page while closed so opening and closing can glide. */}
                <div
                  inert={!open}
                  className={`grid transition-[grid-template-rows,opacity,visibility] duration-500 ease-(--ease-soft) ${
                    open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <RegionDetail region={region} evaluation={evaluation} onSelectMetric={onSelectMetric} />
                  </div>
                </div>
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
              className="flex flex-col gap-1 rounded-xl bg-page/60 px-3 py-2 text-left ring-1 ring-edge transition-shadow hover:ring-series-1"
            >
              <span className="text-xs text-ink-2">{tile.label}</span>
              <span className="text-ink">
                <span className="text-lg font-semibold">
                  {tile.metrics
                    .map((m) => {
                      const v = evaluation.assessments[m].value
                      return v === null ? '--' : formatValue(m, v)
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
        <p className="text-ink-2">
          No indicator is tracked for this body system yet.{region.planned ? ` ${region.planned}` : ''}
        </p>
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
            {region.nasaRisk && (
              <>
                {' | '}
                <a href={riskUrl(region.nasaRisk)} target="_blank" rel="noreferrer" className={link}>
                  {region.nasaRisk}
                </a>
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  )
}
