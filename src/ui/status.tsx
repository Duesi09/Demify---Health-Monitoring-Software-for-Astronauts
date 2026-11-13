import type { Status } from '@/domain/types'

/**
 * A triage level, `stale` when the data is too old to judge, or
 * `unmonitored` when nothing is measured yet.
 */
export type Tone = Status | 'stale' | 'unmonitored'

export const TONE: Record<Tone, { label: string; text: string; bg: string; glyph: string }> = {
  nominal: { label: 'Nominal', text: 'text-good', bg: 'bg-good', glyph: '#ffffff' },
  watch: { label: 'Watch', text: 'text-warning', bg: 'bg-warning', glyph: '#0b0b0b' },
  act: { label: 'Act', text: 'text-serious', bg: 'bg-serious', glyph: '#ffffff' },
  critical: { label: 'Critical', text: 'text-critical', bg: 'bg-critical', glyph: '#ffffff' },
  stale: { label: 'No recent data', text: 'text-muted', bg: 'bg-muted', glyph: '#0b0b0b' },
  unmonitored: { label: 'Not monitored yet', text: 'text-muted', bg: 'bg-axis', glyph: '#0b0b0b' },
}

export const TRIAGE: Record<Status, { headline: string; guidance: string }> = {
  nominal: {
    headline: 'All nominal',
    guidance: 'No action needed. Keep up your routine measurements.',
  },
  watch: {
    headline: 'Watch',
    guidance: 'You can handle this yourself. Follow the steps below and keep an eye on the trend.',
  },
  act: {
    headline: 'Act',
    guidance: 'Consult the Crew Medical Officer today.',
  },
  critical: {
    headline: 'Critical',
    guidance: 'Get the Crew Medical Officer now and contact the flight surgeon.',
  },
}

/** Replaces `TRIAGE.nominal` when nothing is flagged but some readings are out of date. */
export const INCOMPLETE = {
  headline: 'Measurements due',
  guidance:
    "Nothing is flagged in the readings you have, but some are out of date. Measure them now to complete today's check.",
}

/**
 * Each level has its own shape as well as its own colour, so the status is
 * readable without colour vision.
 */
export function StatusIcon({
  tone,
  size = 16,
  x,
  y,
}: {
  tone: Tone
  size?: number
  /** Position, when the icon is placed inside another SVG. */
  x?: number
  y?: number
}) {
  const glyph = TONE[tone].glyph
  const stroke = { stroke: glyph, strokeWidth: 1.8, strokeLinecap: 'round', fill: 'none' } as const
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      x={x}
      y={y}
      aria-hidden="true"
      className={`shrink-0 ${TONE[tone].text}`}
    >
      {tone === 'nominal' && (
        <>
          <circle cx="8" cy="8" r="7.5" fill="currentColor" />
          <path d="M4.6 8.3l2.2 2.2 4.6-4.8" {...stroke} strokeLinejoin="round" />
        </>
      )}
      {tone === 'watch' && (
        <>
          <path d="M8 1.2 15.4 14.4H.6z" fill="currentColor" strokeLinejoin="round" />
          <path d="M8 6v4" {...stroke} />
          <circle cx="8" cy="12.2" r="1" fill={glyph} />
        </>
      )}
      {tone === 'act' && (
        <>
          <path d="M8 .4 15.6 8 8 15.6.4 8z" fill="currentColor" />
          <path d="M8 4.4v4.2" {...stroke} />
          <circle cx="8" cy="11.2" r="1" fill={glyph} />
        </>
      )}
      {tone === 'critical' && (
        <>
          <path d="M5 .6h6L15.4 5v6L11 15.4H5L.6 11V5z" fill="currentColor" />
          <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" {...stroke} />
        </>
      )}
      {tone === 'stale' && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.4V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {tone === 'unmonitored' && (
        <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.4" />
      )}
    </svg>
  )
}

export function StatusBadge({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <StatusIcon tone={tone} />
      {label ?? TONE[tone].label}
    </span>
  )
}
