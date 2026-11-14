'use client'

import { useEffect, useMemo, useState } from 'react'
import { evaluateIndexed, indexReadings } from '@/domain/engine'
import { linkState, parseProfile, PROFILE_IDS, PROFILES, type ProfileId } from '@/domain/missionContext'
import { MISSION_DAYS } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { PageShell } from '../PageShell'
import { AutonomyScale } from './AutonomyScale'
import { EarthKnows } from './EarthKnows'
import { EarthView } from './EarthView'
import { LightTimeLedger } from './LightTimeLedger'
import { SourcesBox } from './SourcesBox'
import { useAddress } from '../useAddress'

interface Props {
  initialReadings: Reading[]
  initialDay: number
  initialProfile: ProfileId
  /** False when the address named no place, as when arriving from the header. */
  profileGiven: boolean
}

const PROFILE_KEY = 'demify.link.profile'

const stepButton =
  'rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis disabled:opacity-40'

/**
 * The Earth link section: how far Earth is, how old its picture of the crew
 * member is, when an answer can arrive at the earliest, and what to do until then.
 */
export function EarthLink({ initialReadings, initialDay, initialProfile, profileGiven }: Props) {
  const [day, setDay] = useState(initialDay)
  const [profile, setProfile] = useState(initialProfile)

  const index = useMemo(() => indexReadings(initialReadings), [initialReadings])
  const evaluation = useMemo(() => evaluateIndexed(index, day), [index, day])
  const link = useMemo(() => linkState(profile, day), [profile, day])

  function remember(place: ProfileId) {
    try {
      window.sessionStorage.setItem(PROFILE_KEY, place)
    } catch {
      // Storage can be switched off; the place simply is not remembered.
    }
  }

  function choosePlace(place: ProfileId) {
    setProfile(place)
    remember(place)
  }

  // The header links carry only the day. Coming back without a place in the
  // address, return to the one chosen earlier in this browser session.
  // Storing happens when a place is chosen, never here on its own: an effect
  // that stored the starting place could run before the restore and erase it.
  useEffect(() => {
    if (profileGiven) {
      remember(initialProfile)
      return
    }
    try {
      const saved = window.sessionStorage.getItem(PROFILE_KEY)
      if (saved !== null) setProfile(parseProfile(saved))
    } catch {
      // The default place is fine then.
    }
  }, [profileGiven, initialProfile])

  // Keep day and place in the address, so a reload or a shared link opens the same view.
  // Waits for the slider to rest: browsers limit how often the address may change.
  useAddress(`?day=${day}&profile=${profile}`)

  return (
    <PageShell current="link" day={day}>
      <section className="card rise p-6 sm:p-7" style={{ '--i': 0 } as React.CSSProperties}>
        <p className="eyebrow">Distance from Earth | simulated mission</p>
        <h1 className="mt-1 text-5xl font-semibold tracking-tight">Earth link</h1>
        <p className="mt-3 max-w-3xl text-lg leading-snug text-ink-2">
          How far Earth is, how old its picture of you is, when an answer can arrive at the earliest, and what to
          do until then.
        </p>

        <div className="mt-6 grid gap-x-10 gap-y-5 @5xl:grid-cols-[auto_minmax(0,1fr)]">
          <div>
            <p id="profile-label" className="text-sm text-ink-2">
              Where you are
            </p>
            <div
              role="group"
              aria-labelledby="profile-label"
              className="mt-2 flex w-fit max-w-full flex-wrap gap-1 rounded-3xl bg-white/[0.06] p-1 ring-1 ring-edge"
            >
              {PROFILE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={profile === id}
                  onClick={() => choosePlace(id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    profile === id ? 'bg-ink text-page' : 'text-ink-2 hover:bg-white/[0.08] hover:text-ink'
                  }`}
                >
                  {PROFILES[id].label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor="mission-day" className="text-sm text-ink-2">
              Mission day <span className="font-semibold text-ink tabular-nums">{day}</span> of {MISSION_DAYS}
              <span className="text-muted">
                {profile === 'transit'
                  ? ' | sets the distance and the health data'
                  : ' | sets the health data; the distance is fixed here'}
              </span>
            </label>
            {/* On a phone the slider gets a row of its own, with the two buttons under it. */}
            <div className="mt-2 grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:flex">
              <button type="button" className={stepButton} disabled={day <= 1} onClick={() => setDay(day - 1)}>
                Previous day
              </button>
              <input
                id="mission-day"
                type="range"
                min={1}
                max={MISSION_DAYS}
                step={1}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="order-first col-span-2 h-10 min-w-40 flex-1 cursor-pointer accent-series-1 sm:order-none"
              />
              <button type="button" className={stepButton} disabled={day >= MISSION_DAYS} onClick={() => setDay(day + 1)}>
                Next day
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <EarthView profile={profile} day={day} />
        <div className="flex min-w-0 flex-col gap-5">
          <AutonomyScale link={link} />
          <EarthKnows evaluation={evaluation} link={link} />
        </div>
      </div>

      <LightTimeLedger evaluation={evaluation} link={link} />

      <SourcesBox />
    </PageShell>
  )
}
