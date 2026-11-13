'use client'

import { useRef } from 'react'
import { MISSION_DAYS } from '@/domain/simulator'
import type { Status } from '@/domain/types'
import { TIMELAPSE_STEP_MS } from './motion'
import { StatusIcon, TONE } from './status'

interface Props {
  day: number
  /** Overall status of every mission day, starting with day 1. */
  statuses: Status[]
  playing: boolean
  onDayChange: (day: number) => void
  onTogglePlay: () => void
}

const TICKS = [1, 30, 60, 90, 120, 150, 180]
const button =
  'rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis disabled:opacity-40'

/**
 * The whole mission as one strip: each day is a cell in the colour of its
 * overall status, and the strip itself is the control that moves "today".
 * On a real mission the day comes from the clock; this exists to explore
 * and demo the simulated data.
 */
export function MissionTimeline({ day, statuses, playing, onDayChange, onTogglePlay }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const clamp = (d: number) => Math.min(MISSION_DAYS, Math.max(1, d))

  function dayAt(clientX: number): number {
    const rect = track.current!.getBoundingClientRect()
    return clamp(Math.ceil(((clientX - rect.left) / rect.width) * MISSION_DAYS))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -10,
      PageUp: 10,
      Home: -MISSION_DAYS,
      End: MISSION_DAYS,
    }
    if (e.key in step) {
      e.preventDefault()
      onDayChange(clamp(day + step[e.key]))
    }
  }

  return (
    <section aria-label="Mission timeline" className="card rise p-5 sm:p-6" style={{ '--i': 0 } as React.CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">Mission day {day}</span>
          <span className="text-ink-2">of {MISSION_DAYS} | simulated mission data</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ul className="flex gap-4 text-xs text-ink-2" aria-label="Legend">
            {(['watch', 'act', 'critical'] as const).map((tone) => (
              <li key={tone} className="flex items-center gap-1.5">
                <StatusIcon tone={tone} size={12} />
                {TONE[tone].label}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={day <= 1} onClick={() => onDayChange(day - 1)}>
              Previous day
            </button>
            <button type="button" className={button} disabled={day >= MISSION_DAYS} onClick={() => onDayChange(day + 1)}>
              Next day
            </button>
            <button
              type="button"
              className={`${button} ${playing ? '' : 'bg-action text-white hover:bg-action hover:brightness-110'}`}
              onClick={onTogglePlay}
              aria-pressed={playing}
            >
              {playing ? 'Pause' : 'Play time-lapse'}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Mission day"
        aria-valuemin={1}
        aria-valuemax={MISSION_DAYS}
        aria-valuenow={day}
        aria-valuetext={`Mission day ${day}, ${TONE[statuses[day - 1]].label}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onDayChange(dayAt(e.clientX))
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onDayChange(dayAt(e.clientX))
        }}
        onKeyDown={onKeyDown}
        className="relative mt-5 h-10 cursor-pointer touch-none rounded-md select-none"
      >
        <div className="absolute inset-x-0 top-1/2 flex h-3.5 -translate-y-1/2 gap-px">
          {statuses.map((status, i) => (
            <span
              key={i}
              className="flex-1 rounded-[2px] transition-opacity duration-200"
              style={{
                background: status === 'nominal' ? 'var(--color-axis)' : TONE[status].color,
                opacity: i < day ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_12px_rgb(255_255_255/0.6)]"
          style={{
            left: `${((day - 0.5) / MISSION_DAYS) * 100}%`,
            // While playing, the marker takes exactly one step to reach the next day, so it never pauses.
            transition: playing ? `left ${TIMELAPSE_STEP_MS}ms linear` : undefined,
          }}
        >
          <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-ink" />
        </div>
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted tabular-nums" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${((t - 0.5) / MISSION_DAYS) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
    </section>
  )
}
