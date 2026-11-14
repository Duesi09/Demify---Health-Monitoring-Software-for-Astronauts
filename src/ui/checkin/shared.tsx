import { meaningOf, type RoutineStep, type StepGroup } from '@/domain/checkin'
import { formatValue } from '@/domain/format'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId, ReadingSource } from '@/domain/types'
import { StatusIcon, TONE, type Tone } from '../status'
import { tileTone } from '../tiles'

/** Button and field looks shared by the check-in components; they match the dashboard's. */
export const primaryButton =
  'inline-flex items-center justify-center rounded-full bg-action px-5 py-2.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:opacity-60'
export const quietButton =
  'inline-flex items-center justify-center rounded-full bg-raised px-4 py-2.5 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis disabled:opacity-40'
export const fieldInput =
  'w-full min-w-0 rounded-xl bg-page px-3 py-2.5 text-base text-ink tabular-nums ring-1 ring-edge transition-shadow focus:ring-2 focus:ring-series-1 focus:outline-none aria-invalid:ring-2 aria-invalid:ring-warning'

/**
 * For a heading that takes focus when the view changes. It is not a control,
 * so it shows no focus ring; inline, because the page-wide ring outranks classes.
 */
export const quietFocus = { outline: 'none' } as const

/** The step that holds the Reaction Self-Test instead of a field to type in. */
export const REACTION_STEP = 'reactionMs'

/** The unit as it reads after a value: a rating out of 5 is spelled out. */
export function unitText(metric: MetricId): string {
  const unit = METRICS[metric].unit
  return unit.startsWith('/') ? `of ${unit.slice(1).trim()}` : unit
}

/** The latest values of a step as one string, such as "118/76 mmHg". Null when a value is missing. */
export function stepValue(step: StepGroup, evaluation: Evaluation): string | null {
  const values = step.metrics.map((m) => evaluation.assessments[m].value)
  if (values.some((v) => v === null)) return null
  return `${step.metrics.map((m, i) => formatValue(m, values[i]!)).join('/')} ${unitText(step.metrics[0])}`
}

/**
 * Where the latest reading of a step came from. A reading typed in by the
 * crew member counts before one a device sent, as it does in the rule engine.
 */
export function latestSource(
  step: StepGroup,
  evaluation: Evaluation,
  manualKeys: ReadonlySet<string>,
  deviceKeys: ReadonlySet<string>,
): ReadingSource {
  const latestIn = (keys: ReadonlySet<string>) => step.metrics.some((m) => keys.has(`${evaluation.assessments[m].latestDay}:${m}`))
  return latestIn(manualKeys) ? 'manual' : latestIn(deviceKeys) ? 'device' : 'simulated'
}

export function sourceText(source: ReadingSource): string {
  return source === 'manual' ? 'entered by you' : source === 'device' ? 'from device' : 'from sensor'
}

/**
 * The icon and word for a step in the routine. A step that is done shows the
 * health status of its reading, so measuring is answered at once.
 */
export function stepTone(step: RoutineStep, evaluation: Evaluation): { tone: Tone; label: string } {
  if (step.state === 'due') return { tone: 'stale', label: 'Due' }
  if (step.state === 'open') return { tone: 'unmonitored', label: 'Not measured today' }
  const tone = tileTone(step, evaluation)
  return { tone, label: TONE[tone].label }
}

/** What each current value of a step means: status, value, range and what to do. */
export function MeaningLines({ metrics, evaluation }: { metrics: MetricId[]; evaluation: Evaluation }) {
  const lines = metrics.flatMap((m) => {
    const meaning = meaningOf(evaluation.assessments[m])
    return meaning ? [{ metric: m, meaning }] : []
  })
  if (lines.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {lines.map(({ metric, meaning }) => (
        <li key={metric} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">
            <StatusIcon tone={meaning.status} />
          </span>
          <span className="min-w-0 text-ink">
            <span className="font-semibold">{TONE[meaning.status].label}</span> | {meaning.reading} | {meaning.range}
            {meaning.drift && <span className="mt-0.5 block text-ink-2">{meaning.drift}</span>}
            {meaning.action && (
              <span className="mt-0.5 block">
                <span className="font-semibold">What to do: </span>
                {meaning.action}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
