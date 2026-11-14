'use client'

import { useSyncExternalStore } from 'react'
import { SOURCES, type SourceId } from '@/domain/radiation'

/** Shared looks of the radiation section, so its panels read as one. */
export const button =
  'rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis disabled:opacity-40'
export const primaryButton =
  'rounded-full bg-action px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition hover:brightness-110 active:scale-[0.97] motion-reduce:active:scale-100'
export const link = 'text-ink-2 underline decoration-axis underline-offset-4 hover:text-ink hover:decoration-ink'

/**
 * Marks a number for what it is: simulated, projected or illustrative. The
 * word carries the meaning; the dashed outline only helps it stand out.
 */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-muted px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap text-ink-2 uppercase">
      {children}
    </span>
  )
}

/** A link to one of the listed sources. `children` replaces the default text. */
export function SourceLink({ source, children }: { source: SourceId; children?: React.ReactNode }) {
  const s = SOURCES[source]
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className={link}>
      {children ?? s.short}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeToMotion(onChange: () => void): () => void {
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
