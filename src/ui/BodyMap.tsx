'use client'

import { useState } from 'react'
import { BODY_REGIONS, regionStatus, type BodyRegion, type RegionId } from '@/domain/bodyRegions'
import { formatValue } from '@/domain/format'
import { HAZARDS, riskUrl } from '@/domain/hazards'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { needsAttention, StatusBadge, StatusIcon, TONE, type Tone } from './status'
import { TILES, tileTone } from './tiles'

const WIDTH = 280
const HEIGHT = 740
const CENTRE = WIDTH / 2
/** Bones when nothing is flagged; they take the status colour when it is. */
const BONE_WHITE = '#e9eef5'
/** The outline of the body while nothing is flagged or selected. */
const BODY_EDGE = 'rgb(140 190 240 / 0.45)'
/** The dark of the skull's openings and of outlines drawn over the blue body. */
const DEEP = '#0b2038'

/**
 * Left half of the body outline from the neck down to the crotch, as curves:
 * [controlX, controlY, endX, endY]. The right half is its mirror image.
 */
const HALF_OUTLINE: [number, number, number, number][] = [
  [120, 134, 96, 140], // neck to shoulder
  [60, 144, 50, 172], // shoulder
  [40, 220, 36, 262], // upper arm, outside, down to the elbow
  [26, 310, 18, 356], // forearm, outside, down to the wrist
  [4, 390, 10, 424], // hand
  [16, 438, 26, 428],
  [40, 400, 40, 362],
  [48, 314, 56, 268], // forearm, inside
  [64, 222, 72, 182], // upper arm, inside, up to the armpit
  [76, 240, 84, 292], // chest down to the waist
  [72, 326, 70, 360], // hip
  [72, 440, 86, 508], // thigh, outside, down to the knee
  [80, 570, 92, 664], // calf, outside, down to the ankle
  [84, 690, 76, 706], // foot
  [86, 722, 118, 716],
  [122, 694, 114, 664],
  [122, 580, 122, 512], // calf, inside
  [132, 440, 140, 384], // thigh, inside, up to the crotch
]

function bodyOutline(): string {
  const ends: [number, number][] = [[124, 118], ...HALF_OUTLINE.map(([, , x, y]) => [x, y] as [number, number])]
  let d = 'M124 96L124 118'
  for (const [cx, cy, x, y] of HALF_OUTLINE) d += `Q${cx} ${cy} ${x} ${y}`
  for (let i = HALF_OUTLINE.length - 1; i >= 0; i--) {
    const [cx, cy] = HALF_OUTLINE[i]
    const [x, y] = ends[i]
    d += `Q${WIDTH - cx} ${cy} ${WIDTH - x} ${y}`
  }
  return `${d}L156 96Z`
}
const BODY_OUTLINE = bodyOutline()

/** Mirrors a shape drawn on the left of the picture to the right. */
const MIRROR = `matrix(-1 0 0 1 ${WIDTH} 0)`

/** Ten ribs per side: height on the spine, how far out each reaches, how far it drops. */
const RIBS = [30, 38, 44, 48, 51, 52, 51, 48, 43, 36].map((reach, i) => {
  const y = 152 + i * 10.5
  const drop = 13 + i * 0.6
  // The upper ribs end at the breastbone, the next ones along the rib arch, the last two float.
  const end = [6, 6, 6, 6, 6, 9, 15, 24][i]
  return end === undefined
    ? `M${CENTRE - 5} ${y}Q${CENTRE - reach * 0.6} ${y - 6} ${CENTRE - reach} ${y + 8}`
    : `M${CENTRE - 5} ${y}C${CENTRE - reach} ${y - 9} ${CENTRE - reach} ${y + drop + 5} ${CENTRE - end} ${y + drop}`
})

/** The spinal column as single vertebrae, widening toward the pelvis. */
const VERTEBRAE = Array.from({ length: 22 }, (_, i) => {
  const y = 104 + i * 9
  const width = 12 + (i / 21) * 8
  return { x: CENTRE - width / 2, y, width }
})

/** One bone of a limb: a shaft with a thicker knob at each end. */
function LongBone({ from, to, width }: { from: [number, number]; to: [number, number]; width: number }) {
  return (
    <>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
      <circle cx={from[0]} cy={from[1]} r={width * 0.72} fill="currentColor" />
      <circle cx={to[0]} cy={to[1]} r={width * 0.72} fill="currentColor" />
    </>
  )
}

/** Fingers or toes: short bones in a row, drawn as one segmented line each. */
function Digits({ from, tips }: { from: [number, number]; tips: [number, number][] }) {
  return (
    <>
      {tips.map(([x, y]) => (
        <line
          key={`${x}-${y}`}
          x1={from[0]}
          y1={from[1]}
          x2={x}
          y2={y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="16 1.5 10 1.5 8 1.5 20"
        />
      ))}
    </>
  )
}

/** Collarbone, arm and hand on the left of the picture; drawn a second time mirrored. */
function SkeletonArm() {
  return (
    <>
      <path d="M135 148Q108 138 78 152" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      {/* Upper arm, the two forearm bones, wrist and fingers */}
      <LongBone from={[72, 160]} to={[48, 258]} width={9} />
      <LongBone from={[51, 268]} to={[31, 350]} width={4.5} />
      <LongBone from={[44, 266]} to={[23, 348]} width={4.5} />
      <ellipse cx="26" cy="360" rx="9" ry="6" fill="currentColor" />
      <Digits
        from={[26, 364]}
        tips={[
          [12, 414],
          [16, 425],
          [22, 429],
          [29, 425],
          [37, 398],
        ]}
      />
    </>
  )
}

/** Hip bone, leg and foot on the left of the picture; drawn a second time mirrored. */
function SkeletonLeg() {
  return (
    <>
      {/* Hip bone with the opening below the joint */}
      <path
        d="M138 302C118 290 88 296 86 318C86 334 100 342 110 346C112 360 120 372 134 374L138 360C128 356 124 344 126 332C128 320 134 312 138 302Z"
        fill="currentColor"
      />
      {/* Thigh bone, kneecap, shin and calf bone, ankle and toes */}
      <LongBone from={[103, 364]} to={[106, 498]} width={11} />
      <circle cx="106" cy="507" r="6.5" fill="currentColor" stroke={DEEP} strokeOpacity="0.35" />
      <LongBone from={[108, 518]} to={[104, 658]} width={8.5} />
      <line x1="97" y1="522" x2="96" y2="656" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="102" cy="672" rx="10" ry="8" fill="currentColor" />
      <Digits
        from={[100, 676]}
        tips={[
          [85, 708],
          [91, 712],
          [98, 714],
          [105, 714],
          [112, 711],
        ]}
      />
    </>
  )
}

/** Height below which the spine carries the body's weight (the lumbar spine). */
const LUMBAR_FROM = 256

/** Upper spine, rib cage and breastbone. Clicks pass through them to the organs behind. */
function SkeletonChest() {
  return (
    <g pointerEvents="none">
      {VERTEBRAE.filter((v) => v.y < LUMBAR_FROM).map((v) => (
        <rect key={v.y} x={v.x} y={v.y} width={v.width} height="6.5" rx="2" fill="currentColor" />
      ))}
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        {RIBS.map((d) => (
          <path key={d} d={d} />
        ))}
        <g transform={MIRROR}>
          {RIBS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>
      <path d="M131 146H149L147 160L145 218Q140 226 135 218L133 160Z" fill="currentColor" />
    </g>
  )
}

/** The skull with its openings. */
function Skull() {
  return (
    <>
      <path
        d="M140 14C118 14 108 32 108 52C108 66 113 76 120 82L122 94Q140 110 158 94L160 82C167 76 172 66 172 52C172 32 162 14 140 14Z"
        fill="currentColor"
      />
      <g fill={DEEP}>
        <ellipse cx="127" cy="57" rx="8.5" ry="7.5" />
        <ellipse cx="153" cy="57" rx="8.5" ry="7.5" />
        <path d="M140 67L135.5 78H144.5Z" />
      </g>
      <path d="M126 88H154M131 85V91M135.5 85V91M140 85V91M144.5 85V91M149 85V91" fill="none" stroke={DEEP} strokeWidth="1" strokeOpacity="0.7" />
    </>
  )
}

/** Where each body system is marked: centre and size of its selection ring, and where its status badge sits. */
const MARKER: Record<RegionId, { x: number; y: number; r: number; badge: [number, number] }> = {
  brain: { x: 140, y: 33, r: 22, badge: [168, 18] },
  eyes: { x: 140, y: 57, r: 21, badge: [170, 70] },
  balance: { x: 176, y: 58, r: 9, badge: [190, 48] },
  immune: { x: 152, y: 122, r: 9, badge: [168, 114] },
  lungs: { x: 113, y: 202, r: 22, badge: [90, 172] },
  heart: { x: 146, y: 197, r: 20, badge: [172, 176] },
  metabolism: { x: 124, y: 262, r: 20, badge: [98, 280] },
  kidneys: { x: 162, y: 288, r: 13, badge: [180, 276] },
  bones: { x: 106, y: 440, r: 16, badge: [126, 424] },
  wholeBody: { x: 191, y: 262, r: 10, badge: [208, 246] },
}

/**
 * Drawn back to front: the body itself comes first and stands for the whole
 * body (radiation). Lungs, liver and stomach lie behind the rib cage, the
 * skeleton comes next, and the rest is drawn over it. The heart is drawn over
 * the ribs on purpose, so the organ this app watches most closely stays visible.
 */
const DRAW_ORDER: RegionId[] = [
  'wholeBody',
  'lungs',
  'metabolism',
  'bones',
  'heart',
  'kidneys',
  'immune',
  'brain',
  'eyes',
  'balance',
]

/**
 * The shapes of one body system. Measured systems are filled in their status
 * colour; systems without an indicator are dashed outlines. The bones are the
 * whole skeleton.
 */
function Organ({ id, hollow, emphasis }: { id: RegionId; hollow: boolean; emphasis: boolean }) {
  const paint = hollow
    ? ({ fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeDasharray: '3 2.5' } as const)
    : ({ fill: 'currentColor', stroke: DEEP, strokeOpacity: 0.5, strokeWidth: 1 } as const)
  const fold = { fill: 'none', stroke: DEEP, strokeOpacity: 0.45, strokeWidth: 1.3, strokeLinecap: 'round' } as const

  switch (id) {
    case 'wholeBody':
      // The body keeps its blue fill; its outline carries the status and the selection.
      return (
        <g
          fill="url(#body-fill)"
          stroke="currentColor"
          strokeWidth={emphasis ? 3 : 1.5}
          strokeLinejoin="round"
          className="transition-[stroke-width] duration-300"
        >
          <path d={BODY_OUTLINE} />
          <ellipse cx={CENTRE} cy="56" rx="36" ry="48" />
        </g>
      )
    case 'brain':
      return (
        <>
          <path {...paint} d="M140 18c-13 0-22 8-22 18 0 8 6 13 14 13h16c8 0 14-5 14-13 0-10-9-18-22-18z" />
          {!hollow && <path {...fold} d="M140 20v27M129 26q7 6 0 14M151 26q-7 6 0 14" />}
        </>
      )
    case 'eyes':
      return (
        <>
          <circle {...paint} cx="127" cy="57" r="5" />
          <circle {...paint} cx="153" cy="57" r="5" />
        </>
      )
    case 'balance':
      return (
        <>
          <ellipse {...paint} cx="104" cy="58" rx="3.5" ry="7" />
          <ellipse {...paint} cx="176" cy="58" rx="3.5" ry="7" />
        </>
      )
    case 'immune':
      // Lymph nodes at the neck, the armpits and the groin.
      return (
        <>
          {[
            [128, 122],
            [152, 122],
            [80, 188],
            [200, 188],
            [118, 384],
            [162, 384],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} {...paint} cx={cx} cy={cy} r="4" />
          ))}
        </>
      )
    case 'lungs':
      return (
        <>
          <path {...paint} d="M132 152C112 154 96 180 96 214C96 232 100 246 110 246C122 244 132 236 132 222Z" />
          <path {...paint} d="M148 152C168 154 184 180 184 214C184 232 180 246 170 246C158 244 148 236 148 222Z" />
        </>
      )
    case 'heart':
      return (
        <path
          {...paint}
          strokeOpacity={hollow ? undefined : 0.85}
          strokeWidth={1.6}
          d="M146 184c4-8 18-7 18 5 0 10-10 17-18 25-8-8-18-15-18-25 0-12 14-13 18-5z"
        />
      )
    case 'metabolism':
      // Liver on the left of the picture, stomach and pancreas on the right.
      return (
        <>
          <path {...paint} d="M98 254C116 244 138 248 150 256C146 276 132 282 116 278C104 274 98 264 98 254Z" />
          <path {...paint} d="M156 256C170 250 182 256 182 268C182 280 170 286 162 282C154 276 152 264 156 256Z" />
        </>
      )
    case 'kidneys':
      return (
        <>
          <ellipse {...paint} cx="118" cy="288" rx="6.5" ry="11" transform="rotate(12 118 288)" />
          <ellipse {...paint} cx="162" cy="288" rx="6.5" ry="11" transform="rotate(-12 162 288)" />
        </>
      )
    case 'bones':
      // Skull, chest and arms stay bone white. The bones that carry the body's
      // weight (lower spine, pelvis, legs) are the ones that thin out in
      // weightlessness, so only they take the status colour.
      return (
        <>
          <g style={{ color: BONE_WHITE }}>
            <SkeletonChest />
            <SkeletonArm />
            <g transform={MIRROR}>
              <SkeletonArm />
            </g>
            <Skull />
          </g>
          <g pointerEvents="none">
            {VERTEBRAE.filter((v) => v.y >= LUMBAR_FROM).map((v) => (
              <rect key={v.y} x={v.x} y={v.y} width={v.width} height="6.5" rx="2" fill="currentColor" />
            ))}
          </g>
          <path d="M131 300H149L145 330Q140 338 135 330Z" fill="currentColor" />
          <SkeletonLeg />
          <g transform={MIRROR}>
            <SkeletonLeg />
          </g>
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

      <div className="mt-5 grid gap-5 @md:grid-cols-[240px_minmax(0,1fr)] @md:items-start">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mx-auto w-60 @md:w-full"
          role="group"
          aria-label="Human figure"
        >
          <defs>
            <radialGradient id="body-fill" cx="0.5" cy="0.42" r="0.62">
              <stop offset="0" stopColor="#5fa8e6" stopOpacity="0.62" />
              <stop offset="1" stopColor="#1f5a9c" stopOpacity="0.5" />
            </radialGradient>
          </defs>
          {DRAW_ORDER.map((id) => {
            const region = BODY_REGIONS.find((r) => r.id === id)!
            const tone = tones[id]
            const marker = MARKER[id]
            const active = id === selectedId || id === hoveredId
            const attention = needsAttention(tone)
            // The skeleton stays bone white until something is flagged; organs always carry their status colour.
            // The body outline stays pale blue and turns white when selected.
            const resting =
              id === 'bones'
                ? tone === 'stale'
                  ? 'var(--color-muted)'
                  : BONE_WHITE
                : id === 'wholeBody'
                  ? active
                    ? 'var(--color-ink)'
                    : BODY_EDGE
                  : null
            const color = resting !== null && !attention ? resting : TONE[tone].color
            const strength =
              id === 'wholeBody'
                ? 1
                : id === 'bones'
                  ? 0.94
                  : active
                    ? 1
                    : attention
                      ? 0.95
                      : tone === 'nominal'
                        ? id === 'heart'
                          ? 0.9
                          : 0.7
                        : tone === 'stale'
                          ? 0.45
                          : 0.85
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
                style={{ color, pointerEvents: 'all' }}
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
                  <Organ id={id} hollow={tone === 'unmonitored'} emphasis={active || attention} />
                </g>
                {/* A generous target, since some systems are drawn very small. The body is its own target. */}
                {id !== 'wholeBody' && (
                  <circle cx={marker.x} cy={marker.y} r={Math.max(marker.r, 11)} fill="transparent" />
                )}
              </g>
            )
          })}

          {/* Selection rings and status badges sit above everything, so the rib cage never covers them. */}
          <g pointerEvents="none">
            {BODY_REGIONS.map((region) => {
              const tone = tones[region.id]
              const marker = MARKER[region.id]
              const active = region.id === selectedId || region.id === hoveredId
              return (
                <g key={region.id}>
                  <circle
                    cx={marker.x}
                    cy={marker.y}
                    r={marker.r + 4}
                    fill="none"
                    className="stroke-ink transition-opacity duration-200"
                    strokeWidth="2"
                    opacity={active && region.id !== 'wholeBody' ? 1 : 0}
                  />
                  {needsAttention(tone) && (
                    <>
                      <circle cx={marker.badge[0]} cy={marker.badge[1]} r="10" className="fill-surface" />
                      <StatusIcon tone={tone} size={16} x={marker.badge[0] - 8} y={marker.badge[1] - 8} />
                    </>
                  )}
                </g>
              )
            })}
          </g>
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
