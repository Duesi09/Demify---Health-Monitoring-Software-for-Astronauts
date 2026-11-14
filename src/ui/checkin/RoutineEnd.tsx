import Link from 'next/link'
import type { RoutineStep } from '@/domain/checkin'
import { StatusIcon } from '../status'
import { primaryButton, quietButton, quietFocus } from './shared'

interface Props {
  day: number
  steps: RoutineStep[]
  onOpen: (id: string) => void
  onReactionTest: () => void
}

const chip =
  'rounded-full bg-raised px-3 py-1.5 text-xs font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis'

/**
 * Shown when there is no step left to walk to: either everything due is done,
 * or what is left was skipped and is offered again.
 */
export function RoutineEnd({ day, steps, onOpen, onReactionTest }: Props) {
  const due = steps.filter((s) => s.state === 'due')
  const open = steps.filter((s) => s.state === 'open')
  const complete = due.length === 0

  return (
    <section aria-labelledby="end-heading" className="card swap-in flex flex-col gap-5 p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="mt-1">
          <StatusIcon tone={complete ? 'nominal' : 'stale'} size={36} />
        </span>
        <div>
          <h2 id="end-heading" tabIndex={-1} data-panel-heading style={quietFocus} className="rounded-md text-3xl font-semibold tracking-tight">
            {complete
              ? `Check-in complete for mission day ${day}`
              : `${due.length} ${due.length === 1 ? 'measurement is' : 'measurements are'} still due`}
          </h2>
          <p className="mt-2 text-ink-2">
            {complete
              ? 'Every indicator has a current reading, so the monitor can judge today. Your readings are saved on the on-board computer.'
              : 'You skipped these. Until they are measured, the monitor cannot judge them and today does not count for the streak.'}
          </p>
        </div>
      </div>

      {!complete && (
        <ul className="flex flex-col gap-2">
          {due.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink">
              {s.label}
              <button type="button" onClick={() => onOpen(s.id)} className={chip}>
                Measure now
              </button>
            </li>
          ))}
        </ul>
      )}

      {complete && open.length > 0 && (
        <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
          <h3 className="text-sm font-semibold text-ink">Not measured today, still current</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {open.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-ink">
                  {s.label}
                  <span className="text-ink-2">
                    {' | '}
                    {s.daysLeft === 0
                      ? 'due tomorrow'
                      : `current for ${s.daysLeft} more ${s.daysLeft === 1 ? 'day' : 'days'}`}
                  </span>
                </span>
                <button type="button" onClick={() => onOpen(s.id)} className={chip}>
                  Measure anyway
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/?day=${day}`} className={complete ? primaryButton : quietButton}>
          Back to Today
        </Link>
        <button type="button" onClick={onReactionTest} className={quietButton}>
          Reaction Self-Test
        </button>
      </div>
    </section>
  )
}
