import Link from 'next/link'
import { earliestAnswerS } from '@/domain/consult'
import { DEFAULT_PROFILE, formatDuration, linkState } from '@/domain/missionContext'
import { CAREER_LIMIT_MSV, doseLog, limitShare, totalDose } from '@/domain/radiation'
import type { Evaluation, MetricId } from '@/domain/types'
import { StatusIcon } from './status'

interface Props {
  day: number
  evaluation: Evaluation
  index: Record<MetricId, Map<number, number>>
  /** The check-in card; it needs data the dashboard already holds, so the dashboard builds it. */
  children?: React.ReactNode
}

const card =
  'card group flex min-h-40 flex-col p-5 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2'

/** The arrow that marks a card as a way into another section. */
export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** One way into another section: what that section knows about today, in one number. */
export function SectionCard({
  href,
  eyebrow,
  headline,
  detail,
  action,
  children,
}: {
  href: string
  eyebrow: string
  headline: React.ReactNode
  detail: React.ReactNode
  action: string
  children?: React.ReactNode
}) {
  return (
    // The address changes with the mission day, many times a second in the time-lapse; do not fetch each one ahead.
    <Link href={href} prefetch={false} className={card}>
      <p className="eyebrow">{eyebrow}</p>
      <p className="mt-2 text-2xl leading-tight font-semibold tracking-tight text-ink">{headline}</p>
      <p className="mt-1 text-sm text-ink-2">{detail}</p>
      {children}
      <p className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-ink">
        {action}
        <Arrow />
      </p>
    </Link>
  )
}

/**
 * The other sections, each summed up in one number for today, so the
 * dashboard shows that they exist and what they would say.
 */
export function SectionCards({ day, evaluation, index, children }: Props) {
  // The simulated mission is a Mars transit, so the dashboard quotes that link.
  const link = linkState(DEFAULT_PROFILE, day)
  const urgent = evaluation.status === 'critical' || evaluation.status === 'act'

  const log = doseLog(index.radiationDose, day)
  const dose = totalDose(log)
  const share = limitShare(dose)
  const radiation = evaluation.assessments.radiationDose
  const storm = !radiation.stale && (radiation.status === 'act' || radiation.status === 'critical')

  return (
    <section aria-label="Other sections" className="grid grid-cols-1 gap-5 @2xl:grid-cols-3">
      {children}

      <SectionCard
        // The numbers on this card are for the Mars transit, so the link opens that place.
        href={`/link?day=${day}&profile=${DEFAULT_PROFILE}`}
        eyebrow="Earth link"
        headline={`Earth is ${formatDuration(link.oneWayS)} away`}
        detail={`An answer from the flight surgeon needs at least ${formatDuration(earliestAnswerS(link))}.`}
        action={urgent ? 'Consult the flight surgeon' : 'See what Earth knows'}
      />

      <SectionCard
        href={`/radiation?day=${day}`}
        eyebrow="Radiation"
        headline={
          storm ? (
            <span className="flex items-center gap-2">
              <StatusIcon tone={radiation.status} size={22} />
              Solar particle event
            </span>
          ) : (
            `${dose.toFixed(1)} mSv so far`
          )
        }
        detail={
          storm
            ? `Take shelter. Mission dose so far ${dose.toFixed(1)} mSv.`
            : `${Math.round(share * 100)}% of the career limit of ${CAREER_LIMIT_MSV} mSv.`
        }
        action={storm ? 'Open the shelter procedure' : 'Open the mission dose'}
      >
        <span
          className="mt-3 block h-1.5 overflow-hidden rounded-full bg-grid"
          role="img"
          aria-label={`${Math.round(share * 100)} percent of the career limit`}
        >
          <span className="glide block h-full rounded-full bg-ink-2 transition-[width] duration-500" style={{ width: `${Math.min(100, share * 100)}%` }} />
        </span>
      </SectionCard>
    </section>
  )
}
