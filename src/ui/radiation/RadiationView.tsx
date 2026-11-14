'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { evaluateIndexed, indexReadings } from '@/domain/engine'
import { formatValue } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import {
  doseLog,
  eventOn,
  projectDose,
  setClockSpeed,
  solarEvents,
  totalDose,
  typicalDailyDose,
  type DoseEvent,
} from '@/domain/radiation'
import { MISSION_DAYS } from '@/domain/simulator'
import type { MetricAssessment, Reading } from '@/domain/types'
import { PageShell } from '../PageShell'
import { RangeBar } from '../RangeBar'
import { StatusBadge } from '../status'
import { SourcesAndLimits, WhyItMatters } from './Background'
import { Comparisons } from './Comparisons'
import { MissionDose } from './MissionDose'
import { SourceLink, Tag, button, primaryButton } from './parts'
import { ShelterProcedure } from './ShelterProcedure'
import { newRun, useShelterSession, type ProcedureRun } from './useShelterSession'
import { useAddress } from '../useAddress'

interface Props {
  readings: Reading[]
  initialDay: number
}

const clampDay = (day: number) => Math.min(MISSION_DAYS, Math.max(1, day))

/**
 * The page title and the control that moves the selected day. On a real
 * mission the day comes from the clock; the control exists to explore and
 * demo the simulated data.
 */
function DayBar({
  day,
  onDay,
  nextEvent,
}: {
  day: number
  onDay: (day: number) => void
  /** The first solar particle event of the simulated mission, offered as a shortcut. */
  nextEvent: DoseEvent | null
}) {
  return (
    <section aria-label="Mission day" className="card rise p-5 sm:p-6" style={{ '--i': 0 } as React.CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-5xl font-semibold tracking-tight">Radiation</h1>
          <p className="mt-1 text-ink-2">
            Mission day <span className="font-semibold text-ink tabular-nums">{day}</span> of {MISSION_DAYS} | simulated
            mission data
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={day <= 1} onClick={() => onDay(day - 1)}>
            Previous day
          </button>
          <button type="button" className={button} disabled={day >= MISSION_DAYS} onClick={() => onDay(day + 1)}>
            Next day
          </button>
          {nextEvent && eventOn([nextEvent], day) === null && (
            <button type="button" className={button} onClick={() => onDay(nextEvent.firstDay)}>
              Go to the solar particle event, day {nextEvent.firstDay}
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={MISSION_DAYS}
        step={1}
        value={day}
        onChange={(e) => onDay(Number(e.target.value))}
        aria-label="Mission day"
        aria-valuetext={`Mission day ${day}`}
        className="mt-5 block w-full cursor-pointer accent-series-1"
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums" aria-hidden="true">
        <span>Day 1</span>
        <span>Day {MISSION_DAYS}</span>
      </div>
    </section>
  )
}

/** Today's reading of the indicator: the dose rate, its range and what it asks for. */
function DoseRateToday({ assessment, day, manual }: { assessment: MetricAssessment; day: number; manual: boolean }) {
  const def = METRICS.radiationDose
  const { value, band, stale, latestDay } = assessment
  const tone = value === null ? 'unmonitored' : stale ? 'stale' : assessment.status
  return (
    <section aria-labelledby="dose-today" className="card rise p-6" style={{ '--i': 3 } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="dose-today" className="text-xl font-semibold tracking-tight">
          Dose rate today
        </h2>
        <StatusBadge tone={tone} label={tone === assessment.status ? band?.label : undefined} />
      </div>
      {value === null ? (
        <p className="mt-3 text-ink-2">No dose reading has been logged yet.</p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">{formatValue('radiationDose', value)}</span>
            <span className="text-ink-2">mSv per day</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {latestDay !== day
              ? `Latest reading, from mission day ${latestDay}.`
              : manual
                ? 'Reading for today, entered by hand.'
                : 'Simulated dosimeter reading for today.'}
          </p>
          <div className="mt-4">
            <RangeBar metric="radiationDose" value={stale ? null : value} detailed />
          </div>
          <p className="mt-1 text-xs text-muted">
            The bar is logarithmic. Its ranges are defaults of this project: normal below 3, raised from 3, take
            shelter from 10, severe from 50.
          </p>
          {band?.action && !stale && (
            <p className="mt-3 text-sm text-ink">
              <span className="font-semibold">What to do: </span>
              {band.action}
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-muted">
        Normal for deep space is about 1.8 mSv per day (<SourceLink source="zeitlin2013" />
        ). {def.howToMeasure}
      </p>
    </section>
  )
}

/** The way into the drill on a day without an event. */
function DrillInvite({ onStart, ref }: { onStart: () => void; ref: React.Ref<HTMLButtonElement> }) {
  return (
    <section aria-labelledby="drill" className="card rise p-6" style={{ '--i': 3 } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="drill" className="text-xl font-semibold tracking-tight">
          Practise the storm shelter drill
        </h2>
        <Tag>Drill</Tag>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        When a solar particle event starts, the crew has about an hour to build a shelter and get inside. Rehearse the
        steps now, so they are familiar when the alarm sounds. A drill is marked as a drill everywhere and is kept
        apart from a real event.
      </p>
      <button ref={ref} type="button" className={`${primaryButton} mt-4`} onClick={onStart}>
        Start the drill
      </button>
    </section>
  )
}

export function RadiationView({ readings, initialDay }: Props) {
  const [day, setDay] = useState(initialDay)
  const { session, ready, update } = useShelterSession()
  // Set when the crew member opens or closes the drill, to move the focus with it.
  const [moveFocus, setMoveFocus] = useState<'procedure' | 'invite' | null>(null)
  const invite = useRef<HTMLButtonElement>(null)

  const index = useMemo(() => indexReadings(readings), [readings])
  const series = index.radiationDose
  const log = useMemo(() => doseLog(series, day), [series, day])
  const events = useMemo(() => solarEvents(log), [log])
  const projection = useMemo(() => projectDose(log), [log])
  const typical = useMemo(() => typicalDailyDose(series, day), [series, day])
  const assessment = useMemo(() => evaluateIndexed(index, day).assessments.radiationDose, [index, day])
  // Readings the crew member entered under Today replace the simulated ones and are named as such.
  const manualDays = useMemo(
    () => new Set(readings.filter((r) => r.source === 'manual' && r.metric === 'radiationDose').map((r) => r.day)),
    [readings],
  )
  const manualSoFar = [...manualDays].filter((d) => d >= 1 && d <= day).length
  const origin =
    manualSoFar === 0 ? 'Simulated readings' : `Simulated readings | ${manualSoFar} entered by hand`
  const manualToday = assessment.latestDay !== null && manualDays.has(assessment.latestDay)
  // Only for the shortcut in the day control: where the simulated event lies.
  const firstEvent = useMemo(() => solarEvents(doseLog(series, MISSION_DAYS))[0] ?? null, [series])

  // Keep the day in the address bar so a reload or a shared link opens the same day.
  // Written once the day has settled: browsers limit how often the URL may change,
  // and dragging the day control changes it many times a second.
  useAddress(`?day=${day}`)

  useEffect(() => {
    if (moveFocus === 'invite') invite.current?.focus()
    // One request moves focus once. Left set, it would pull focus again whenever the panel remounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the request is cleared once the focus has moved
    if (moveFocus !== null) setMoveFocus(null)
  }, [moveFocus])

  // The indicator decides: act or critical on a current reading means take shelter.
  const sheltering = !assessment.stale && (assessment.status === 'act' || assessment.status === 'critical')
  const event = eventOn(events, day)
  // Both days of one event share one run, so day two continues where day one stopped.
  const runId = sheltering ? `event-${event?.firstDay ?? day}` : 'drill'
  const showProcedure = sheltering || session.drill
  const run = session.runs[runId] ?? newRun(session.speed)

  function changeRun(change: (run: ProcedureRun) => ProcedureRun) {
    update((s) => ({ ...s, runs: { ...s.runs, [runId]: change(s.runs[runId] ?? newRun(s.speed)) } }))
  }

  function changeSpeed(speed: number) {
    const now = Date.now()
    // Every clock changes speed together, each keeping the time it has counted.
    update((s) => ({
      ...s,
      speed,
      runs: Object.fromEntries(
        Object.entries(s.runs).map(([id, r]) => [
          id,
          { ...r, alarm: setClockSpeed(r.alarm, speed, now), shelter: setClockSpeed(r.shelter, speed, now) },
        ]),
      ),
    }))
  }

  return (
    <PageShell current="radiation" day={day}>
      <DayBar day={day} onDay={(d) => setDay(clampDay(d))} nextEvent={firstEvent} />

      {/* A real event is in the page the server sends, so the alarm does not wait for the stored session. */}
      {showProcedure && typical !== null && (
        <ShelterProcedure
          key={runId}
          mode={sheltering ? 'event' : 'drill'}
          day={day}
          assessment={assessment}
          event={event}
          typical={typical}
          manual={manualToday}
          run={run}
          restored={ready}
          speed={session.speed}
          factor={session.factor}
          onRun={changeRun}
          onSpeed={changeSpeed}
          onFactor={(factor) => update((s) => ({ ...s, factor }))}
          onEndDrill={() => {
            update((s) => ({ ...s, drill: false }))
            setMoveFocus('invite')
          }}
          focusOnOpen={!sheltering && moveFocus === 'procedure'}
        />
      )}

      <div className="grid gap-5 @5xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] @5xl:items-start">
        <div className="@container min-w-0">
          <MissionDose day={day} log={log} events={events} projection={projection} typical={typical} origin={origin} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <DoseRateToday assessment={assessment} day={day} manual={manualToday} />
          {!showProcedure && (
            <DrillInvite
              ref={invite}
              onStart={() => {
                update((s) => ({ ...s, drill: true }))
                setMoveFocus('procedure')
              }}
            />
          )}
          <Comparisons total={totalDose(log)} day={day} origin={origin} />
        </div>
      </div>

      <WhyItMatters />
      <SourcesAndLimits />
    </PageShell>
  )
}
