'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BLACKOUT_DAYS,
  EYE_LIMIT_DEG,
  ISS_ALTITUDE_KM,
  MOON_FROM_EARTH_DEG,
  PROFILES,
  SUN_FROM_MARS_DEG,
  comparedWithMoon,
  formatAngle,
  formatDistance,
  formatDuration,
  linkState,
  type LinkState,
  type ProfileId,
} from '@/domain/missionContext'
import { EarthStage, drawnAsPoint, earthCaption } from './EarthStage'
import { useReducedMotion } from './useLedger'

/** One quiet line on what the crew member sees. */
function whatYouSee(link: LinkState): string {
  const away = formatDuration(link.oneWayS)
  switch (link.profile) {
    case 'iss':
      return `Earth fills the window. Home is ${ISS_ALTITUDE_KM} km below you.`
    case 'moon':
      return "Earth hangs in a black sky, small enough to hide behind your thumb at arm's length."
    case 'mars-far':
      return `Earth is a point of light among the stars. Everyone who can help you is there, ${away} away.`
    case 'blackout':
      return `Earth is behind the Sun. For about ${BLACKOUT_DAYS} days nothing gets through.`
    case 'transit': {
      const ratio = link.earthAngleDeg / MOON_FROM_EARTH_DEG
      if (ratio >= 1.05) return `Earth is still close: ${comparedWithMoon(link.earthAngleDeg)} as you know it from home.`
      if (ratio > 0.95) return 'Earth now looks as large as the full Moon does from home. From here on it is smaller.'
      if (link.earthAngleDeg >= EYE_LIMIT_DEG) {
        return `Earth has shrunk to a small blue disc, ${comparedWithMoon(link.earthAngleDeg)}.`
      }
      return `Earth is a point of light among the stars. Everyone who can help you is there, ${away} away.`
    }
  }
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5">
        <span className="block text-2xl leading-tight font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="mt-1 block text-sm text-ink-2">{note}</span>
      </dd>
    </div>
  )
}

const pill = 'rounded-full bg-page px-3 py-1 text-xs text-ink ring-1 ring-edge'

/**
 * The shrinking Earth: how large home looks from where the crew member is,
 * with the three numbers that follow from the distance.
 */
export function EarthView({ profile, day }: { profile: ProfileId; day: number }) {
  const reducedMotion = useReducedMotion()
  // During a replay, the day the picture has reached; a fraction, so Earth shrinks evenly.
  const [replayDay, setReplayDay] = useState<number | null>(null)
  const frame = useRef(0)

  // A new day or place ends a running replay.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current)
      setReplayDay(null)
    }
  }, [profile, day])

  function replay() {
    cancelAnimationFrame(frame.current)
    const start = performance.now()
    // Long enough to follow, short enough for a demo.
    const duration = 2600 + day * 25
    const step = (now: number) => {
      // A frame can carry a time from just before the start, so keep the progress at 0 or above.
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // Most of the shrinking happens in the first days, so they get the most time.
      setReplayDay(t < 1 ? 1 + (day - 1) * Math.pow(t, 2.4) : null)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    setReplayDay(1)
    frame.current = requestAnimationFrame(step)
  }

  const replaying = replayDay !== null
  const link = linkState(profile, replayDay ?? day)
  const shownDay = Math.round(replayDay ?? day)
  const distance = formatDistance(link.signalKm)
  const toTheEye = link.earthAngleDeg >= EYE_LIMIT_DEG ? 'a disc to the unaided eye' : 'a point to the unaided eye'
  const canReplay = profile === 'transit' && day > 1 && !reducedMotion

  return (
    <section
      aria-labelledby="earth-view-title"
      className="card rise @container flex flex-col overflow-hidden"
      style={{ '--i': 1 } as React.CSSProperties}
    >
      {/* The stage takes whatever height the panel has to spare; the picture crops its sides to fit. */}
      <figure className="relative aspect-square flex-auto @md:aspect-[4/3] @2xl:aspect-[5/3]">
        <EarthStage link={link} instant={replaying} />
        {/* Lets the sky run out into the panel instead of ending at an edge. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-surface to-transparent" />

        <figcaption className="pointer-events-none absolute inset-0">
          <span className="sr-only">
            {link.contact
              ? `Earth drawn at its apparent size of ${formatAngle(link.earthAngleDeg)}, next to a dashed ring the size of the full Moon as seen from Earth.`
              : 'The Sun as seen from Mars, next to a dashed ring the size of the full Moon as seen from Earth. Earth is hidden behind the Sun.'}
          </span>
          <span aria-hidden="true">
            <span className={`${pill} absolute left-1/2 max-w-[90%] -translate-x-1/2 text-center`} style={{ bottom: 'calc(62.5% + 0.9rem)' }}>
              {earthCaption(link)}
            </span>
            <span className={`${pill} absolute left-1/2 max-w-[90%] -translate-x-1/2 text-center text-ink-2`} style={{ top: 'calc(62.5% + 0.9rem)' }}>
              {link.contact
                ? `Dashed ring: full Moon seen from Earth, ${formatAngle(MOON_FROM_EARTH_DEG)}`
                : `Sun seen from Mars, ${formatAngle(SUN_FROM_MARS_DEG)} | ring: full Moon seen from Earth`}
            </span>
          </span>
        </figcaption>

        <p className={`${pill} absolute top-4 left-4 max-w-[calc(100%-2rem)] sm:top-5 sm:left-5`}>
          <span className="text-ink-2">Seen from: </span>
          {PROFILES[profile].place}
          {profile === 'transit' && `, day ${shownDay}`}
        </p>
        {canReplay && (
          <button
            type="button"
            onClick={replay}
            disabled={replaying}
            className="absolute right-4 bottom-4 rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink ring-1 ring-edge transition-colors hover:bg-axis disabled:opacity-60 sm:right-5 sm:bottom-5"
          >
            {replaying ? `Day ${shownDay}` : 'Replay the journey'}
          </button>
        )}
      </figure>

      <div className="flex flex-col gap-5 p-6 sm:p-7">
        <div>
          <h2 id="earth-view-title" className="eyebrow">
            Earth from where you are
          </h2>
          {/* Room for two lines, so the numbers below do not jump while the text changes. */}
          <p className="mt-2 min-h-[3.5rem] text-xl leading-snug text-ink @2xl:text-2xl">{whatYouSee(link)}</p>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-grid pt-5 @md:grid-cols-3">
          <Stat
            label="Distance from Earth"
            value={distance.km}
            note={
              distance.au ??
              (profile === 'iss' ? 'Above the ground' : profile === 'moon' ? 'Centre to centre, on average' : "Still in Earth's neighbourhood")
            }
          />
          <Stat
            label="Apparent size of Earth"
            value={formatAngle(link.earthAngleDeg)}
            note={
              link.contact
                ? `${capitalise(comparedWithMoon(link.earthAngleDeg))} | ${toTheEye}`
                : 'Hidden: Earth is behind the Sun'
            }
          />
          <Stat
            label="One-way signal time"
            value={link.contact ? formatDuration(link.oneWayS) : 'No contact'}
            note={
              link.contact
                ? `Round trip ${formatDuration(link.roundTripS)}`
                : `Light needs ${formatDuration(link.oneWayS)}, but no signal passes the Sun`
            }
          />
        </dl>

        <p className="text-xs text-muted">
          Sizes are to scale. Colours and lighting are an impression. {drawnAsPoint(link) && link.contact
            ? "Earth's true disc is smaller than one pixel here, so a mark shows where it is. "
            : ''}
          {PROFILES[profile].basis}
        </p>
      </div>
    </section>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
