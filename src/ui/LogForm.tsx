'use client'

import { useState, useTransition } from 'react'
import { logReadings } from '@/app/actions'
import { METRICS } from '@/domain/metrics'
import { validateReading } from '@/domain/validate'
import type { MetricId, Reading } from '@/domain/types'
import { StatusIcon } from './status'

interface Props {
  metrics: MetricId[]
  day: number
  onLogged: (readings: Reading[]) => void
}

type Message = { kind: 'saved' | 'error'; text: string }

/** Lets the crew member enter a measurement for the current mission day. */
export function LogForm({ metrics, day, onLogged }: Props) {
  const [inputs, setInputs] = useState<Partial<Record<MetricId, string>>>({})
  const [message, setMessage] = useState<Message | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const entries = metrics.map((metric) => ({
      metric,
      value: inputs[metric]?.trim() ? Number(inputs[metric]) : NaN,
    }))
    const error = entries.map((e) => validateReading(e.metric, e.value)).find(Boolean)
    if (error) {
      setMessage({ kind: 'error', text: error })
      return
    }
    startTransition(async () => {
      try {
        const result = await logReadings(day, entries)
        if (!result.ok) {
          setMessage({ kind: 'error', text: result.error })
          return
        }
        onLogged(result.readings)
        setInputs({})
        setMessage({ kind: 'saved', text: `Saved for mission day ${day}.` })
      } catch {
        setMessage({ kind: 'error', text: 'Could not reach the server. Your reading was not saved; try again.' })
      }
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {metrics.map((metric) => {
          const def = METRICS[metric]
          return (
            <label key={metric} className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink-2">
              {def.label} ({def.unit.replace('/ 5', '1 to 5')})
              <input
                type="number"
                inputMode="decimal"
                min={def.inputMin}
                max={def.inputMax}
                step={def.decimals === 0 ? 1 : def.inputStep}
                value={inputs[metric] ?? ''}
                onChange={(e) => {
                  setInputs({ ...inputs, [metric]: e.target.value })
                  setMessage(null)
                }}
                className="w-full rounded-xl bg-page px-3 py-2.5 text-base text-ink ring-1 ring-edge transition-shadow focus:ring-2 focus:ring-series-1 focus:outline-none"
              />
            </label>
          )
        })}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-series-1 px-5 py-2.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Log reading'}
        </button>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className="swap-in flex items-center gap-2 text-sm text-ink"
        >
          <StatusIcon tone={message.kind === 'error' ? 'watch' : 'nominal'} />
          {message.text}
        </p>
      )}
    </form>
  )
}
