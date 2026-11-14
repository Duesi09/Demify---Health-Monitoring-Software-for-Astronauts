'use client'

import { BACKGROUND, citation, dayRange, eventsOn } from '@/domain/events'
import type { Evidence, EvidenceNote, Strength } from '@/domain/events'

const STRENGTH_LABEL: Record<Strength, string> = {
  'observed in spaceflight': 'Observed in spaceflight',
  'observed in a ground or analog study': 'Observed in a ground or analog study',
  scenario: 'Scenario',
}

// The arrow keeps its place at the start of the first line while the rest wraps on a narrow screen.
const summaryRow = 'flex cursor-pointer list-none items-start gap-3 rounded-md [&::-webkit-details-marker]:hidden'
const summaryText = 'flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1'

/**
 * The strength of the evidence as words, with a shape beside them (full,
 * half or empty) so the three levels differ without relying on colour.
 */
function StrengthLabel({ strength }: { strength: Strength }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium text-ink-2">
      <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true" className="shrink-0">
        <circle
          cx="6"
          cy="6"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={strength === 'scenario' ? '2.2 2' : undefined}
        />
        {strength === 'observed in spaceflight' && <circle cx="6" cy="6" r="3" fill="currentColor" />}
        {strength === 'observed in a ground or analog study' && <path d="M6 3a3 3 0 0 0 0 6z" fill="currentColor" />}
      </svg>
      {STRENGTH_LABEL[strength]}
    </span>
  )
}

/** The arrow that shows a row can be opened; it turns when the row is open. */
function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      aria-hidden="true"
      className="mt-1.5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-90"
    >
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EvidenceItem({ item }: { item: Evidence }) {
  return (
    <li className="py-3">
      <StrengthLabel strength={item.strength} />
      <p className="mt-1.5 text-sm text-ink">{item.finding}</p>
      <p className="mt-1 text-xs text-muted">
        Source:{' '}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 underline decoration-axis underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {citation(item)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </li>
  )
}

/** The story, the honest limits and the sources of one event or background change. */
function NoteBody({ note }: { note: EvidenceNote }) {
  const evidenceLabel = note.basis === 'scenario' ? 'Related evidence' : 'Evidence'
  return (
    <>
      <p className="mt-2 text-sm text-ink-2">
        <span className="font-semibold text-ink">In the simulation: </span>
        {note.story}
      </p>
      {note.note && (
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-semibold text-ink">Keep in mind: </span>
          {note.note}
        </p>
      )}
      {note.evidence.length > 0 && (
        <>
          <p className="eyebrow mt-4" aria-hidden="true">
            {evidenceLabel}
          </p>
          <ul aria-label={`${evidenceLabel} for ${note.title}`} className="divide-y divide-grid">
            {note.evidence.map((item) => (
              <EvidenceItem key={item.url} item={item} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function sourceCount(count: number): string {
  if (count === 0) return 'Story'
  return count === 1 ? 'Story and 1 source' : `Story and ${count} sources`
}

/**
 * What the simulation is doing on this mission day and what real evidence
 * stands behind it. Collapsed it is one line per event; the evidence opens
 * on request, so it can sit under the timeline without pushing the page down.
 */
export function EventNote({ day }: { day: number }) {
  const events = eventsOn(day)

  return (
    <section
      aria-label="Simulated events and their evidence"
      className="card rise px-5 py-4 sm:px-6"
      style={{ '--i': 1 } as React.CSSProperties}
    >
      <h2 className="sr-only">Simulated events and their evidence</h2>

      {events.length === 0 && (
        <details className="group">
          <summary className={summaryRow}>
            <Chevron />
            <span className={summaryText}>
              <span className="text-sm text-ink-2">
                <span className="font-medium text-ink">Quiet day</span> | no scripted event. The slow adaptation to
                spaceflight continues in the background.
              </span>
              <span className="ml-auto text-xs text-muted">Background and evidence</span>
            </span>
          </summary>
          <ul className="mt-3 divide-y divide-grid border-t border-grid">
            {BACKGROUND.map((item) => (
              <li key={item.id} className="py-4 last:pb-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-medium text-ink">{item.title}</h3>
                  <StrengthLabel strength={item.basis} />
                </div>
                <NoteBody note={item} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {events.length > 0 && (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              {/* Keyed by event, so an open note stays open while the day moves within the event. */}
              <details className="group">
                <summary className={summaryRow}>
                  <Chevron />
                  <span className={summaryText}>
                    <span className="eyebrow">Simulated event | {dayRange(event)}</span>
                    <span className="font-medium text-ink">{event.title}</span>
                    <StrengthLabel strength={event.basis} />
                    <span className="ml-auto text-xs text-muted">{sourceCount(event.evidence.length)}</span>
                  </span>
                </summary>
                <div className="mt-2 border-t border-grid pt-1 pb-1">
                  <NoteBody note={event} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
