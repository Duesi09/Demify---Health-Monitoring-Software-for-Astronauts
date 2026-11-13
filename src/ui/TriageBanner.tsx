import type { Evaluation } from '@/domain/types'
import { INCOMPLETE, needsAttention, StatusIcon, TONE, TRIAGE } from './status'
import { TILES } from './tiles'

/** The one thing to read first: the overall triage level and what to do about it. */
export function TriageBanner({ evaluation }: { evaluation: Evaluation }) {
  const { status, findings } = evaluation
  const first = findings[0]
  const due = TILES.filter((t) => t.metrics.some((m) => evaluation.assessments[m].stale)).length
  // Out-of-date readings cannot vouch for the crew member, so nominal is not claimed.
  const incomplete = status === 'nominal' && due > 0
  const tone = incomplete ? 'stale' : status
  const triage = incomplete ? INCOMPLETE : TRIAGE[status]
  const count = [
    findings.length === 0
      ? incomplete
        ? "No findings in today's data"
        : 'No findings today'
      : `${findings.length} ${findings.length === 1 ? 'finding needs' : 'findings need'} your attention`,
    due > 0 ? `${due} ${due === 1 ? 'measurement' : 'measurements'} due` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      aria-label="Overall health status"
      className="card rise relative flex flex-col overflow-hidden p-7"
      style={{ '--i': 1 } as React.CSSProperties}
    >
      {/* A wash of the status colour behind the headline; it breathes when action is needed. */}
      <div className="pointer-events-none absolute -top-28 -left-28 size-96 opacity-25" aria-hidden="true">
        <div
          className={`size-full rounded-full blur-3xl transition-colors duration-700 ${needsAttention(tone) ? 'breathe' : ''}`}
          style={{ background: TONE[tone].color }}
        />
      </div>

      <p className="eyebrow relative">Health status</p>
      <div className="relative mt-3 flex items-center gap-4">
        <StatusIcon tone={tone} size={52} />
        <p className="text-6xl leading-none font-semibold tracking-tight">{triage.headline}</p>
      </div>
      <p className="relative mt-4 text-xl leading-snug text-ink">{triage.guidance}</p>
      <p className="relative mt-1 text-sm text-ink-2">{count}</p>

      {first && (
        <div key={first.id} className="swap-in relative mt-auto pt-5">
          <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-edge">
            <p className="eyebrow">Do this first</p>
            <p className="mt-1.5 text-ink">{first.action}</p>
          </div>
        </div>
      )}
    </section>
  )
}
