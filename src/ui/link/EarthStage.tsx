'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import {
  MOON_FROM_EARTH_DEG,
  SUN_FROM_MARS_DEG,
  formatAngle,
  type LinkState,
} from '@/domain/missionContext'

/** The drawing area, in its own units. The stage keeps this shape or crops its sides. */
const WIDTH = 800
const HEIGHT = 480
/** Radius of the reference ring: the full Moon as seen from Earth. Everything else is scaled to it. */
const RING_RADIUS = 60
const UNITS_PER_DEGREE = (2 * RING_RADIUS) / MOON_FROM_EARTH_DEG
/** Milliseconds Earth takes to settle at a new size. */
const SETTLE_MS = 900
/** Disc radius above which land and cloud are left out: by then one patch of ocean fills the stage. */
const DETAIL_LIMIT = 1200

/** Radius of Earth's disc on the stage, to the same scale as the ring. */
export function earthRadiusOnStage(link: LinkState): number {
  return (link.earthAngleDeg * UNITS_PER_DEGREE) / 2
}

/** Below one unit across there is no disc left to draw, only a point of light. */
export function drawnAsPoint(link: LinkState): boolean {
  return 2 * earthRadiusOnStage(link) < 1
}

/** Repeatable star field, so the server and the browser draw the same sky. */
const STARS = (() => {
  let seed = 20260
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  return Array.from({ length: 110 }, () => ({
    x: Math.round(random() * WIDTH * 10) / 10,
    y: Math.round(random() * HEIGHT * 10) / 10,
    r: Math.round((0.35 + random() * 0.75) * 100) / 100,
    o: Math.round((0.15 + random() * 0.55) * 100) / 100,
  }))
})()

/**
 * Earth on a unit disc of radius 100: land, ice and cloud as an impression of
 * the view over Africa. Only the size of the disc is to scale.
 */
const LAND = [
  // Africa
  'M-8 -34C4 -40 22 -38 32 -30C38 -24 46 -20 50 -10C44 -4 40 2 38 10C36 24 30 38 22 50C16 58 8 56 6 46C4 34 0 24 -4 14C-14 12 -24 8 -28 -2C-30 -14 -22 -28 -8 -34Z',
  // Arabia
  'M44 -34C54 -36 64 -28 66 -18C60 -12 52 -14 48 -20C46 -26 44 -30 44 -34Z',
  // Europe and Asia
  'M-20 -52C-6 -62 20 -66 44 -62C62 -58 76 -50 82 -40C70 -40 58 -44 46 -42C34 -46 20 -44 8 -46C-2 -44 -14 -46 -20 -52Z',
  // Madagascar
  'M46 26C50 28 50 38 46 43C43 39 43 31 46 26Z',
  // South America, on the limb
  'M-94 2C-82 -2 -72 8 -70 20C-70 34 -78 46 -86 54C-92 40 -96 20 -94 2Z',
]
const DESERT = [
  'M-18 -27C-4 -34 20 -33 34 -25C40 -20 44 -16 44 -12C30 -10 6 -10 -14 -14C-20 -18 -22 -23 -18 -27Z',
  'M46 -32C54 -33 62 -26 63 -19C58 -15 52 -17 49 -22C47 -26 46 -29 46 -32Z',
]
const CLOUDS = [
  { d: 'M-82 -26C-62 -42 -42 -30 -22 -42', width: 6 },
  { d: 'M-70 -34C-58 -38 -50 -36 -40 -40', width: 3 },
  { d: 'M-66 30C-46 18 -30 32 -12 24', width: 5 },
  { d: 'M-74 62C-44 50 -12 68 22 60C42 56 58 64 72 54', width: 7 },
  { d: 'M-50 72C-30 66 -6 76 12 72', width: 4 },
  { d: 'M18 -80C38 -86 58 -76 66 -62', width: 5 },
  { d: 'M-46 -70C-34 -80 -14 -78 -4 -68', width: 5 },
  { d: 'M54 6C62 -4 76 0 84 10', width: 5 },
  { d: 'M30 74C44 66 58 72 66 82', width: 4 },
  { d: 'M-52 -4C-44 -12 -36 -8 -32 0', width: 3 },
  { d: 'M-20 34C-12 28 -2 30 4 36', width: 3 },
  { d: 'M56 30C64 26 74 30 78 38', width: 4 },
  // A storm spiral over the southern ocean.
  { d: 'M-44 50C-34 42 -22 46 -22 56C-22 64 -34 66 -38 58C-40 54 -34 50 -30 54', width: 3 },
]

/** The view from low orbit, where Earth covers the whole stage: a coast under cloud. */
const NEAR_LAND = 'M400 480C440 410 520 400 590 340C650 290 720 300 800 230V480Z'
const NEAR_DESERT = 'M500 480C530 440 590 430 640 390C690 350 740 350 800 310V480Z'
const NEAR_CLOUDS = [
  { cx: 150, cy: 90, rx: 300, ry: 34, rotate: -18 },
  { cx: 620, cy: 150, rx: 260, ry: 26, rotate: 14 },
  { cx: 240, cy: 310, rx: 320, ry: 38, rotate: -8 },
  { cx: 660, cy: 420, rx: 280, ry: 30, rotate: 20 },
  { cx: 60, cy: 440, rx: 200, ry: 24, rotate: -26 },
  { cx: 420, cy: 210, rx: 150, ry: 18, rotate: 32 },
]

interface Props {
  link: LinkState
  /** Jump to the new size at once, for the replay, where the day itself is the animation. */
  instant?: boolean
}

/**
 * Earth at its true apparent size, drawn against the size of the full Moon
 * seen from Earth. The picture is decoration for screen readers; the numbers
 * are in the text under it.
 */
export function EarthStage({ link, instant = false }: Props) {
  const radius = earthRadiusOnStage(link)
  const point = drawnAsPoint(link)
  const hidden = !link.contact
  // In low orbit the disc is far larger than the stage; show the surface instead of one flat colour.
  const near = Math.min(1, Math.max(0, (radius - 1500) / 3000))
  // Marks around a small Earth, so the eye finds it.
  const tick = radius < 40 && !hidden ? Math.max(radius + 9, 16) : null

  const disc = useRef<SVGGElement>(null)
  const detail = useRef<SVGGElement>(null)
  // The first size is written by React; later sizes are animated here.
  const [initialRadius] = useState(radius)
  const shown = useRef(radius)

  useLayoutEffect(() => {
    const el = disc.current
    if (!el) return
    const from = shown.current
    const apply = (r: number) => {
      shown.current = r
      el.setAttribute('transform', `scale(${r / 100})`)
      // Softened detail is costly to draw at huge sizes, and invisible there anyway.
      detail.current?.setAttribute('display', r > DETAIL_LIMIT ? 'none' : 'inline')
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (instant || still || from === radius) {
      apply(radius)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      // A frame can carry a time from just before the start, so keep the progress at 0 or above.
      const t = Math.min(1, Math.max(0, (now - start) / SETTLE_MS))
      const eased = 1 - Math.pow(1 - t, 3)
      // Sizes span five orders of magnitude, so travel evenly in scale, not in units.
      apply(from * Math.pow(radius / from, eased))
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [radius, instant])

  const sunRadius = (SUN_FROM_MARS_DEG * UNITS_PER_DEGREE) / 2
  const fade = 'transition-opacity duration-700 motion-reduce:transition-none'

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="stage-sky" cx="50%" cy="50%" r="75%">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="0.6" stopColor="#05070c" />
          <stop offset="1" stopColor="#000000" />
        </radialGradient>
        <radialGradient id="stage-earth" cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor="#5fa3ee" />
          <stop offset="0.35" stopColor="#2f74d0" />
          <stop offset="0.7" stopColor="#174ea6" />
          <stop offset="1" stopColor="#0a2760" />
        </radialGradient>
        <radialGradient id="stage-shade" cx="32%" cy="26%" r="92%">
          <stop offset="0.5" stopColor="#00030f" stopOpacity="0" />
          <stop offset="0.82" stopColor="#00030f" stopOpacity="0.4" />
          <stop offset="1" stopColor="#00030f" stopOpacity="0.78" />
        </radialGradient>
        <radialGradient id="stage-air">
          <stop offset="0.86" stopColor="#8fc4ff" stopOpacity="0" />
          <stop offset="0.895" stopColor="#8fc4ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#8fc4ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-cloud">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="stage-ocean" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a80d9" />
          <stop offset="1" stopColor="#123f93" />
        </linearGradient>
        <radialGradient id="stage-glow">
          <stop offset="0" stopColor="#cfe6ff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#8fc1ff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#8fc1ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="stage-sun">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#fff3cf" />
          <stop offset="1" stopColor="#ffd98a" />
        </radialGradient>
        <radialGradient id="stage-corona">
          <stop offset="0" stopColor="#ffe9b0" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#ffcf7a" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <clipPath id="stage-disc">
          <circle r="100" />
        </clipPath>
        <filter id="stage-soft-land" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id="stage-soft-cloud" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.9" />
        </filter>
        <filter id="stage-soft-near" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="url(#stage-sky)" />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o} />
      ))}

      <g transform={`translate(${WIDTH / 2} ${HEIGHT / 2})`}>
        {/* Earth as a disc, always at its true size, even when that is far below one unit. */}
        <g className={fade} opacity={hidden ? 0 : 1}>
          <g ref={disc} transform={`scale(${initialRadius / 100})`}>
            <circle r="112" fill="url(#stage-air)" />
            <circle r="100" fill="url(#stage-earth)" />
            <g ref={detail} clipPath="url(#stage-disc)" display={initialRadius > DETAIL_LIMIT ? 'none' : 'inline'}>
              <g filter="url(#stage-soft-land)">
                {LAND.map((d) => (
                  <path key={d} d={d} fill="#2f7a55" opacity="0.92" />
                ))}
                {DESERT.map((d) => (
                  <path key={d} d={d} fill="#c4a76a" opacity="0.85" />
                ))}
                <ellipse cy="-101" rx="36" ry="8" fill="#ffffff" opacity="0.9" />
                <ellipse cy="101" rx="50" ry="12" fill="#ffffff" opacity="0.95" />
              </g>
              <g filter="url(#stage-soft-cloud)" fill="none" stroke="#ffffff" strokeLinecap="round" opacity="0.62">
                {CLOUDS.map((c) => (
                  <path key={c.d} d={c.d} strokeWidth={c.width} />
                ))}
              </g>
            </g>
            <circle r="100" fill="url(#stage-shade)" />
            <circle r="100" fill="none" stroke="#cfe6ff" strokeWidth="0.8" opacity="0.4" />
          </g>
        </g>

        {/* Earth as a point of light. The mark is larger than the true disc, which could not be seen. */}
        <g className={fade} opacity={point && !hidden ? 1 : 0}>
          <circle r="26" fill="url(#stage-glow)" />
          <path d="M-13 0H13M0 -13V13" stroke="#dcecff" strokeWidth="0.6" opacity="0.55" />
          <circle r="1.7" fill="#f2f8ff" />
        </g>

        {tick !== null && (
          <path
            d={`M0 ${-tick}v-7M0 ${tick}v7M${-tick} 0h-7M${tick} 0h7`}
            stroke="#ffffff"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.7"
          />
        )}
      </g>

      {/* Low orbit: the surface fills the stage. */}
      <g className={fade} opacity={hidden ? 0 : near}>
        <rect width={WIDTH} height={HEIGHT} fill="url(#stage-ocean)" />
        <g filter="url(#stage-soft-near)">
          <path d={NEAR_LAND} fill="#2f7a55" />
          <path d={NEAR_DESERT} fill="#c4a76a" opacity="0.8" />
        </g>
        {NEAR_CLOUDS.map((c, i) => (
          <ellipse
            key={i}
            cx={c.cx}
            cy={c.cy}
            rx={c.rx}
            ry={c.ry}
            transform={`rotate(${c.rotate} ${c.cx} ${c.cy})`}
            fill="url(#stage-cloud)"
          />
        ))}
      </g>

      {/* Blackout: the Sun at its size seen from Mars, with Earth lost in the glare. */}
      <g className={fade} opacity={hidden ? 1 : 0} transform={`translate(${WIDTH / 2} ${HEIGHT / 2})`}>
        <circle r="300" fill="url(#stage-corona)" />
        <circle r={sunRadius} fill="url(#stage-sun)" />
      </g>

      {/* The yardstick: the full Moon as seen from Earth. */}
      <circle
        cx={WIDTH / 2}
        cy={HEIGHT / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.3"
        strokeDasharray="2 6"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  )
}

/** What the picture shows, in words, for the label on the stage. */
export function earthCaption(link: LinkState): string {
  if (!link.contact) return 'Earth | hidden in the glare of the Sun'
  const size = formatAngle(link.earthAngleDeg)
  if (drawnAsPoint(link)) return `Earth | point of light, ${size} | mark not to scale`
  return `Earth | ${size} across`
}
