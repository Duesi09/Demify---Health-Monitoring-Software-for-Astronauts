'use client'

import { useState, useTransition } from 'react'
import { logReadings } from '@/app/actions'
import { formatAverage, formatDay, formatDelta, formatValue } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import type { Protocol, Score } from '@/domain/reactionTest'
import type { Evaluation, MetricAssessment, Reading, ReadingSource } from '@/domain/types'
import { validateReading } from '@/domain/validate'
import { RangeBar } from '../RangeBar'
import { StatusIcon } from '../status'
import { MeaningLines, primaryButton, quietButton, quietFocus, sourceText } from './shared'

interface Props {
  score: Score
  protocol: Protocol
  day: number
  /** The reaction time indicator as it stood before this run. */
  before: MetricAssessment
  /** Where the latest reading before this run came from. */
  beforeSource: ReadingSource
  /** Today's evaluation; after saving it holds the status of the new reading. */
  evaluation: Evaluation
  onSaved: (readings: Reading[]) => void
  onAgain: () => void
  onDiscard: () => void
  onContinue: () => void
}

const times = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The numbers of one run in plain words, set against the crew member's own values, with the way to save it. */
export function ReactionResult({ score, protocol, day, before, beforeSource, evaluation, onSaved, onAgain, onDiscard, onContinue }: Props) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const demo = protocol.id === 'demo'
  // The log accepts a fixed range. A mean outside it is the result most worth keeping,
  // so it is saved at the nearest accepted value and the crew member is told.
  const limits = METRICS.reactionMs
  const savedMs = Math.min(limits.inputMax, Math.max(limits.inputMin, score.meanMs))
  const clamped = savedMs !== score.meanMs
  const unsavable = validateReading('reactionMs', savedMs)

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await logReadings(day, [{ metric: 'reactionMs', value: savedMs }])
        if (!result.ok) {
          setError(result.error)
          return
        }
        setSaved(true)
        onSaved(result.readings)
      } catch {
        setError('Could not reach the server. The result was not saved. Try again.')
      }
    })
  }

  const numbers = [
    {
      term: 'Median',
      value: `${score.medianMs} ms`,
      meaning: 'The middle of your responses. A few slow ones hardly move it.',
    },
    {
      term: 'Slowest tenth',
      value: `${score.slowestTenthMs} ms`,
      meaning: 'The mean of your slowest responses. Tiredness shows here first.',
    },
    {
      term: 'Lapses',
      value: `${score.lapses} of ${score.stimuli}`,
      meaning: `Responses of ${protocol.lapseMs} ms or slower${score.timeouts > 0 ? `, including ${times(score.timeouts, 'counter', 'counters')} you did not answer` : ', or no response at all'}. A sign that attention slipped.`,
    },
    {
      term: 'False starts',
      value: String(score.falseStarts),
      meaning: `Presses before the counter appeared or faster than ${protocol.anticipationMs} ms. They are counted, not timed.`,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 tabIndex={-1} data-phase-focus style={quietFocus} className="rounded-md text-xl font-semibold tracking-tight">
          Your result{demo ? ' (demo run)' : ''}
        </h3>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="text-6xl leading-none font-semibold tracking-tight tabular-nums">{score.meanMs}</span>
          <span className="text-xl text-ink-2">ms mean reaction time</span>
        </p>
        <p className="mt-2 text-sm text-ink-2">
          Mean of {times(score.valid, 'valid response', 'valid responses')} to {times(score.stimuli, 'counter', 'counters')}.
        </p>
        {demo && (
          <p className="mt-3 flex items-start gap-2 text-sm text-ink">
            <span className="mt-0.5">
              <StatusIcon tone="stale" />
            </span>
            Demo run of 30 seconds. It shows how the test works but is too short to say how alert you are. Use the
            standard test for a reading you rely on.
          </p>
        )}
      </div>

      <div className="grid gap-6 @2xl:grid-cols-2">
        <dl className="flex flex-col gap-3 text-sm">
          {numbers.map((n) => (
            <div key={n.term} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-grid pt-3">
              <dt className="font-semibold text-ink">{n.term}</dt>
              <dd className="row-span-2 text-lg font-semibold text-ink tabular-nums">{n.value}</dd>
              <dd className="text-ink-2">{n.meaning}</dd>
            </div>
          ))}
        </dl>

        <div className="self-start rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
          <h4 className="eyebrow">Against your own values</h4>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">This run</dt>
              <dd className="font-semibold text-ink tabular-nums">{score.meanMs} ms</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-ink-2">Pre-flight baseline</dt>
              <dd className="text-right text-ink tabular-nums">
                {before.baseline === null ? (
                  'None yet'
                ) : (
                  <>
                    {formatAverage('reactionMs', before.baseline)} ms
                    <span className="block text-xs text-ink-2">
                      this run: {formatDelta('reactionMs', score.meanMs - before.baseline)} ms
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-2">7-day average</dt>
              <dd className="text-ink tabular-nums">
                {before.recentMean === null ? 'Too few readings' : `${formatAverage('reactionMs', before.recentMean)} ms`}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-ink-2">Last reading</dt>
              <dd className="text-right text-ink tabular-nums">
                {before.value === null || before.latestDay === null ? (
                  'None yet'
                ) : (
                  <>
                    {formatValue('reactionMs', before.value)} ms
                    <span className="block text-xs text-ink-2">
                      {formatDay(before.latestDay)} | {sourceText(beforeSource)}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <RangeBar metric="reactionMs" value={score.meanMs} detailed />
          </div>
          <p className="mt-2 text-xs text-ink-2">
            The ranges are project defaults. The values in this demo mission are simulated and were not taken on this
            device, so read the comparison as an example.
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 text-sm text-ink-2">
        <span className="mt-0.5">
          <StatusIcon tone="stale" />
        </span>
        <span>
          <span className="font-semibold text-ink">Read it with care. </span>
          Browser, screen and keyboard add a delay of their own, so this is not a medical instrument. The result is
          good for one thing: comparing you with your own earlier results on the same device.
        </span>
      </p>

      {/* Always in the page, so a screen reader announces the status when it arrives. */}
      <div role="status" className="flex flex-col gap-3">
        {saved && (
          <div className="swap-in rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
            <p className="font-semibold text-ink">Saved as the reaction time for mission day {day}</p>
            <div className="mt-3">
              <MeaningLines metrics={['reactionMs']} evaluation={evaluation} />
            </div>
          </div>
        )}
      </div>

      {clamped && !saved && (
        <p className="text-sm text-ink-2">
          Your mean of {score.meanMs} ms is outside what the log accepts ({limits.inputMin} to {limits.inputMax} ms). It
          will be saved as {savedMs} ms.
        </p>
      )}

      {(error ?? unsavable) && (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink">
          <span className="mt-0.5">
            <StatusIcon tone="watch" />
          </span>
          {error ?? `This result cannot be saved. ${unsavable}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {saved ? (
          <button type="button" onClick={onContinue} className={primaryButton}>
            Continue
          </button>
        ) : (
          <button type="button" onClick={save} disabled={pending || unsavable !== null} className={primaryButton}>
            {pending ? 'Saving…' : `Save ${savedMs} ms for mission day ${day}`}
          </button>
        )}
        <button type="button" onClick={onAgain} disabled={pending} className={quietButton}>
          Run the test again
        </button>
        {!saved && (
          <button type="button" onClick={onDiscard} disabled={pending} className={quietButton}>
            Discard
          </button>
        )}
      </div>
    </div>
  )
}
