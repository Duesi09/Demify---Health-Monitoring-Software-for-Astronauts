import type { Evaluation, MetricId } from '@/domain/types'
import { StatusIcon, TONE } from './status'
import { TILES, tileFor } from './tiles'

interface Props {
  evaluation: Evaluation
  onSelectMetric: (metric: MetricId) => void
}

export function FindingsList({ evaluation, onSelectMetric }: Props) {
  const { findings, reminders } = evaluation
  // Systolic and diastolic are measured together, so remind once per tile.
  const dueTiles = TILES.filter((t) => t.metrics.some((m) => reminders.some((r) => r.metric === m)))
  if (findings.length === 0 && dueTiles.length === 0) return null

  return (
    <section aria-label="Findings" className="flex flex-col gap-3">
      {findings.map((f) => (
        <article key={f.id} className="rounded-lg border border-edge bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5">
              <StatusIcon tone={f.status} size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{TONE[f.status].label}</p>
              <h3 className="font-semibold text-ink">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{f.detail}</p>
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">What to do: </span>
                {f.action}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...new Set(f.metrics.map((m) => tileFor(m)))].map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => onSelectMetric(tile.metrics[0])}
                    className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-2 hover:bg-raised"
                  >
                    {tile.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>
      ))}

      {dueTiles.length > 0 && (
        <article className="rounded-lg border border-edge bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5">
              <StatusIcon tone="stale" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-ink">Measurements due</h3>
              <p className="mt-1 text-sm text-ink-2">
                These readings are too old to say anything about today. Measure and log them now.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {dueTiles.map((tile) => {
                  const days = evaluation.assessments[tile.metrics[0]].daysSinceReading
                  return (
                    <li key={tile.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-ink">
                        {tile.label}
                        <span className="text-muted">
                          {days === null ? ' · never measured' : ` · last measured ${days} days ago`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectMetric(tile.metrics[0])}
                        className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-2 hover:bg-raised"
                      >
                        Log now
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </article>
      )}
    </section>
  )
}
