'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  BUILD_TARGET_MS,
  CLOCK_SPEEDS,
  SHELTER_STAY_MS,
  elapsedMs,
  formatClock,
  formatDuration,
  isRunning,
  type Clock,
} from '@/domain/radiation'
import { StatusIcon } from '../status'
import { SourceLink, Tag, button, primaryButton } from './parts'

type ClockId = 'alarm' | 'shelter'

interface Props {
  alarm: Clock
  shelter: Clock
  speed: number
  /** Wall-clock time of the latest tick, in ms. */
  now: number
  onStart: (clock: ClockId) => void
  onPause: (clock: ClockId) => void
  onReset: (clock: ClockId) => void
  onSpeed: (speed: number) => void
}

interface PanelProps {
  title: string
  /** When to start the clock. */
  hint: React.ReactNode
  clock: Clock
  now: number
  /** The time the bar under the clock fills up to. */
  targetMs: number
  /** One line on where the clock stands against its target. */
  status: (elapsed: number, running: boolean) => { text: string; over?: boolean }
  onStart: () => void
  onPause: () => void
  onReset: () => void
}

function ClockPanel({ title, hint, clock, now, targetMs, status, onStart, onPause, onReset }: PanelProps) {
  const titleId = useId()
  const elapsed = elapsedMs(clock, now)
  const running = isRunning(clock)
  const untouched = !running && elapsed === 0
  const state = status(elapsed, running)
  const action = running ? 'Pause' : untouched ? 'Start' : 'Resume'
  // Resetting loses the time, so it asks once before it does.
  const [asking, setAsking] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const reset = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  // Where the focus goes after the question closes, so the keyboard never loses its place.
  const focusNext = useRef<'toggle' | 'reset' | 'confirm' | null>(null)
  useEffect(() => {
    const target = { toggle, reset, confirm }[focusNext.current ?? 'toggle']
    if (focusNext.current) target.current?.focus()
    focusNext.current = null
  })

  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
      <h4 id={titleId} className="font-semibold text-ink">
        {title}
      </h4>
      <p className="mt-0.5 text-sm text-ink-2">{hint}</p>
      {/* A timer is silent for screen readers unless asked; changes worth hearing are announced separately. */}
      {/* Pushed to the bottom, so the two clocks stand level whatever the length of their hints. */}
      <p
        role="timer"
        aria-live="off"
        aria-labelledby={titleId}
        className="mt-auto pt-3 text-5xl font-semibold tracking-tight tabular-nums"
      >
        {formatClock(elapsed)}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-series-1/20" aria-hidden="true">
        <div
          className={`h-full rounded-full ${state.over ? 'bg-warning' : 'bg-series-1'}`}
          style={{ width: `${Math.min(1, elapsed / targetMs) * 100}%` }}
        />
      </div>
      <p className="mt-2 flex min-h-10 items-start gap-2 text-sm text-ink-2">
        {state.over && (
          <span className="mt-0.5">
            <StatusIcon tone="watch" />
          </span>
        )}
        {state.text}
      </p>
      <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2">
        {asking ? (
          <>
            <span className="text-sm text-ink">Reset this clock to zero?</span>
            <button
              ref={confirm}
              type="button"
              className={button}
              onClick={() => {
                focusNext.current = 'toggle'
                setAsking(false)
                onReset()
              }}
            >
              Yes, reset
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                focusNext.current = 'reset'
                setAsking(false)
              }}
            >
              Keep the time
            </button>
          </>
        ) : (
          <>
            {/* The spoken name adds which clock; it starts with the word on the button. */}
            <button
              ref={toggle}
              type="button"
              aria-label={`${action}: ${title}`}
              className={running ? button : primaryButton}
              onClick={running ? onPause : onStart}
            >
              {action}
            </button>
            {!untouched && (
              <button
                ref={reset}
                type="button"
                aria-label={`Reset: ${title}`}
                className={button}
                onClick={() => {
                  focusNext.current = 'confirm'
                  setAsking(true)
                }}
              >
                Reset
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The two clocks of the procedure: time since the alarm against the one hour
 * build target, and time in the shelter. Nothing starts by itself.
 */
export function ShelterClocks({ alarm, shelter, speed, now, onStart, onPause, onReset, onSpeed }: Props) {
  const fast = speed !== 1
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">Clocks</h3>
        {fast && <Tag>Fast-forward on | demo only</Tag>}
      </div>
      <div className="mt-3 grid gap-3 @xl:grid-cols-2">
        <ClockPanel
          title="Time since the alarm"
          hint={
            <>
              Start it when the alarm sounds. Pause it when the shelter is built. Target: about 1 hour (
              <SourceLink source="orionShelter">NASA shelter evaluation</SourceLink>).
            </>
          }
          clock={alarm}
          now={now}
          targetMs={BUILD_TARGET_MS}
          status={(elapsed, running) => {
            if (elapsed >= BUILD_TARGET_MS) {
              return { over: true, text: `Past the 1 hour target by ${formatDuration(elapsed - BUILD_TARGET_MS)}.` }
            }
            if (elapsed === 0 && !running) return { text: 'Not started.' }
            const left = `${formatDuration(BUILD_TARGET_MS - elapsed + 59_999)} left to the 1 hour target.`
            return { text: running ? `Running. ${left}` : `Paused. ${left}` }
          }}
          onStart={() => onStart('alarm')}
          onPause={() => onPause('alarm')}
          onReset={() => onReset('alarm')}
        />
        <ClockPanel
          title="Time in the shelter"
          hint="Start it when the last crew member is inside. Be ready to stay up to 24 hours."
          clock={shelter}
          now={now}
          targetMs={SHELTER_STAY_MS}
          status={(elapsed, running) => {
            if (elapsed >= SHELTER_STAY_MS) {
              return { over: true, text: '24 hours reached. Check the dose rate and ask mission control for the all-clear.' }
            }
            if (elapsed === 0 && !running) return { text: 'Not started.' }
            return { text: running ? 'Running. Leave only when the dose rate is back to normal.' : 'Paused.' }
          }}
          onStart={() => onStart('shelter')}
          onPause={() => onPause('shelter')}
          onReset={() => onReset('shelter')}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm text-ink-2">
          Clock speed. Real time is for real use; fast-forward exists only to show the procedure in a demo.
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CLOCK_SPEEDS.map((option) => (
            <label
              key={option.speed}
              className="cursor-pointer rounded-full bg-raised px-4 py-2 text-sm font-medium text-ink-2 ring-1 ring-edge transition-colors hover:text-ink has-checked:bg-ink has-checked:text-page has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-series-1"
            >
              <input
                type="radio"
                name="clock-speed"
                className="sr-only"
                checked={speed === option.speed}
                onChange={() => onSpeed(option.speed)}
              />
              {option.speed === 1 ? option.label : `Fast-forward: ${option.label}`}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
