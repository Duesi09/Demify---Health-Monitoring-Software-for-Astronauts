import type { Evaluation } from '@/domain/types'
import { StatusIcon, TONE, TRIAGE } from './status'
import { TILES } from './tiles'

/** The one thing to read first: the overall triage level and what to do about it. */
export function TriageBanner({ evaluation }: { evaluation: Evaluation }) {
  const { status, findings } = evaluation
  const triage = TRIAGE[status]
  const first = findings[0]
  const due = TILES.filter((t) => t.metrics.some((m) => evaluation.assessments[m].stale)).length
  const count = [
    findings.length === 0
      ? 'No findings today'
      : `${findings.length} ${findings.length === 1 ? 'finding needs' : 'findings need'} your attention`,
    due > 0 ? `${due} ${due === 1 ? 'measurement' : 'measurements'} due` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      aria-label="Overall health status"
      className="relative overflow-hidden rounded-lg border border-edge bg-surface p-5 pl-7"
    >
      <span className={`absolute inset-y-0 left-0 w-2 ${TONE[status].bg}`} aria-hidden="true" />
      <div className="flex items-center gap-3">
        <StatusIcon tone={status} size={40} />
        <div>
          <p className="text-4xl leading-tight font-semibold">{triage.headline}</p>
          <p className="text-sm text-ink-2">{count}</p>
        </div>
      </div>
      <p className="mt-3 text-ink">{triage.guidance}</p>
      {first && (
        <div className="mt-3 rounded-md bg-raised p-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Do this first</p>
          <p className="mt-1 text-sm text-ink">{first.action}</p>
        </div>
      )}
    </section>
  )
}
