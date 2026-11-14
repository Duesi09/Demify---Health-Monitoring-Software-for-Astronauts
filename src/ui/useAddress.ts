'use client'

import { useEffect, useRef } from 'react'
import { MISSION_DAYS } from '@/domain/simulator'

/**
 * Keeps the query string in the address in step with what the page shows, so
 * a reload or a shared link opens the same view. It never adds a history entry.
 *
 * The write waits a moment. On a fresh page load the router sets up its own
 * history state just after the first render; writing before that leaves the
 * entry without it, and the browser's Back button then changes the address
 * but not the page.
 *
 * A write that is still waiting when the crew member follows a link or goes
 * back is dropped: writing the address while the router is on its way to
 * another page would cancel that navigation.
 */
export function useAddress(query: string, active = true) {
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => {
      if (window.location.search !== query) window.history.replaceState(window.history.state, '', query)
    }, 150)
    const leave = (event: Event) => {
      if (event.type === 'popstate' || (event.target instanceof Element && event.target.closest('a[href]'))) {
        clearTimeout(timer)
      }
    }
    document.addEventListener('click', leave, true)
    window.addEventListener('popstate', leave)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', leave, true)
      window.removeEventListener('popstate', leave)
    }
  }, [query, active])
}

/**
 * Brings the page to the mission day in the address when it opens. Coming
 * back with the Back button, the router can restore the page as it was first
 * loaded, while the address already names the day that was shown last.
 */
export function useDayFromAddress(day: number, setDay: (day: number) => void) {
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) return
    checked.current = true
    const fromAddress = Number(new URLSearchParams(window.location.search).get('day'))
    if (Number.isInteger(fromAddress) && fromAddress >= 1 && fromAddress <= MISSION_DAYS && fromAddress !== day) {
      setDay(fromAddress)
    }
  }, [day, setDay])
}
