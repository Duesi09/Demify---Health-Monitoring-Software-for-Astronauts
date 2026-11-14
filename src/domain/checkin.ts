import { evaluateIndexed } from './engine'
import { changeUnit, formatAverage, formatDelta, formatValue } from './format'
import { METRICS } from './metrics'
import type { Evaluation, MetricAssessment, MetricId, Status } from './types'

/**
 * The daily check-in: which measurements the crew member still owes today,
 * what a saved reading means, and how many days in a row nothing was left
 * out of date.
 */

/** Values that are measured and saved together, such as the two blood pressure values. */
export interface StepGroup {
  id: string
  label: string
  metrics: MetricId[]
}

/**
 * `due`: out of date or never measured. `open`: still current, but without a
 * reading from today. `done`: has a reading from today.
 */
export type StepState = 'due' | 'open' | 'done'

export interface RoutineStep extends StepGroup {
  state: StepState
  /** Days since the oldest of its values was measured; null when one was never measured. */
  daysSinceReading: number | null
  /** Days the reading stays current; below zero when it is already out of date. Null when never measured. */
  daysLeft: number | null
}

const STATE_ORDER: StepState[] = ['due', 'open', 'done']

function stepFor(group: StepGroup, evaluation: Evaluation): RoutineStep {
  const assessments = group.metrics.map((m) => evaluation.assessments[m])
  const never = assessments.some((a) => a.daysSinceReading === null)
  const ages = assessments.map((a) => a.daysSinceReading ?? 0)
  const left = assessments.map((a) => METRICS[a.metric].staleAfterDays - (a.daysSinceReading ?? 0))
  return {
    ...group,
    state: assessments.some((a) => a.stale) ? 'due' : ages.every((d) => d === 0) ? 'done' : 'open',
    daysSinceReading: never ? null : Math.max(...ages),
    daysLeft: never ? null : Math.min(...left),
  }
}

/**
 * Today's routine, most urgent first: measurements that are out of date, then
 * those without a reading from today, then those already taken. Within a
 * level the given order is kept, except that the longest overdue comes first.
 */
export function planRoutine(groups: StepGroup[], evaluation: Evaluation): RoutineStep[] {
  const urgency = (s: RoutineStep) => (s.state !== 'due' ? 0 : s.daysLeft === null ? -Infinity : s.daysLeft)
  return groups
    .map((group, position) => ({ step: stepFor(group, evaluation), position }))
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.step.state) - STATE_ORDER.indexOf(b.step.state) ||
        urgency(a.step) - urgency(b.step) ||
        a.position - b.position,
    )
    .map((entry) => entry.step)
}

export interface RoutineSummary {
  total: number
  /** Steps with a reading from today. */
  measuredToday: number
  due: number
  /** Still current, no reading from today. */
  open: number
}

export function summariseRoutine(steps: RoutineStep[]): RoutineSummary {
  const count = (state: StepState) => steps.filter((s) => s.state === state).length
  return { total: steps.length, measuredToday: count('done'), due: count('due'), open: count('open') }
}

/**
 * The step to go to after `currentId`: the next measurement that is still due
 * and was not skipped, looking onward first and then from the top. Null when
 * nothing is left, which is when the completion state is shown.
 */
export function nextDueStep(steps: RoutineStep[], currentId: string | null, skipped: ReadonlySet<string>): string | null {
  const at = steps.findIndex((s) => s.id === currentId)
  const onward = at < 0 ? steps : [...steps.slice(at + 1), ...steps.slice(0, at)]
  return onward.find((s) => s.state === 'due' && !skipped.has(s.id))?.id ?? null
}

/** How long ago a reading was taken, in words. */
export function describeAge(daysSinceReading: number | null): string {
  if (daysSinceReading === null) return 'never measured'
  if (daysSinceReading === 0) return 'today'
  if (daysSinceReading === 1) return 'yesterday'
  return `${daysSinceReading} days ago`
}

/**
 * Splits a measuring instruction into steps, one per sentence. A single
 * sentence stays as it is: numbering one step would only add noise.
 */
export function measureSteps(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Checks what was typed into the field of one indicator and says in words
 * what is wrong with it, or returns null. Applies the limits of the catalogue,
 * the same ones the server checks again before saving.
 */
export function fieldError(metric: MetricId, typed: string): string | null {
  const def = METRICS[metric]
  const value = typed.trim() === '' ? NaN : Number(typed.trim().replace(',', '.'))
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (value < def.inputMin || value > def.inputMax) {
    // "1 and 5 / 5" would read badly, so a rating scale gets no unit.
    const unit = def.unit.startsWith('/') ? '' : ` ${def.unit}`
    return `Enter a value between ${def.inputMin} and ${def.inputMax}${unit}.`
  }
  if (def.decimals === 0 && !Number.isInteger(value)) return 'Enter a whole number.'
  return null
}

/** The number a field holds; only meaningful once `fieldError` has passed. */
export function fieldValue(typed: string): number {
  return Number(typed.trim().replace(',', '.'))
}

export interface Meaning {
  status: Status
  /** The value that was judged: the latest reading, or the 7-day average. */
  reading: string
  /** The name of the range the value falls in. */
  range: string
  /** The change from the personal baseline, when that is a concern of its own. */
  drift: string | null
  /** What to do about it; null when nothing is needed. */
  action: string | null
}

/** What a current reading means, in the rule engine's own terms. Null when there is nothing current to judge. */
export function meaningOf(a: MetricAssessment): Meaning | null {
  if (a.stale || a.band === null || a.value === null) return null
  const def = METRICS[a.metric]
  const onAverage = def.evaluateOn === 'avg7' && a.recentMean !== null
  const reading = onAverage
    ? `${def.label}, 7-day average ${formatAverage(a.metric, a.recentMean!)} ${def.unit}`
    : `${def.label} ${formatValue(a.metric, a.value)} ${def.unit}`

  const drifting = a.driftStatus !== 'nominal' && a.delta !== null && a.baseline !== null
  const drift = drifting
    ? `Your 7-day average is ${formatDelta(a.metric, a.delta!)} ${changeUnit(a.metric)} against your pre-flight baseline of ${formatAverage(a.metric, a.baseline!)} ${def.unit}.`
    : null

  // The action belongs to whichever check set the status: the range or the drift.
  const rangeLeads = a.band.status === a.status
  const action = a.status === 'nominal' ? null : ((rangeLeads ? a.band.action : def.drift?.action) ?? null)
  return { status: a.status, reading, range: a.band.label, drift, action }
}

type Series = Map<number, number>

/**
 * For each mission day from 1 to `today`: whether nothing was out of date on
 * that day. It asks the rule engine, so the streak and the reminders on the
 * dashboard can never disagree.
 */
export function completedDays(index: Record<MetricId, Series>, today: number): boolean[] {
  return Array.from({ length: Math.max(0, today) }, (_, i) => evaluateIndexed(index, i + 1).reminders.length === 0)
}

/** Streak lengths worth marking, in days. The last one is the whole mission. */
export const MILESTONES = [7, 30, 60, 90, 120, 150, 180]

export interface Run {
  length: number
  /** Mission day the run ended on. */
  endDay: number
}

export interface Streak {
  /**
   * Complete days in a row. While today is still open the run up to yesterday
   * counts, because today can still be completed.
   */
  current: number
  todayComplete: boolean
  /** Longest run of the mission so far; null before the first complete day. */
  longest: Run | null
  /** The last run that ended before the current one began. */
  previous: Run | null
  /** Next milestone above the current streak; null once the last one is reached. */
  nextMilestone: number | null
  /** Highest milestone the current streak has reached. */
  reachedMilestone: number | null
}

/** Reads the streak from the list of complete days, where entry 0 is mission day 1 and the last entry is today. */
export function streakOf(complete: boolean[]): Streak {
  const runs: Run[] = []
  let length = 0
  complete.forEach((done, i) => {
    length = done ? length + 1 : 0
    // A run is recorded on its last day.
    if (done && !complete[i + 1]) runs.push({ length, endDay: i + 1 })
  })

  const today = complete.length
  const todayComplete = today > 0 && complete[today - 1]
  const last = runs[runs.length - 1]
  const alive = last !== undefined && last.endDay >= today - 1
  const current = alive ? last.length : 0
  const ended = alive ? runs.slice(0, -1) : runs

  return {
    current,
    todayComplete,
    // The earliest run wins a tie, so the record keeps its date until it is beaten.
    longest: runs.reduce<Run | null>((best, run) => (best === null || run.length > best.length ? run : best), null),
    previous: ended[ended.length - 1] ?? null,
    nextMilestone: MILESTONES.find((m) => m > current) ?? null,
    reachedMilestone: MILESTONES.findLast((m) => m <= current) ?? null,
  }
}
