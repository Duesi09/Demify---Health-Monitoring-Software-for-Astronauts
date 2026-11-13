'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { resetManualReadings } from '@/app/actions'
import { evaluate, indexReadings } from '@/domain/engine'
import { MISSION_DAYS } from '@/domain/simulator'
import type { MetricId, Reading } from '@/domain/types'
import { DayControls } from './DayControls'
import { FindingsList } from './FindingsList'
import { MetricDetail } from './MetricDetail'
import { MetricTile } from './MetricTile'
import { TILES, tileFor } from './tiles'
import { TriageBanner } from './TriageBanner'

/** Milliseconds per mission day while the time-lapse plays. */
const TIMELAPSE_STEP_MS = 160

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
  const evaluation = useMemo(() => evaluate(readings, day), [readings, day])
  const manualKeys = useMemo(
    () => new Set(readings.filter((r) => r.source === 'manual').map((r) => `${r.day}:${r.metric}`)),
    [readings],
  )

  // Open on the indicator behind the most urgent finding.
  const [selectedId, setSelectedId] = useState(
    () => tileFor(evaluation.findings[0]?.metrics[0] ?? 'restingHr').id,
  )
  const selected = TILES.find((t) => t.id === selectedId) ?? TILES[0]

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
  useEffect(() => {
    if (!playing) window.history.replaceState(null, '', `?day=${day}`)
  }, [day, playing])

  function selectMetric(metric: MetricId) {
    setSelectedId(tileFor(metric).id)
    // On narrow screens the detail panel sits below the tiles; bring it into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
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
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          Demify <span className="text-base font-normal text-ink-2">Crew health monitor</span>
        </h1>
        <p className="text-sm text-muted">Flight Engineer A. Morgan · simulated crew member</p>
      </header>

      <DayControls
        day={day}
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <main className="flex min-w-0 flex-col gap-4">
          <TriageBanner evaluation={evaluation} />
          <FindingsList evaluation={evaluation} onSelectMetric={selectMetric} />
          <section aria-label="Health indicators" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TILES.map((tile) => (
              <MetricTile
                key={tile.id}
                tile={tile}
                evaluation={evaluation}
                index={index}
                selected={tile.id === selected.id}
                onSelect={() => selectMetric(tile.metrics[0])}
              />
            ))}
          </section>
        </main>

        <aside ref={detailRef} className="min-w-0 scroll-mt-4 lg:sticky lg:top-4">
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

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-grid pt-4 text-xs text-muted">
        <p>
          Prototype for the NASA Space Apps Challenge. Reference ranges are demo defaults and not medical advice.
        </p>
        {manualKeys.size > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="rounded-md border border-edge px-2.5 py-1 text-ink-2 hover:bg-raised disabled:opacity-60"
          >
            Remove my {manualKeys.size} manual {manualKeys.size === 1 ? 'reading' : 'readings'}
          </button>
        )}
      </footer>
    </div>
  )
}
