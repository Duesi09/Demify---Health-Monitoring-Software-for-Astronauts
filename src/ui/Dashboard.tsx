'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { resetManualReadings } from '@/app/actions'
import { regionForMetric, type RegionId } from '@/domain/bodyRegions'
import { completedDays, planRoutine, streakOf, summariseRoutine } from '@/domain/checkin'
import { evaluateIndexed, indexReadings, missionStatuses } from '@/domain/engine'
import { MISSION_DAYS } from '@/domain/simulator'
import type { MetricId, Reading } from '@/domain/types'
import { AppNav } from './AppNav'
import { BodyMap } from './BodyMap'
import { EventNote } from './EventNote'
import { FindingsList } from './FindingsList'
import { HazardRow } from './HazardRow'
import { MetricDetail } from './MetricDetail'
import { MetricTile } from './MetricTile'
import { MissionTimeline } from './MissionTimeline'
import { PlaybackContext, TIMELAPSE_STEP_MS } from './motion'
import { ReadinessCard } from './ReadinessCard'
import { SectionCard, SectionCards } from './SectionCards'
import { TILES, tileFor } from './tiles'
import { TriageBanner } from './TriageBanner'
import { useAddress } from './useAddress'
import { VitalsMonitor } from './VitalsMonitor'

interface Props {
  initialReadings: Reading[]
  initialDay: number
}

export function Dashboard({ initialReadings, initialDay }: Props) {
  const [readings, setReadings] = useState(initialReadings)
  const [day, setDay] = useState(initialDay)
  const [playing, setPlaying] = useState(false)
  const [resetting, startReset] = useTransition()
  const detailRef = useRef<HTMLDivElement>(null)

  const index = useMemo(() => indexReadings(readings), [readings])
  const evaluation = useMemo(() => evaluateIndexed(index, day), [index, day])
  const statuses = useMemo(() => missionStatuses(index, MISSION_DAYS), [index])
  // Worked out once for the whole mission, so moving the day only slices it.
  const completeDays = useMemo(() => completedDays(index, MISSION_DAYS), [index])
  const streak = useMemo(() => streakOf(completeDays.slice(0, day)), [completeDays, day])
  const routine = useMemo(() => summariseRoutine(planRoutine(TILES, evaluation)), [evaluation])
  const manualKeys = useMemo(
    () => new Set(readings.filter((r) => r.source === 'manual').map((r) => `${r.day}:${r.metric}`)),
    [readings],
  )

  // Open on the indicator behind the most urgent finding.
  const [selectedId, setSelectedId] = useState(
    () => tileFor(evaluation.findings[0]?.metrics[0] ?? 'restingHr').id,
  )
  const selected = TILES.find((t) => t.id === selectedId) ?? TILES[0]
  // The body map opens on the body system behind the most urgent finding.
  const [regionId, setRegionId] = useState<RegionId | null>(() => {
    const metric = evaluation.findings[0]?.metrics[0]
    return metric ? regionForMetric(metric).id : null
  })

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setDay((d) => {
        if (d >= MISSION_DAYS) {
          setPlaying(false)
          return d
        }
        return d + 1
      })
    }, TIMELAPSE_STEP_MS)
    return () => clearInterval(timer)
  }, [playing])

  // Keep the day in the address bar so a reload or a shared link opens the same day.
  // Skipped during the time-lapse: browsers limit how often the URL may change.
  useAddress(`?day=${day}`, !playing)

  function selectMetric(metric: MetricId) {
    setSelectedId(tileFor(metric).id)
    // On narrower screens the detail panel sits below everything else; bring it into view.
    if (window.matchMedia('(max-width: 1279px)').matches) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function addReadings(added: Reading[]) {
    setReadings((current) => [
      ...current.filter(
        (r) => !(r.source === 'manual' && added.some((a) => a.day === r.day && a.metric === r.metric)),
      ),
      ...added,
    ])
  }

  function reset() {
    startReset(async () => {
      await resetManualReadings()
      setReadings((current) => current.filter((r) => r.source !== 'manual'))
    })
  }

  return (
    <PlaybackContext value={playing}>
    <div
      data-playing={playing || undefined}
      className="mx-auto flex w-full max-w-[2200px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
    >
      <AppNav current="today" day={day} />
      <h1 className="sr-only">Today: mission day {day}</h1>

      <MissionTimeline
        day={day}
        statuses={statuses}
        playing={playing}
        onDayChange={(d) => {
          setPlaying(false)
          setDay(d)
        }}
        onTogglePlay={() => {
          if (!playing && day >= MISSION_DAYS) setDay(1)
          setPlaying(!playing)
        }}
      />

      <EventNote day={day} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(0,31rem)]">
        <main className="@container flex min-w-0 flex-col gap-5">
          <div className="grid gap-5 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <TriageBanner evaluation={evaluation} />
            <VitalsMonitor evaluation={evaluation} onSelectMetric={selectMetric} />
          </div>
          <ReadinessCard evaluation={evaluation} onSelectMetric={selectMetric} />
          <SectionCards day={day} evaluation={evaluation} index={index}>
            <SectionCard
              href={`/checkin?day=${day}`}
              eyebrow="Check-in"
              headline={
                routine.due > 0
                  ? `${routine.due} ${routine.due === 1 ? 'measurement' : 'measurements'} due`
                  : `${routine.measuredToday} of ${routine.total} measured today`
              }
              detail={`Measurement streak: ${streak.current} ${streak.current === 1 ? 'day' : 'days'} in a row.`}
              action={routine.due > 0 ? 'Start the check-in' : 'Open the check-in and the reaction test'}
            />
          </SectionCards>
          <div className="grid gap-5 @4xl:grid-cols-2">
            <BodyMap
              evaluation={evaluation}
              selectedId={regionId}
              onSelectRegion={setRegionId}
              onSelectMetric={selectMetric}
            />
            <FindingsList evaluation={evaluation} onSelectMetric={selectMetric} />
          </div>
          <HazardRow evaluation={evaluation} />
          <section
            aria-label="Health indicators"
            className="grid grid-cols-1 gap-5 @lg:grid-cols-2 @3xl:grid-cols-3"
          >
            {TILES.map((tile, i) => (
              <MetricTile
                key={tile.id}
                tile={tile}
                evaluation={evaluation}
                index={index}
                selected={tile.id === selected.id}
                order={i}
                onSelect={() => selectMetric(tile.metrics[0])}
              />
            ))}
          </section>
        </main>

        <aside ref={detailRef} className="min-w-0 scroll-mt-4 xl:sticky xl:top-5">
          <MetricDetail
            key={selected.id}
            tile={selected}
            evaluation={evaluation}
            index={index}
            manualKeys={manualKeys}
            onLogged={addReadings}
          />
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted">
        <p>
          Prototype for the NASA Space Apps Challenge. Reference ranges are demo defaults and not medical advice.
        </p>
        {manualKeys.size > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="rounded-full bg-raised px-3 py-1.5 text-ink-2 transition-colors hover:bg-axis disabled:opacity-60"
          >
            Remove my {manualKeys.size} manual {manualKeys.size === 1 ? 'reading' : 'readings'}
          </button>
        )}
      </footer>
    </div>
    </PlaybackContext>
  )
}
