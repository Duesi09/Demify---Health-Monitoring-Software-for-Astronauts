'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { completedDays, nextDueStep, planRoutine, streakOf, summariseRoutine } from '@/domain/checkin'
import { evaluateIndexed, indexReadings } from '@/domain/engine'
import { MISSION_DAYS } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { TILES } from '../tiles'
import { useAddress } from '../useAddress'
import { MeasureForm } from './MeasureForm'
import { ReactionTest } from './ReactionTest'
import { RoutineEnd } from './RoutineEnd'
import { RoutineSummary } from './RoutineSummary'
import { MeaningLines, REACTION_STEP, latestSource, quietButton, stepValue } from './shared'
import { StepFrame } from './StepFrame'
import { StepList } from './StepList'
import { StreakCard } from './StreakCard'

interface Props {
  initialReadings: Reading[]
  day: number
  /** The step named in the address, so a reload or a link opens the same step. */
  initialStep: string | null
}

const NO_SKIPS: ReadonlySet<string> = new Set()

/** The daily check-in for one mission day: what is due, one step at a time, and the streak. */
export function CheckIn({ initialReadings, day, initialStep }: Props) {
  const [readings, setReadings] = useState(initialReadings)
  const index = useMemo(() => indexReadings(readings), [readings])
  const evaluation = useMemo(() => evaluateIndexed(index, day), [index, day])
  const complete = useMemo(() => completedDays(index, day), [index, day])
  const streak = useMemo(() => streakOf(complete), [complete])
  const manualKeys = useMemo(
    () => new Set(readings.filter((r) => r.source === 'manual').map((r) => `${r.day}:${r.metric}`)),
    [readings],
  )
  // Readings a device sent through the HTTP API, so they are not named as entered by the crew member.
  const deviceKeys = useMemo(
    () => new Set(readings.filter((r) => r.source === 'device').map((r) => `${r.day}:${r.metric}`)),
    [readings],
  )

  // The order is set when the page opens and then kept, so a step does not
  // jump to another place in the list the moment it is saved.
  const [order] = useState(() => planRoutine(TILES, evaluation).map((s) => s.id))
  const steps = useMemo(() => {
    const current = planRoutine(TILES, evaluation)
    return order.map((id) => current.find((s) => s.id === id)!)
  }, [order, evaluation])
  const summary = summariseRoutine(steps)

  const [skipped, setSkipped] = useState(NO_SKIPS)
  const [activeId, setActiveId] = useState<string | null>(() =>
    order.includes(initialStep ?? '') ? initialStep : nextDueStep(steps, null, NO_SKIPS),
  )
  /** The step saved last, to say at once what its reading means. */
  const [savedId, setSavedId] = useState<string | null>(null)
  const active = steps.find((s) => s.id === activeId) ?? null
  const saved = steps.find((s) => s.id === savedId) ?? null

  // What the main button opens: the next due step that was not skipped, else a skipped one.
  const nextId = nextDueStep(steps, null, skipped) ?? nextDueStep(steps, null, NO_SKIPS)
  const next = steps.find((s) => s.id === nextId) ?? null
  const begun = savedId !== null || skipped.size > 0 || steps.some((s) => s.metrics.some((m) => manualKeys.has(`${day}:${m}`)))

  // Keep the step in the address bar so a reload opens the same step.
  useAddress(`?day=${day}${activeId ? `&step=${activeId}` : ''}`)

  // After the crew member moves to another step, take focus and view there.
  // Not on the first render: the page must open at its top.
  const panel = useRef<HTMLDivElement>(null)
  const [move, setMove] = useState<{ count: number; to: 'heading' | 'field' } | null>(null)
  useEffect(() => {
    const el = panel.current
    if (!move || !el) return
    const field = move.to === 'field' ? el.querySelector<HTMLElement>('input[type="number"]') : null
    const target = field ?? el.querySelector<HTMLElement>('[data-panel-heading]')
    target?.focus({ preventScroll: true })
    const { top } = el.getBoundingClientRect()
    if (top < 0 || top > window.innerHeight * 0.5) {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
    }
  }, [move])

  function open(id: string | null, to: 'heading' | 'field' = 'heading') {
    setActiveId(id)
    setMove((m) => ({ count: (m?.count ?? 0) + 1, to }))
  }

  function addReadings(added: Reading[]) {
    setReadings((current) => [
      ...current.filter(
        (r) => !(r.source === 'manual' && added.some((a) => a.day === r.day && a.metric === r.metric)),
      ),
      ...added,
    ])
  }

  function saveStep(id: string, added: Reading[]) {
    addReadings(added)
    setSavedId(id)
    open(nextDueStep(steps, id, skipped))
  }

  function leaveStep(id: string) {
    // Only a step that is still owed can be skipped; one that is done is simply left.
    const owed = steps.find((s) => s.id === id)?.state === 'due'
    const now = owed ? new Set([...skipped, id]) : skipped
    setSkipped(now)
    open(nextDueStep(steps, id, now))
  }

  const position = active ? steps.indexOf(active) + 1 : 0
  const dayLink = 'rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis'

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-5xl font-semibold tracking-tight">Check-in</h1>
          <p className="text-ink-2">
            Mission day {day} of {MISSION_DAYS} | simulated mission data
          </p>
        </div>
        <nav aria-label="Mission day" className="flex flex-wrap gap-2">
          {day > 1 && (
            <Link href={`/checkin?day=${day - 1}`} className={dayLink}>
              Previous day
            </Link>
          )}
          {day < MISSION_DAYS && (
            <Link href={`/checkin?day=${day + 1}`} className={dayLink}>
              Next day
            </Link>
          )}
        </nav>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <RoutineSummary
          day={day}
          steps={steps}
          summary={summary}
          next={next}
          begun={begun}
          onStart={() => open(nextId, 'field')}
          onReactionTest={() => open(REACTION_STEP)}
        />
        <StreakCard day={day} complete={complete} streak={streak} due={summary.due} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @4xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] @4xl:items-start">
        <StepList steps={steps} activeId={activeId} evaluation={evaluation} manualKeys={manualKeys} deviceKeys={deviceKeys} onSelect={(id) => open(id)} />

        <div ref={panel} className="min-w-0 scroll-mt-4">
          {/* Always in the page, so a screen reader announces what was saved when it arrives. */}
          <div role="status">
            {saved && saved.id !== activeId && (
              <div key={`${saved.id}:${stepValue(saved, evaluation)}`} className="card swap-in mb-5 p-5">
                <p className="font-semibold text-ink">
                  Saved for mission day {day}: {saved.label} {stepValue(saved, evaluation)}
                </p>
                <div className="mt-3">
                  <MeaningLines metrics={saved.metrics} evaluation={evaluation} />
                </div>
              </div>
            )}
          </div>

          {active === null ? (
            <RoutineEnd day={day} steps={steps} onOpen={(id) => open(id, 'field')} onReactionTest={() => open(REACTION_STEP)} />
          ) : active.id === REACTION_STEP ? (
            <StepFrame
              key={active.id}
              step={active}
              position={position}
              total={steps.length}
              evaluation={evaluation}
              manualKeys={manualKeys}
              deviceKeys={deviceKeys}
              howTo={
                <p className="mt-1 text-ink-2">
                  Run the Reaction Self-Test below. Take it at about the same time each day and always on the same
                  device.
                </p>
              }
            >
              <ReactionTest
                day={day}
                evaluation={evaluation}
                latestSource={latestSource(active, evaluation, manualKeys, deviceKeys)}
                onSaved={(added) => {
                  addReadings(added)
                  setSavedId(active.id)
                }}
                onContinue={() => open(nextDueStep(steps, active.id, skipped))}
              />
              <div>
                <button type="button" onClick={() => leaveStep(active.id)} className={quietButton}>
                  {active.state === 'due' ? 'Skip for now' : 'Leave this step'}
                </button>
              </div>
            </StepFrame>
          ) : (
            <StepFrame
              key={active.id}
              step={active}
              position={position}
              total={steps.length}
              evaluation={evaluation}
              manualKeys={manualKeys}
              deviceKeys={deviceKeys}
            >
              <MeasureForm
                step={active}
                day={day}
                onSaved={(added) => saveStep(active.id, added)}
                onSkip={() => leaveStep(active.id)}
              />
            </StepFrame>
          )}
        </div>
      </div>
    </>
  )
}
