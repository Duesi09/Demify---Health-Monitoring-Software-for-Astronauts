'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { consultProgress, parseLedger, serializeLedger, shipNow, type Ledger } from '@/domain/consult'

const STORAGE_KEY = 'demify.earth-link.ledger.v1'
/**
 * Milliseconds between clock ticks: while a signal is on its way in
 * fast-forward, on its way in real time, and while nothing moves.
 */
const FAST_TICK_MS = 100
const BUSY_TICK_MS = 250
const IDLE_TICK_MS = 1000

// Storage can be switched off or full; the ledger then lives in memory only.
function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(value: string): boolean {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True when the crew member has asked the system for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

/**
 * The ledger of this browser session and the ship clock that drives it.
 * `ledger` and `now` are null until the stored ledger has been read, which
 * can only happen in the browser.
 */
export function useLedger(reducedMotion: boolean) {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [stored, setStored] = useState(true)

  useEffect(() => {
    setLedger(parseLedger(readStored(), Date.now()))
  }, [])

  useEffect(() => {
    if (ledger) setStored(writeStored(serializeLedger(ledger)))
  }, [ledger])

  const clock = ledger?.clock
  const busy =
    ledger !== null && now !== null && ledger.consults.some((c) => consultProgress(c, now).phase !== 'answered')
  // Without motion there is nothing to draw between two seconds, so tick slowly.
  const tickMs = !busy || reducedMotion ? IDLE_TICK_MS : clock && clock.rate > 1 ? FAST_TICK_MS : BUSY_TICK_MS

  useEffect(() => {
    if (!clock) return
    const tick = () => setNow(shipNow(clock, Date.now()))
    tick()
    const timer = setInterval(tick, tickMs)
    return () => clearInterval(timer)
  }, [clock, tickMs])

  const update = useCallback((change: (current: Ledger) => Ledger) => {
    setLedger((current) => (current ? change(current) : current))
  }, [])

  return { ledger, now, stored, tickMs, update }
}
