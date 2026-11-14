'use client'

import { formatDay } from '@/domain/format'
import {
  CAREER_LIMIT_MSV,
  formatCount,
  formatDose,
  formatShare,
  limitShare,
  totalDose,
  type DoseDay,
  type DoseEvent,
  type Projection,
} from '@/domain/radiation'
import { MISSION_DAYS } from '@/domain/simulator'
import { AnimatedNumber } from '../AnimatedNumber'
import { StatusIcon } from '../status'
import { DoseChart } from './DoseChart'
import { SourceLink, Tag } from './parts'

interface Props {
  day: number
  /** One entry per mission day up to `day`; empty when nothing was measured yet. */
  log: DoseDay[]
  events: DoseEvent[]
  projection: Projection | null
  /** The typical daily dose so far, null when nothing was measured yet. */
  typical: number | null
  /** Where the readings come from, such as "Simulated readings". */
  origin: string
}

function eventDays(e: DoseEvent): string {
  return e.firstDay === e.lastDay ? `day ${e.firstDay}` : `days ${e.firstDay} to ${e.lastDay}`
}

/** A share of the bar's width, kept inside the bar. */
const width = (fraction: number) => `${Math.min(1, Math.max(0, fraction)) * 100}%`

/**
 * The share of the career limit as a bar. The filled part is the dose
 * received, the lighter part the projection to the end of the mission.
 */
function LimitBar({ total, projection }: { total: number; projection: Projection | null }) {
  const share = limitShare(total)
  const projected = projection && projection.daysLeft > 0 ? projection : null
  // A narrow fill has no room for the number; it then stands beside the fill.
  const inside = share >= 0.14
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold text-ink">Share of the career limit</h3>
        <p className="text-sm text-ink-2">
          Limit {CAREER_LIMIT_MSV} mSv | <SourceLink source="careerLimit">NASA-STD-3001</SourceLink>
        </p>
      </div>
      <div
        role="meter"
        aria-label="Mission dose as a share of the career limit"
        aria-valuemin={0}
        aria-valuemax={CAREER_LIMIT_MSV}
        aria-valuenow={Math.min(total, CAREER_LIMIT_MSV)}
        aria-valuetext={`${formatDose(total)} of ${CAREER_LIMIT_MSV} mSv, ${formatShare(share)}`}
        className="relative mt-2 flex h-9 items-center overflow-hidden rounded-full bg-series-1/15"
      >
        {projected && (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-series-1/25 transition-[width] duration-500 ease-(--ease-soft) motion-reduce:transition-none"
            style={{ width: width(projected.share) }}
          />
        )}
        <span
          className="relative flex h-full min-w-2.5 shrink-0 items-center justify-end rounded-full bg-action transition-[width] duration-500 ease-(--ease-soft) motion-reduce:transition-none"
          style={{ width: width(share) }}
        >
          {inside && <span className="px-3 text-sm font-semibold text-white tabular-nums">{formatShare(share)}</span>}
        </span>
        {!inside && <span className="relative px-2.5 text-sm font-semibold text-ink tabular-nums">{formatShare(share)}</span>}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-action" aria-hidden="true" />
          Received so far: {formatDose(total)} mSv
        </li>
        {projected && (
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-series-1/40" aria-hidden="true" />
            Projected for day {MISSION_DAYS}: {Math.round(projected.total)} mSv, {formatShare(projected.share)}
          </li>
        )}
      </ul>
      {share >= 1 && (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm text-ink">
          <span className="mt-0.5">
            <StatusIcon tone="critical" />
          </span>
          The mission dose is at or above the career limit. Report it to the flight surgeon.
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        The limit covers a whole career. Doses from earlier flights count toward it and are not included here.
      </p>
    </div>
  )
}

function Stat({ label, tag, value, children }: { label: string; tag?: string; value: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
      <dt className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
        {label}
        {tag && <Tag>{tag}</Tag>}
      </dt>
      <dd className="mt-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink">{value}</span>
        <span className="mt-1 block text-sm text-ink-2">{children}</span>
      </dd>
    </div>
  )
}

/** The running total: how much dose the mission has added up to, and where it is heading. */
export function MissionDose({ day, log, events, projection, typical, origin }: Props) {
  const total = totalDose(log)
  const share = limitShare(total)
  const estimated = log.filter((d) => d.estimated).length
  const eventDose = events.reduce((sum, e) => sum + e.dose, 0)

  if (log.length === 0 || typical === null) {
    return (
      <section aria-labelledby="mission-dose" className="card rise p-6 sm:p-7" style={{ '--i': 2 } as React.CSSProperties}>
        <h2 id="mission-dose" className="text-xl font-semibold tracking-tight">
          Mission dose
        </h2>
        <p className="mt-3 text-ink-2">
          No dose reading has been logged since launch, so there is no total to show. Read your dosimeter and log
          the daily dose under Today.
        </p>
      </section>
    )
  }

  const summary = [
    `From launch to mission day ${day} the running total rose to ${formatDose(total)} mSv, ${formatShare(share)} of the career limit of ${CAREER_LIMIT_MSV} mSv.`,
    `A typical day adds ${formatDose(typical)} mSv.`,
    ...events.map(
      (e) =>
        `The solar particle event on ${eventDays(e)} added ${formatDose(e.dose)} mSv${
          e.lastDay > e.firstDay ? `, most of it on day ${e.peakDay} with ${formatDose(e.peak)} mSv` : ''
        }.`,
    ),
    projection && projection.daysLeft > 0
      ? `At the recent rate the total would reach about ${Math.round(projection.total)} mSv on day ${MISSION_DAYS}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section aria-labelledby="mission-dose" className="card rise p-6 sm:p-7" style={{ '--i': 2 } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="mission-dose" className="text-xl font-semibold tracking-tight">
          Mission dose
        </h2>
        <Tag>{origin}</Tag>
      </div>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
        <span className="text-7xl leading-none font-semibold tracking-tight">
          <AnimatedNumber value={total} decimals={1} />
        </span>
        <span className="text-2xl text-ink-2">mSv</span>
      </p>
      <p className="mt-2 text-ink-2">
        Received from launch to mission day {day}. The dose adds up day by day and never goes back down.
      </p>
      <p className="mt-1 text-sm text-muted">
        {estimated === 0
          ? log.length === 1
            ? 'The day has a dosimeter reading.'
            : `All ${log.length} days have a dosimeter reading.`
          : `${estimated} of ${log.length} days have no reading. ${estimated === 1 ? 'It is' : 'Each is'} counted at the typical day so far, ${formatDose(typical)} mSv.`}
      </p>

      <LimitBar total={total} projection={projection} />

      <dl className="mt-6 grid gap-3 @2xl:grid-cols-3">
        <Stat label="Typical day" value={`${formatDose(typical)} mSv`}>
          The middle value of all days so far. Deep space measured about 1.8 mSv per day (
          <SourceLink source="zeitlin2013" />
          ).
        </Stat>
        {projection && projection.daysLeft > 0 ? (
          <Stat label={`Day ${MISSION_DAYS}, end of mission`} tag="Projection" value={`${Math.round(projection.total)} mSv`}>
            {formatShare(projection.share)} of the limit. {projection.daysLeft} more{' '}
            {projection.daysLeft === 1 ? 'day' : 'days'} at {formatDose(projection.ratePerDay)} mSv per day, the
            average of the last {projection.basisDays} quiet {projection.basisDays === 1 ? 'day' : 'days'}. Assumes no
            further solar particle event.
            {log[log.length - 1].event && ' An event is in progress: what it still adds is not included.'}
          </Stat>
        ) : (
          <Stat label={`Day ${MISSION_DAYS}, end of mission`} value={`${formatDose(total)} mSv`}>
            {projection
              ? 'This is the last mission day, so nothing is left to project.'
              : 'No quiet day measured yet, so there is nothing to project from.'}
          </Stat>
        )}
        {events.length > 0 ? (
          <Stat
            label={events.length === 1 ? 'Solar particle event' : `${events.length} solar particle events`}
            value={`+${formatDose(eventDose)} mSv`}
          >
            On {events.map(eventDays).join(' and ')}. As much as {formatCount(eventDose / typical)} typical days, and{' '}
            {formatShare(eventDose / total)} of the mission dose so far.
          </Stat>
        ) : (
          <Stat label="Solar particle events" value="None so far">
            A day counts as an event when its dose reaches 10 mSv. The storm shelter procedure then opens here.
          </Stat>
        )}
      </dl>

      <div className="mt-7">
        {/* The sentence below the charts says in words what they show. */}
        <div role="group" aria-label="Charts of the mission dose" aria-describedby="dose-summary">
          <DoseChart log={log} events={events} projection={projection} />
        </div>
        <p id="dose-summary" className="mt-3 text-sm text-ink-2">
          {summary}
        </p>
        <details className="mt-2 text-sm">
          <summary className="w-fit cursor-pointer rounded-md text-ink-2">Show doses as a table</summary>
          {/* Focusable, so the keyboard can scroll the long table. */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Dose of every mission day"
            className="mt-2 max-h-80 overflow-y-auto rounded-xl ring-1 ring-edge"
          >
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">
                Dose of every mission day from day {day} back to day 1, with the running total
              </caption>
              <thead className="sticky top-0 bg-raised text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Day
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Dose that day (mSv)
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Running total (mSv)
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Share of limit
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...log].reverse().map((d) => (
                  <tr key={d.day} className="border-t border-grid">
                    <th scope="row" className="px-3 py-1.5 font-normal text-ink-2">
                      {formatDay(d.day)}
                    </th>
                    <td className="px-3 py-1.5 text-ink">{formatDose(d.dose)}</td>
                    <td className="px-3 py-1.5 text-ink">{formatDose(d.cumulative)}</td>
                    <td className="px-3 py-1.5 text-ink-2">{formatShare(limitShare(d.cumulative))}</td>
                    <td className="px-3 py-1.5 text-ink-2">
                      {d.event ? 'Solar particle event' : d.estimated ? 'No reading, typical day counted' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  )
}
