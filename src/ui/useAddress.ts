'use client'

import { useEffect } from 'react'

/**
 * Keeps the query string in the address in step with what the page shows, so
 * a reload or a shared link opens the same view. It never adds a history entry.
 *
 * The write waits a moment. On a fresh page load the router sets up its own
 * history state just after the first render; writing before that leaves the
 * entry without it, and the browser's Back button then changes the address
 * but not the page.
 */
export function useAddress(query: string, active = true) {
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => {
      if (window.location.search !== query) window.history.replaceState(null, '', query)
    }, 150)
    return () => clearTimeout(timer)
  }, [query, active])
}
