'use client'

import {
  CAREER_LIMIT_MSV,
  equivalents,
  formatCount,
  formatDose,
  formatShare,
  type Equivalent,
} from '@/domain/radiation'
import { SourceLink } from './parts'

/** "about 3,073 chest X-rays": the mission dose counted in one everyday comparison. */
function equivalentText({ comparison, fewest, most }: Equivalent): string {
  const count = formatCount(most)
  switch (comparison.id) {
    case 'chestXray':
      return `about ${count} chest ${count === '1' ? 'X-ray' : 'X-rays'}`
    case 'background':
      return `about ${count} ${count === '1' ? 'year' : 'years'} of natural background radiation on Earth`
    case 'station':
      // Less than one stay reads better as a share of it.
      return most < 1
        ? `${formatShare(fewest)} to ${formatShare(most)} of one six-month stay on the station`
        : `about ${formatCount(fewest)} to ${count} six-month stays on the station`
  }
}

function doseText(low: number, high: number): string {
  return low === high ? String(low) : `${low} to ${high}`
}

/**
 * The mission dose among doses people know, smallest first. A number in mSv
 * means little to someone who is not a radiation specialist; its place on
 * this ladder does.
 */
export function Comparisons({ total, day, origin }: { total: number; day: number; origin: string }) {
  const rows = [
    ...equivalents(total).map((e) => ({ kind: 'comparison' as const, at: e.comparison.low, e })),
    { kind: 'mission' as const, at: total },
    { kind: 'limit' as const, at: CAREER_LIMIT_MSV },
  ].sort((a, b) => a.at - b.at)

  return (
    <section aria-labelledby="comparisons" className="card rise p-6" style={{ '--i': 4 } as React.CSSProperties}>
      <h2 id="comparisons" className="text-xl font-semibold tracking-tight">
        What this dose compares to
      </h2>
      <p className="mt-1 text-sm text-ink-2">Doses in mSv, from the smallest to the largest.</p>
      <ol className="mt-4 flex flex-col">
        {rows.map((row) => {
          if (row.kind === 'mission') {
            return (
              <li key="mission" className="-mx-3 my-1 rounded-xl bg-series-1/15 px-3 py-3 ring-1 ring-series-1/40">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-semibold text-ink">Your mission so far, day {day}</p>
                  <p className="text-lg font-semibold whitespace-nowrap text-ink tabular-nums">{formatDose(total)}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-2">{origin}</p>
              </li>
            )
          }
          if (row.kind === 'limit') {
            return (
              <li key="limit" className="border-t border-grid py-3 first:border-t-0">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-ink">NASA career limit</p>
                  <p className="whitespace-nowrap text-ink tabular-nums">{CAREER_LIMIT_MSV}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Source: <SourceLink source="careerLimit" />
                </p>
              </li>
            )
          }
          const { comparison } = row.e
          return (
            <li key={comparison.id} className="border-t border-grid py-3 first:border-t-0">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-ink">{comparison.label}</p>
                <p className="whitespace-nowrap text-ink tabular-nums">{doseText(comparison.low, comparison.high)}</p>
              </div>
              {total > 0 && <p className="mt-0.5 text-sm text-ink-2">Your mission dose equals {equivalentText(row.e)}.</p>}
              <p className="mt-0.5 text-xs text-muted">
                Source: <SourceLink source={comparison.source} />
              </p>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">
        The comparisons show orders of magnitude. The sources measure dose in different ways, so do not read them as
        exact.
      </p>
    </section>
  )
}
