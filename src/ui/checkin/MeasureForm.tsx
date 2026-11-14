'use client'

import { useRef, useState, useTransition } from 'react'
import { logReadings } from '@/app/actions'
import { fieldError, fieldValue, type RoutineStep } from '@/domain/checkin'
import { METRICS } from '@/domain/metrics'
import type { MetricId, Reading } from '@/domain/types'
import { StatusIcon } from '../status'
import { fieldInput, primaryButton, quietButton, unitText } from './shared'

interface Props {
  step: RoutineStep
  day: number
  onSaved: (readings: Reading[]) => void
  onSkip: () => void
}

/** The limits of a field in words, shown under it before anything is typed. */
function limits(metric: MetricId): string {
  const def = METRICS[metric]
  const kind = def.decimals === 0 ? 'Whole number' : def.decimals === 1 ? 'One decimal place' : `${def.decimals} decimal places`
  const unit = def.unit.startsWith('/') ? '' : ` ${def.unit}`
  return `${kind}, ${def.inputMin} to ${def.inputMax}${unit}`
}

/** The fields for one step of the routine, checked here and again on the server. */
export function MeasureForm({ step, day, onSaved, onSkip }: Props) {
  const [typed, setTyped] = useState<Partial<Record<MetricId, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<MetricId, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useRef<HTMLFormElement>(null)
  const done = step.state === 'done'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const found: Partial<Record<MetricId, string>> = {}
    for (const m of step.metrics) {
      const error = fieldError(m, typed[m] ?? '')
      if (error) found[m] = error
    }
    setErrors(found)
    setFormError(null)
    const firstWrong = step.metrics.find((m) => found[m])
    if (firstWrong) {
      form.current?.querySelector<HTMLInputElement>(`#field-${firstWrong}`)?.focus()
      return
    }

    const entries = step.metrics.map((metric) => ({ metric, value: fieldValue(typed[metric] ?? '') }))
    // The server checks this too; saying it here saves a round trip over a slow link.
    const systolic = entries.find((e) => e.metric === 'systolic')
    const diastolic = entries.find((e) => e.metric === 'diastolic')
    if (systolic && diastolic && systolic.value <= diastolic.value) {
      setFormError('Systolic pressure must be higher than diastolic pressure. Check both values.')
      return
    }
    startTransition(async () => {
      try {
        const result = await logReadings(day, entries)
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        onSaved(result.readings)
      } catch {
        setFormError('Could not reach the server. Your reading was not saved. Try again.')
      }
    })
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
      <h3 className="font-semibold text-ink">
        {done ? `Replace the reading for mission day ${day}` : `Enter the reading for mission day ${day}`}
      </h3>
      {done && (
        <p className="mt-1 text-sm text-ink-2">
          Today already has a reading. A value you enter here takes its place for today.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-4">
        {step.metrics.map((m) => {
          const def = METRICS[m]
          const error = errors[m]
          return (
            <div key={m} className="flex min-w-40 flex-1 flex-col gap-1.5 @md:max-w-60">
              <label htmlFor={`field-${m}`} className="text-sm font-medium text-ink">
                {def.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`field-${m}`}
                  type="number"
                  inputMode={def.decimals === 0 ? 'numeric' : 'decimal'}
                  min={def.inputMin}
                  max={def.inputMax}
                  step={def.decimals === 0 ? 1 : def.inputStep}
                  value={typed[m] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`hint-${m}${error ? ` error-${m}` : ''}`}
                  onChange={(e) => {
                    setTyped({ ...typed, [m]: e.target.value })
                    if (error) setErrors({ ...errors, [m]: undefined })
                    setFormError(null)
                  }}
                  className={fieldInput}
                />
                <span className="shrink-0 text-sm text-ink-2">{unitText(m)}</span>
              </div>
              <p id={`hint-${m}`} className="text-xs text-ink-2">
                {limits(m)}
              </p>
              {error && (
                <p id={`error-${m}`} role="alert" className="swap-in flex items-start gap-1.5 text-sm text-ink">
                  <span className="mt-0.5">
                    <StatusIcon tone="watch" size={14} />
                  </span>
                  {error}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {formError && (
        <p role="alert" className="swap-in mt-4 flex items-start gap-2 text-sm text-ink">
          <span className="mt-0.5">
            <StatusIcon tone="watch" />
          </span>
          {formError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? 'Saving…' : 'Save reading'}
        </button>
        <button type="button" onClick={onSkip} disabled={pending} className={quietButton}>
          {done ? 'Keep it and go on' : 'Skip for now'}
        </button>
      </div>
    </form>
  )
}
