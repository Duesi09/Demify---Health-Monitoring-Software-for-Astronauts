import type { Evaluation, MetricId } from '@/domain/types'
import { StatusIcon, TONE } from './status'
import { TILES, tileFor } from './tiles'

interface Props {
  evaluation: Evaluation
  onSelectMetric: (metric: MetricId) => void
}

const chip =
  'rounded-full bg-raised px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-axis hover:text-ink'

export function FindingsList({ evaluation, onSelectMetric }: Props) {
  const { findings, reminders } = evaluation
  // Systolic and diastolic are measured together, so remind once per tile.
  const dueTiles = TILES.filter((t) => t.metrics.some((m) => reminders.some((r) => r.metric === m)))

  return (
    <section aria-label="Findings" className="card rise p-6" style={{ '--i': 4 } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight">Findings</h2>

      {findings.length === 0 && dueTiles.length === 0 && (
        <div className="swap-in mt-5 flex items-start gap-3">
          <span className="mt-0.5">
            <StatusIcon tone="nominal" size={22} />
          </span>
          <div>
            <p className="font-medium text-ink">Nothing needs your attention</p>
            <p className="mt-1 text-sm text-ink-2">
              Every indicator is in its normal range and close to your own baseline. Keep logging your daily
              measurements.
            </p>
          </div>
        </div>
      )}

      <ol className="mt-2 divide-y divide-grid">
        {findings.map((f, i) => (
          <li key={f.id} className="swap-in flex items-start gap-3 py-4" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="mt-0.5">
              <StatusIcon tone={f.status} size={22} />
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
                  <button key={tile.id} type="button" onClick={() => onSelectMetric(tile.metrics[0])} className={chip}>
                    {tile.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}

        {dueTiles.length > 0 && (
          <li className="swap-in flex items-start gap-3 py-4">
            <span className="mt-0.5">
              <StatusIcon tone="stale" size={22} />
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
                      <button type="button" onClick={() => onSelectMetric(tile.metrics[0])} className={chip}>
                        Log now
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </li>
        )}
      </ol>
    </section>
  )
}
