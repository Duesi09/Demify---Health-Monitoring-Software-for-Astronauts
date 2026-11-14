'use client'

import { useId } from 'react'
import { SHELTER_FACTOR, SHELTER_STAY_MS, formatClock, formatDose, shelterEstimate } from '@/domain/radiation'
import { SourceLink, Tag } from './parts'

interface Props {
  /** The dose of the event day, in mSv per day: measured, or the example of the drill. */
  dailyDose: number
  /** True when `dailyDose` is the made-up example of a drill. */
  example: boolean
  /** The normal daily dose without an event. */
  backgroundPerDay: number
  factor: number
  onFactor: (factor: number) => void
  /** Time on the shelter clock, in ms. */
  shelterMs: number
}

const STAY_HOURS = SHELTER_STAY_MS / 3_600_000
const FACTORS: number[] = []
for (let f = SHELTER_FACTOR.min; f <= SHELTER_FACTOR.max; f += SHELTER_FACTOR.step) FACTORS.push(f)

/** One bar of the comparison; its length is the dose, on a scale both bars share. */
function DoseBar({ label, dose, scale, strong }: { label: string; dose: number; scale: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 text-sm">
      <dt className="text-ink-2">{label}</dt>
      <dd className="flex items-center gap-2">
        <span
          className={`h-3 min-w-1 rounded-full ${strong ? 'bg-series-1' : 'bg-series-1/40'}`}
          style={{ width: `${(dose / scale) * 78}%` }}
          aria-hidden="true"
        />
        <span className="whitespace-nowrap text-ink tabular-nums">{formatDose(dose)} mSv</span>
      </dd>
    </div>
  )
}

/**
 * What a shelter might avoid. An illustration with its assumptions in plain
 * sight: no public data gives the shielding of a real shelter, so the factor
 * is the crew member's to move and nothing here is presented as a measurement.
 */
export function ShelterEstimate({ dailyDose, example, backgroundPerDay, factor, onFactor, shelterMs }: Props) {
  const sliderId = useId()
  const input = { dailyDose, backgroundPerDay, factor }
  const full = shelterEstimate({ ...input, hours: STAY_HOURS })
  const soFar = shelterEstimate({ ...input, hours: shelterMs / 3_600_000 })

  return (
    <div className="rounded-2xl border border-dashed border-muted p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">What the shelter may avoid</h3>
        <Tag>Illustrative</Tag>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        An estimate to show why the shelter matters, not a measurement. Real values depend on the vehicle, on where
        the shelter is and on the event.
      </p>

      <p className="mt-4 text-sm text-ink-2">If you stay in the shelter for {STAY_HOURS} hours:</p>
      <p className="mt-1">
        <span className="text-4xl font-semibold tracking-tight text-ink">about {formatDose(full.avoided)} mSv</span>
        <span className="ml-2 text-ink-2">avoided</span>
      </p>
      <dl className="mt-3 flex flex-col gap-1.5">
        <DoseBar label="Open cabin" dose={full.unsheltered} scale={full.unsheltered} />
        <DoseBar label="In the shelter" dose={full.sheltered} scale={full.unsheltered} strong />
      </dl>
      <p className="mt-3 text-sm text-ink-2">
        With {formatClock(shelterMs)} on the shelter clock so far: about{' '}
        <span className="font-semibold text-ink tabular-nums">{formatDose(soFar.avoided)} mSv</span> avoided.
      </p>

      <div className="mt-5">
        <label htmlFor={sliderId} className="text-sm font-medium text-ink">
          Assumed effect of the shelter: it divides the dose from solar particles by{' '}
          <span className="tabular-nums">{factor}</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={SHELTER_FACTOR.min}
          max={SHELTER_FACTOR.max}
          step={SHELTER_FACTOR.step}
          value={factor}
          onChange={(e) => onFactor(Number(e.target.value))}
          aria-valuetext={`Divides the dose from solar particles by ${factor}`}
          className="mt-2 block w-full cursor-pointer accent-series-1"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums" aria-hidden="true">
          {FACTORS.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Adjustable from {SHELTER_FACTOR.min} to {SHELTER_FACTOR.max}. The upper end is the largest difference
          measured between places inside the Orion spacecraft on Artemis I (
          <SourceLink source="artemis1" />
          ). No value in this range describes a real shelter.
        </p>
      </div>

      <div className="mt-4 text-xs text-ink-2">
        <p className="font-medium text-ink">Assumptions</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            {example
              ? `The drill uses a made-up event with a dose of ${formatDose(dailyDose)} mSv per day in the open cabin.`
              : `Today's reading of ${formatDose(dailyDose)} mSv per day is what the open cabin receives.`}{' '}
            It arrives evenly over 24 hours.
          </li>
          <li>
            Everything above the typical day of {formatDose(backgroundPerDay)} mSv comes from solar particles, and
            only that part is reduced. Shielding does little against the steady cosmic rays.
          </li>
        </ul>
      </div>
    </div>
  )
}
