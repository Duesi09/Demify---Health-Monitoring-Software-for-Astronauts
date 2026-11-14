'use client'

import { useEffect, useRef, useState } from 'react'
import { METRICS } from '@/domain/metrics'
import {
  BUILD_TARGET_MS,
  DRILL_EXAMPLE_DOSE,
  SHELTER_STAY_MS,
  SHELTER_STEPS,
  elapsedMs,
  formatCount,
  formatDose,
  isRunning,
  newClock,
  pauseClock,
  startClock,
  type Clock,
  type DoseEvent,
} from '@/domain/radiation'
import type { MetricAssessment, ReadingSource } from '@/domain/types'
import { StatusIcon, TONE } from '../status'
import { SourceLink, Tag, button } from './parts'
import { ShelterClocks } from './ShelterClocks'
import { ShelterEstimate } from './ShelterEstimate'
import type { ProcedureRun } from './useShelterSession'

interface Props {
  /** A real event on the selected day, or a rehearsal. */
  mode: 'event' | 'drill'
  day: number
  /** The radiation indicator as the rule engine judges it today. */
  assessment: MetricAssessment
  /** The event the selected day belongs to; null in a drill. */
  event: DoseEvent | null
  /** The typical daily dose without an event. */
  typical: number
  /** Where today's reading came from: the simulation, a device, or entered by hand. */
  source: ReadingSource
  run: ProcedureRun
  /** True once ticks and clocks of an earlier visit have been read back. */
  restored: boolean
  speed: number
  factor: number
  onRun: (change: (run: ProcedureRun) => ProcedureRun) => void
  onSpeed: (speed: number) => void
  onFactor: (factor: number) => void
  onEndDrill: () => void
  /** Moves the keyboard focus to the heading when the panel opens on request. */
  focusOnOpen?: boolean
}

type ClockId = 'alarm' | 'shelter'

const HOUR = 3_600_000
/** Moments worth telling a screen reader about; the running seconds are not. */
const MILESTONES: Record<ClockId, { at: number; text: string }[]> = {
  alarm: [
    { at: BUILD_TARGET_MS / 2, text: '30 minutes since the alarm. 30 minutes left to the build target.' },
    { at: BUILD_TARGET_MS - 10 * 60_000, text: '10 minutes left to the 1 hour build target.' },
    { at: BUILD_TARGET_MS, text: 'The 1 hour build target is reached.' },
  ],
  shelter: [
    { at: 6 * HOUR, text: '6 hours in the shelter.' },
    { at: 12 * HOUR, text: '12 hours in the shelter.' },
    { at: 18 * HOUR, text: '18 hours in the shelter.' },
    { at: SHELTER_STAY_MS, text: '24 hours in the shelter. Check the dose rate and ask mission control for the all-clear.' },
  ],
}
const CLOCK_NAME: Record<ClockId, string> = { alarm: 'Alarm clock', shelter: 'Shelter clock' }

/** The wall-clock time, refreshed while a clock runs. 0 until the page has mounted. */
function useNow(active: boolean, intervalMs: number): [number, () => void] {
  const [now, setNow] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is read after mount, so server and client agree
    setNow(Date.now())
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])
  return [now, () => setNow(Date.now())]
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 m-auto size-4.5 opacity-0 peer-checked:opacity-100"
    >
      <path d="M3.5 8.4l3 3 6-6.4" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The storm shelter procedure: what to do in the first hour of a solar
 * particle event and while it lasts. The same panel serves a real event and
 * the drill; a drill says so in every part that could be mistaken for real.
 */
export function ShelterProcedure({
  mode,
  day,
  assessment,
  event,
  typical,
  source,
  run,
  restored,
  speed,
  factor,
  onRun,
  onSpeed,
  onFactor,
  onEndDrill,
  focusOnOpen = false,
}: Props) {
  const drill = mode === 'drill'
  const running = isRunning(run.alarm) || isRunning(run.shelter)
  const [now, tick] = useNow(running, speed === 1 ? 250 : 100)
  const [announcement, setAnnouncement] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  // A drill opens on request, so the keyboard and the screen reader are taken to it.
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus()
  }, [focusOnOpen])

  // Announce a milestone once, when a clock crosses it.
  const seen = useRef<Record<ClockId, number> | null>(null)
  useEffect(() => {
    // Clocks read back after a reload have passed their milestones already; those are not news.
    if (now === 0 || !restored) return
    const current = { alarm: elapsedMs(run.alarm, now), shelter: elapsedMs(run.shelter, now) }
    const before = seen.current
    seen.current = current
    // Nothing to compare with on the first tick, such as after a reload.
    if (!before) return
    for (const id of ['alarm', 'shelter'] as const) {
      const crossed = MILESTONES[id].filter((m) => before[id] < m.at && current[id] >= m.at).pop()
      if (crossed) setAnnouncement(crossed.text)
    }
  }, [now, restored, run.alarm, run.shelter])

  const status = assessment.status === 'critical' ? 'critical' : 'act'
  const dose = drill ? DRILL_EXAMPLE_DOSE : (assessment.value ?? 0)
  const done = SHELTER_STEPS.filter((s) => run.checked.includes(s.id)).length
  const eventDay = event ? day - event.firstDay + 1 : 1

  function setClock(id: ClockId, change: (clock: Clock, at: number) => Clock, said: string) {
    const at = Date.now()
    onRun((r) => ({ ...r, [id]: change(r[id], at) }))
    setAnnouncement(`${CLOCK_NAME[id]} ${said}.`)
    tick()
  }

  function toggleStep(id: string) {
    onRun((r) => ({
      ...r,
      checked: r.checked.includes(id) ? r.checked.filter((s) => s !== id) : [...r.checked, id],
    }))
  }

  return (
    <section
      aria-labelledby="shelter-procedure"
      className={`card swap-in @container p-6 sm:p-7 ${drill ? 'border-2 border-dashed border-ink-2' : ''}`}
      // A real event wears a frame in its status colour; the icon and the words say the same.
      style={drill ? undefined : { boxShadow: `inset 0 0 0 2px ${TONE[status].color}, 0 30px 60px -30px rgb(0 0 0 / 0.7)` }}
    >
      {drill && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-edge">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink">
            <span className="rounded-md bg-ink px-2 py-0.5 text-sm font-bold tracking-widest text-page">DRILL</span>
            This is a drill. No solar particle event is in progress.
          </p>
          <button type="button" className={button} onClick={onEndDrill}>
            End the drill
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        {!drill && (
          <span className="mt-1">
            <StatusIcon tone={status} size={52} />
          </span>
        )}
        <div className="min-w-0 flex-1 basis-80">
          <p className="eyebrow">
            {drill
              ? 'Rehearsal | example readings'
              : `${TONE[status].label} | ${assessment.band?.label ?? 'Solar particle event'}${
                  event && event.lastDay > event.firstDay ? ` | day ${eventDay} of the event` : ''
                }`}
          </p>
          <h2
            id="shelter-procedure"
            ref={heading}
            tabIndex={-1}
            className="mt-1 rounded-lg text-4xl leading-tight font-semibold tracking-tight @3xl:text-5xl"
          >
            {drill
              ? 'Drill: storm shelter procedure'
              : status === 'critical'
                ? 'Severe solar particle event. All crew to the storm shelter now.'
                : 'Solar particle event. Take shelter now.'}
          </h2>
          <p className="mt-3 max-w-3xl text-lg leading-snug text-ink">
            {drill
              ? 'Work through the steps as you would in a real event. Ticks and clocks of the drill are kept apart from those of a real event.'
              : (assessment.band?.action ?? METRICS.radiationDose.bands.find((b) => b.status === status)?.action)}
          </p>
        </div>
        <dl className="flex flex-wrap gap-3">
          <div className="rounded-2xl bg-white/[0.06] px-5 py-3 ring-1 ring-edge">
            <dt className="flex items-center gap-2 text-sm text-ink-2">
              {drill ? 'Example dose rate' : 'Dose rate today'}
              <Tag>{drill ? 'Drill example' : source === 'manual' ? 'Entered by hand' : source === 'device' ? 'From device' : 'Simulated'}</Tag>
            </dt>
            <dd className="mt-1">
              <span className="text-4xl font-semibold tracking-tight">{formatDose(dose)}</span>
              <span className="ml-1.5 text-ink-2">mSv per day</span>
              <span className="mt-0.5 block text-sm text-ink-2">
                About {formatCount(dose / typical)} times a typical day of {formatDose(typical)} mSv
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/*
        The clocks come first in the page order: starting the alarm clock is the first act.
        On a wide screen they sit beside the checklist, on a narrow one above it.
      */}
      <div className="mt-7 grid gap-x-8 gap-y-7 @5xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @5xl:grid-rows-[auto_1fr]">
        <div className="@container @5xl:col-start-1 @5xl:row-start-1">
          <ShelterClocks
            alarm={run.alarm}
            shelter={run.shelter}
            speed={speed}
            now={now}
            onStart={(id) => setClock(id, startClock, 'started')}
            onPause={(id) => setClock(id, pauseClock, 'paused')}
            onReset={(id) => setClock(id, () => newClock(speed), 'reset to zero')}
            onSpeed={(next) => {
              onSpeed(next)
              tick()
            }}
          />
        </div>

        <div className="@5xl:col-start-2 @5xl:row-span-2 @5xl:row-start-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-tight">Checklist{drill ? ' (drill)' : ''}</h3>
            <p className="text-sm text-ink-2 tabular-nums">
              {done} of {SHELTER_STEPS.length} steps done
            </p>
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {SHELTER_STEPS.map((step, i) => {
              const checked = run.checked.includes(step.id)
              const inputId = `step-${step.id}`
              return (
                <li
                  key={step.id}
                  className={`flex gap-4 rounded-2xl p-4 ring-1 ring-edge transition-colors ${checked ? 'bg-white/[0.02]' : 'bg-white/[0.06]'}`}
                >
                  <span className="relative mt-0.5 size-7 shrink-0">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStep(step.id)}
                      aria-describedby={`${inputId}-detail`}
                      className="peer size-7 cursor-pointer appearance-none rounded-lg bg-page ring-2 ring-muted transition-colors checked:bg-action checked:ring-action"
                    />
                    <Check />
                  </span>
                  <div className="min-w-0">
                    <label htmlFor={inputId} className="block cursor-pointer text-lg leading-snug font-semibold text-ink">
                      <span className="mr-2 text-ink-2 tabular-nums">{i + 1}.</span>
                      {step.title}
                      {checked && <span className="ml-2 text-sm font-normal text-ink-2">Done</span>}
                    </label>
                    <p id={`${inputId}-detail`} className="mt-1 text-ink-2">
                      {step.detail}
                    </p>
                    {step.source && (
                      <p className="mt-1.5 text-xs text-muted">
                        <SourceLink source={step.source}>{step.sourceNote}</SourceLink>
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs text-muted">
              A prototype checklist written for this demo, not a flight procedure. Your vehicle&apos;s own procedure
              comes first.
            </p>
            <button
              type="button"
              className={button}
              disabled={run.checked.length === 0}
              onClick={() => onRun((r) => ({ ...r, checked: [] }))}
            >
              Clear all ticks
            </button>
          </div>
        </div>

        <div className="@5xl:col-start-1 @5xl:row-start-2">
          <ShelterEstimate
            dailyDose={dose}
            example={drill}
            backgroundPerDay={typical}
            factor={factor}
            onFactor={onFactor}
            shelterMs={elapsedMs(run.shelter, now)}
          />
        </div>
      </div>
    </section>
  )
}
