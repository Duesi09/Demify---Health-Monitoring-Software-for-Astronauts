import { groupStatus } from '@/domain/bodyRegions'
import { HAZARDS, HAZARD_IDS } from '@/domain/hazards'
import { metricsForHazard } from '@/domain/metrics'
import type { Evaluation } from '@/domain/types'
import { StatusBadge, TONE } from './status'

const RADIUS = 24
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * NASA's five hazards of human spaceflight, each with a ring showing how many
 * of its indicators are nominal right now.
 */
export function HazardRow({ evaluation }: { evaluation: Evaluation }) {
  return (
    <section aria-label="Five hazards of human spaceflight" className="card rise @container p-6" style={{ '--i': 5 } as React.CSSProperties}>
      <h2 className="text-xl font-semibold tracking-tight">Five hazards of human spaceflight</h2>
      <p className="mt-1 text-sm text-ink-2">
        How your indicators stand against each hazard NASA has identified.
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-x-5 gap-y-5 @2xl:grid-cols-5">
        {HAZARD_IDS.map((id) => {
          const metrics = metricsForHazard(id)
          const tone = groupStatus(metrics, evaluation)
          const nominal = metrics.filter((m) => {
            const a = evaluation.assessments[m]
            return !a.stale && a.status === 'nominal'
          }).length
          const share = metrics.length === 0 ? 0 : nominal / metrics.length
          return (
            <li key={id} className="flex items-center gap-4 @2xl:flex-col @2xl:items-start @2xl:gap-3">
              <svg viewBox="0 0 60 60" className="size-15 shrink-0" aria-hidden="true">
                <circle
                  cx="30"
                  cy="30"
                  r={RADIUS}
                  fill="none"
                  className="stroke-axis"
                  strokeWidth="5"
                  strokeDasharray={metrics.length === 0 ? '3 5' : undefined}
                />
                {share > 0 && (
                  <circle
                    cx="30"
                    cy="30"
                    r={RADIUS}
                    fill="none"
                    stroke={TONE[tone].color}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                    transform="rotate(-90 30 30)"
                    className="glide transition-[stroke-dasharray,stroke] duration-700 ease-(--ease-soft)"
                  />
                )}
                <text x="30" y="35" textAnchor="middle" className="fill-ink text-[14px] font-semibold">
                  {metrics.length === 0 ? '--' : `${nominal}/${metrics.length}`}
                </text>
              </svg>
              <div className="min-w-0">
                <a
                  href={HAZARDS[id].url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink underline decoration-axis underline-offset-4 hover:decoration-ink"
                >
                  {HAZARDS[id].label}
                </a>
                <p className="mt-1">
                  <StatusBadge tone={tone} />
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {metrics.length === 0 ? 'No indicator yet' : `${nominal} of ${metrics.length} indicators nominal`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
