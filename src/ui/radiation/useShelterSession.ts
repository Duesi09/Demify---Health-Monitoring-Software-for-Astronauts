'use client'

import { useCallback, useEffect, useState } from 'react'
import { CLOCK_SPEEDS, SHELTER_FACTOR, SHELTER_STEPS, newClock, type Clock } from '@/domain/radiation'

/** The state of one run through the procedure: a real event or the drill. */
export interface ProcedureRun {
  /** Ids of the steps ticked off. */
  checked: string[]
  /** Time since the alarm. */
  alarm: Clock
  /** Time in the shelter. */
  shelter: Clock
}

export interface ShelterSession {
  /** True while the drill is open. */
  drill: boolean
  /** Clock speed; anything but 1 is the fast-forward for demos. */
  speed: number
  /** The assumed shielding factor of the illustrative estimate. */
  factor: number
  /** One run per procedure: `drill`, or `event-148` for the event that began on day 148. */
  runs: Record<string, ProcedureRun>
}

const STORAGE_KEY = 'demify.radiation.shelter.v1'

const EMPTY: ShelterSession = { drill: false, speed: 1, factor: SHELTER_FACTOR.initial, runs: {} }

export function newRun(speed: number): ProcedureRun {
  return { checked: [], alarm: newClock(speed), shelter: newClock(speed) }
}

function readClock(value: unknown, speed: number): Clock {
  const v = (value ?? {}) as Partial<Clock>
  return {
    banked: typeof v.banked === 'number' && Number.isFinite(v.banked) && v.banked >= 0 ? v.banked : 0,
    startedAt: typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) ? v.startedAt : null,
    speed,
  }
}

/**
 * Rebuilds the session from stored text. Whatever is missing or malformed
 * falls back to its default, so old or damaged data can never break the
 * procedure.
 */
export function parseSession(text: string | null): ShelterSession {
  if (!text) return EMPTY
  try {
    const raw = JSON.parse(text) as Partial<ShelterSession> | null
    if (typeof raw !== 'object' || raw === null) return EMPTY
    const speed = CLOCK_SPEEDS.some((s) => s.speed === raw.speed) ? (raw.speed as number) : 1
    const factor =
      typeof raw.factor === 'number' && raw.factor >= SHELTER_FACTOR.min && raw.factor <= SHELTER_FACTOR.max
        ? raw.factor
        : SHELTER_FACTOR.initial
    const stepIds = new Set(SHELTER_STEPS.map((s) => s.id))
    const runs: Record<string, ProcedureRun> = {}
    for (const [id, value] of Object.entries(raw.runs ?? {})) {
      const run = (value ?? {}) as Partial<ProcedureRun>
      runs[id] = {
        checked: Array.isArray(run.checked) ? run.checked.filter((s) => stepIds.has(s)) : [],
        alarm: readClock(run.alarm, speed),
        shelter: readClock(run.shelter, speed),
      }
    }
    return { drill: raw.drill === true, speed, factor, runs }
  } catch {
    return EMPTY
  }
}

/**
 * Checklist ticks, clocks and the drill, kept for the browser session so a
 * reload or a visit to another section does not lose a procedure in progress.
 * Without session storage (private mode, blocked storage) everything still
 * works; it just does not survive a reload.
 */
export function useShelterSession(): {
  session: ShelterSession
  /** False until the stored session has been read, which happens after the first paint. */
  ready: boolean
  update: (change: (current: ShelterSession) => ShelterSession) => void
} {
  const [session, setSession] = useState(EMPTY)
  const [ready, setReady] = useState(false)

  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    try {
      setSession(parseSession(window.sessionStorage.getItem(STORAGE_KEY)))
    } catch {
      // Storage is unavailable: carry on with the session held in memory.
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } catch {
      // Storage is full or unavailable: the session stays in memory only.
    }
  }, [session, ready])

  const update = useCallback((change: (current: ShelterSession) => ShelterSession) => setSession(change), [])
  return { session, ready, update }
}
