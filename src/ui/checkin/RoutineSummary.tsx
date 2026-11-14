import Link from 'next/link'
import { describeAge, type RoutineStep, type RoutineSummary as Summary } from '@/domain/checkin'
import { StatusIcon } from '../status'
import { primaryButton, quietButton } from './shared'

interface Props {
  day: number
  steps: RoutineStep[]
  summary: Summary
  /** The step the main button opens; null when nothing is due. */
  next: RoutineStep | null
  /** True once the crew member has entered something today. */
  begun: boolean
  onStart: () => void
  onReactionTest: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The state of today's routine at a glance, and the one button that moves it forward. */
export function RoutineSummary({ day, steps, summary, next, begun, onStart, onReactionTest }: Props) {
  const complete = summary.due === 0
  const dueLabels = steps.filter((s) => s.state === 'due').map((s) => s.label)

  return (
    <section aria-labelledby="routine-heading" className="card rise flex flex-col p-7" style={{ '--i': 0 } as React.CSSProperties}>
      <p className="eyebrow">Today&apos;s routine</p>
      <div className="mt-3 flex items-center gap-4">
        <StatusIcon tone={complete ? 'nominal' : 'stale'} size={44} />
        <h2 id="routine-heading" className="text-4xl leading-none font-semibold tracking-tight sm:text-5xl">
          {complete ? 'Nothing is due' : `${plural(summary.due, 'measurement', 'measurements')} due`}
        </h2>
      </div>
      <p className="mt-4 text-lg leading-snug text-ink">
        {summary.measuredToday} of {summary.total} indicators have a reading from today.
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {complete
          ? 'Every indicator has a current reading, so the monitor can judge today.'
          : `Out of date: ${dueLabels.join(', ')}. A reading that is too old says nothing about today.`}
      </p>

      {/* One segment per step, in the order of the steps. The counts beside it carry the same facts in words. */}
      <div className="mt-5 flex gap-1" aria-hidden="true">
        {steps.map((s) => (
          <span
            key={s.id}
            className={`h-2 flex-1 rounded-full ${
              s.state === 'done' ? 'bg-ink' : s.state === 'due' ? 'bg-transparent ring-1 ring-ink-2 ring-inset' : 'bg-axis'
            }`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        <li className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-full bg-ink" aria-hidden="true" />
          {summary.measuredToday} measured today
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-full ring-1 ring-ink-2 ring-inset" aria-hidden="true" />
          {summary.due} due
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-4 rounded-full bg-axis" aria-hidden="true" />
          {summary.open} still current, no reading today
        </li>
      </ul>

      <div className="mt-auto pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-edge">
          <div className="min-w-0">
            <p className="eyebrow">Next step</p>
            <p className="mt-1.5 text-ink">
              {next ? (
                <>
                  {next.label}
                  <span className="text-ink-2">
                    {' | '}
                    {next.daysSinceReading === null ? 'never measured' : `last measured ${describeAge(next.daysSinceReading)}`}
                  </span>
                </>
              ) : (
                'Nothing left for today. The Reaction Self-Test can be run at any time.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {next ? (
              <button type="button" onClick={onStart} className={primaryButton}>
                {begun ? 'Continue check-in' : 'Start check-in'}
              </button>
            ) : (
              <Link href={`/?day=${day}`} className={primaryButton}>
                Back to Today
              </Link>
            )}
            <button type="button" onClick={onReactionTest} className={quietButton}>
              Reaction Self-Test
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
