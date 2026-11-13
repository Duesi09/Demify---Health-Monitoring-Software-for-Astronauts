import type { Evaluation } from '@/domain/types'
import { INCOMPLETE, StatusIcon, TRIAGE } from './status'
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
    .join(' | ')

  return (
    <section
      aria-label="Overall health status"
      className="card rise flex flex-col p-7"
      style={{ '--i': 1 } as React.CSSProperties}
    >
      <div className="flex items-center gap-4">
        <StatusIcon tone={tone} size={52} />
        <p className="text-6xl leading-none font-semibold tracking-tight">{triage.headline}</p>
      </div>
      <p className="mt-4 text-xl leading-snug text-ink">{triage.guidance}</p>
      <p className="mt-1 text-sm text-ink-2">{count}</p>

      {/* Always present and with room for three lines, so the panel keeps its height from day to day. */}
      <div className="mt-auto pt-5">
        <div key={first?.id ?? 'routine'} className="swap-in min-h-31 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-edge">
          <p className="eyebrow">{first ? 'Do this first' : 'Next step'}</p>
          <p className="mt-1.5 text-ink">
            {first ? first.action : 'Take your routine measurements at the usual times and log them here.'}
          </p>
        </div>
      </div>
    </section>
  )
}
