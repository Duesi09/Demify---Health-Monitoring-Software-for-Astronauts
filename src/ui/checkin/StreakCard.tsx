import type { Streak } from '@/domain/checkin'

/** Days shown in the strip of recent days. */
const RECENT_DAYS = 14

interface Props {
  day: number
  /** Whether each mission day up to today was complete; entry 0 is mission day 1. */
  complete: boolean[]
  streak: Streak
  /** Measurements still due today. */
  due: number
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

function standing(streak: Streak, due: number): string {
  if (streak.todayComplete) {
    return streak.reachedMilestone === streak.current
      ? `Milestone reached: ${days(streak.current)} with nothing out of date.`
      : 'Today counts: nothing is out of date.'
  }
  const owed = `the ${due === 1 ? 'measurement that is' : `${due} measurements that are`} due`
  if (streak.current > 0) return `Today is still open. Take ${owed} to keep the streak.`
  if (streak.previous) {
    return `The last streak ended after ${days(streak.previous.length)}, on mission day ${streak.previous.endDay}. Take ${owed} to start a new one today.`
  }
  return `Take ${owed} to start a streak today.`
}

/**
 * The streak: days in a row on which no measurement was out of date. It
 * counts measuring and never the values, so a bad reading costs nothing.
 */
export function StreakCard({ day, complete, streak, due }: Props) {
  const { current, longest, nextMilestone } = streak
  const first = Math.max(1, day - RECENT_DAYS + 1)
  const recent = Array.from({ length: day - first + 1 }, (_, i) => ({ day: first + i, done: complete[first + i - 1] }))
  const missed = recent.filter((d) => !d.done && d.day !== day).map((d) => d.day)
  const stripLabel = [
    `Mission days ${first} to ${day}`,
    missed.length === 0 ? 'no day missed' : `missed: ${missed.map((d) => `day ${d}`).join(', ')}`,
    streak.todayComplete ? 'today complete' : 'today still open',
  ].join(' | ')

  return (
    <section aria-labelledby="streak-heading" className="card rise flex flex-col p-7" style={{ '--i': 1 } as React.CSSProperties}>
      <h2 id="streak-heading" className="eyebrow">
        Measurement streak
      </h2>
      <p className="mt-3 flex items-baseline gap-3">
        <span className="text-6xl leading-none font-semibold tracking-tight tabular-nums">{current}</span>
        <span className="text-xl text-ink-2">{current === 1 ? 'day' : 'days'} in a row</span>
      </p>
      <p className="mt-3 text-ink">{standing(streak, due)}</p>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="text-ink-2">Longest this mission</dt>
          <dd className="text-ink">
            <span className="text-lg font-semibold tabular-nums">{longest ? days(longest.length) : 'None yet'}</span>
            {longest && longest.length !== current && (
              <span className="block text-xs text-ink-2">ended on mission day {longest.endDay}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ink-2">Next milestone</dt>
          <dd className="text-ink">
            <span className="text-lg font-semibold tabular-nums">
              {nextMilestone === null ? 'All reached' : days(nextMilestone)}
            </span>
            {nextMilestone !== null && (
              <span className="block text-xs text-ink-2">{days(nextMilestone - current)} to go</span>
            )}
          </dd>
        </div>
      </dl>
      {nextMilestone !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-axis" aria-hidden="true">
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-700 ease-(--ease-soft) motion-reduce:transition-none"
            style={{ width: `${(current / nextMilestone) * 100}%` }}
          />
        </div>
      )}

      {/* A complete day is a filled mark, a missed day an empty ring with a bar: shape, not colour. */}
      <div className="mt-6" role="img" aria-label={stripLabel}>
        <div className="flex justify-between gap-1">
          {recent.map((d) => {
            const today = d.day === day
            return (
              <svg key={d.day} viewBox="0 0 16 16" className="size-5 min-w-0 shrink text-ink">
                {d.done ? (
                  <>
                    <circle cx="8" cy="8" r="7" fill="currentColor" />
                    <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : (
                  <>
                    <circle
                      cx="8"
                      cy="8"
                      r="6.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeDasharray={today ? '2.6 2.4' : undefined}
                      opacity="0.75"
                    />
                    {!today && <path d="M5 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />}
                  </>
                )}
              </svg>
            )
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
          <span>Day {first}</span>
          <span>Day {day}</span>
        </div>
      </div>

      <p className="mt-auto pt-5 text-xs text-ink-2">
        A day counts when no measurement was out of date. The streak is for measuring, never for the values.
      </p>
    </section>
  )
}
