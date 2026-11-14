import { describeAge, measureSteps, type RoutineStep } from '@/domain/checkin'
import { formatDay } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import type { Evaluation } from '@/domain/types'
import { StatusBadge, StatusIcon } from '../status'
import { MeaningLines, latestSource, quietFocus, sourceText, stepTone, stepValue } from './shared'

interface Props {
  step: RoutineStep
  /** Position in the routine, starting at 1. */
  position: number
  total: number
  evaluation: Evaluation
  manualKeys: ReadonlySet<string>
  deviceKeys: ReadonlySet<string>
  /** How to measure, when the catalogue text is not the right one for this step. */
  howTo?: React.ReactNode
  children: React.ReactNode
}

/**
 * The frame every step shares: what is measured, why it matters in space, how
 * to measure it and the last reading. The way to enter today's reading goes
 * below, as children.
 */
export function StepFrame({ step, position, total, evaluation, manualKeys, deviceKeys, howTo, children }: Props) {
  const def = METRICS[step.metrics[0]]
  const assessment = evaluation.assessments[step.metrics[0]]
  const value = stepValue(step, evaluation)
  const instructions = measureSteps(def.howToMeasure)
  const { tone, label } = stepTone(step, evaluation)

  return (
    <section aria-labelledby="step-heading" className="card swap-in @container flex flex-col gap-6 p-6 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="eyebrow">
            Step {position} of {total}
          </p>
          <h2
            id="step-heading"
            tabIndex={-1}
            data-panel-heading
            style={quietFocus}
            className="mt-1 rounded-md text-3xl font-semibold tracking-tight"
          >
            {step.label}
          </h2>
        </div>
        <StatusBadge tone={tone} label={label} />
      </header>

      <div className="grid gap-6 @2xl:grid-cols-2">
        <div className="flex flex-col gap-5 text-sm">
          <div>
            <h3 className="font-semibold text-ink">Why it matters in space</h3>
            <p className="mt-1 text-ink-2">{def.whyInSpace}</p>
          </div>
          <div>
            <h3 className="font-semibold text-ink">How to measure</h3>
            {howTo ??
              (instructions.length > 1 ? (
                <ol className="mt-2 flex flex-col gap-2">
                  {instructions.map((text, i) => (
                    <li key={text} className="flex gap-3 text-ink-2">
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-medium text-ink tabular-nums"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <span>
                        <span className="sr-only">Step {i + 1}: </span>
                        {text}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-ink-2">{def.howToMeasure}</p>
              ))}
          </div>
        </div>

        <div className="self-start rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge">
          <h3 className="eyebrow">Last reading</h3>
          {value === null || assessment.latestDay === null ? (
            <p className="mt-2 text-ink">Never measured.</p>
          ) : (
            <>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
              <p className="mt-1 text-sm text-ink-2">
                {formatDay(assessment.latestDay)} | {describeAge(step.daysSinceReading)} |{' '}
                {sourceText(latestSource(step, evaluation, manualKeys, deviceKeys))}
              </p>
            </>
          )}
          <div className="mt-4">
            {step.state === 'due' ? (
              <p className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5">
                  <StatusIcon tone="stale" />
                </span>
                <span>
                  {value === null
                    ? 'Without a reading the monitor cannot judge this indicator.'
                    : `Out of date. A reading older than ${def.staleAfterDays} ${def.staleAfterDays === 1 ? 'day' : 'days'} says nothing about today, so it is not judged.`}
                </span>
              </p>
            ) : (
              <MeaningLines metrics={step.metrics} evaluation={evaluation} />
            )}
          </div>
        </div>
      </div>

      {children}
    </section>
  )
}
