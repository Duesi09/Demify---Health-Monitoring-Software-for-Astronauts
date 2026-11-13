'use client'

import { MISSION_DAYS } from '@/domain/simulator'

interface Props {
  day: number
  playing: boolean
  onDayChange: (day: number) => void
  onTogglePlay: () => void
}

const button = 'rounded-md border border-edge px-3 py-1.5 text-sm text-ink hover:bg-raised disabled:opacity-40'

/**
 * Moves "today" through the simulated mission. On a real mission the day
 * comes from the clock; this control exists to explore and demo the data.
 */
export function DayControls({ day, playing, onDayChange, onTogglePlay }: Props) {
  return (
    <section aria-label="Mission timeline" className="rounded-lg border border-edge bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="text-lg font-semibold">Mission day {day}</span>
          <span className="text-sm text-muted"> of {MISSION_DAYS} · simulated mission data</span>
        </p>
        <div className="flex gap-2">
          <button type="button" className={button} disabled={day <= 1} onClick={() => onDayChange(day - 1)}>
            Previous day
          </button>
          <button type="button" className={button} disabled={day >= MISSION_DAYS} onClick={() => onDayChange(day + 1)}>
            Next day
          </button>
          <button type="button" className={button} onClick={onTogglePlay} aria-pressed={playing}>
            {playing ? 'Pause' : 'Play time-lapse'}
          </button>
        </div>
      </div>
      <input
        type="range"
        min={1}
        max={MISSION_DAYS}
        value={day}
        onChange={(e) => onDayChange(Number(e.target.value))}
        aria-label="Mission day"
        className="mt-3 w-full"
      />
    </section>
  )
}
