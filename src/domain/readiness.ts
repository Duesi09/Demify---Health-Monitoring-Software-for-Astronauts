import { METRICS } from './metrics'
import { MISSION_DAYS } from './simulator'
import type { Evaluation, Finding, MetricId } from './types'

/**
 * Fit for today's task: turns what the rule engine knows about the crew member
 * today into advice for the task on today's plan.
 *
 * Every limit in this file is a project default, not a flight rule. Which
 * finding stops which task, how long a heart needs to recover and what counts
 * as out of date would all need sign-off from flight surgeons and flight
 * directors before real use. The result is advice: the decision stays with the
 * commander and the crew member.
 */

/** The standing line every screen that shows a verdict must carry. */
export const READINESS_DISCLAIMER =
  'Advice, not a decision. The commander and the crew member decide. The limits are project defaults, not flight rules.'

export type DemandId = 'alertness' | 'heart' | 'health' | 'radiation'

/** `high`: the task stands or falls with it. `some`: it matters, with margin. */
export type DemandLevel = 'high' | 'some'

interface Demand {
  label: string
  /** Indicators that must be up to date before the task can be judged on this demand. */
  needs: MetricId[]
}

export const DEMANDS: Record<DemandId, Demand> = {
  alertness: { label: 'Alertness and quick reactions', needs: ['reactionMs', 'sleepHours'] },
  heart: { label: 'Cardiovascular reserve', needs: ['restingHr', 'systolic', 'diastolic', 'spo2'] },
  health: { label: 'No acute illness', needs: ['bodyTemp', 'glucose'] },
  radiation: { label: 'Calm space weather', needs: ['radiationDose'] },
}

const DEMAND_IDS = Object.keys(DEMANDS) as DemandId[]

/** The demand a single indicator speaks to when it is out of range or off baseline. */
const METRIC_DEMAND: Record<MetricId, DemandId> = {
  restingHr: 'heart',
  systolic: 'heart',
  diastolic: 'heart',
  spo2: 'heart',
  exerciseMin: 'heart',
  bodyTemp: 'health',
  glucose: 'health',
  sleepHours: 'alertness',
  mood: 'alertness',
  reactionMs: 'alertness',
  cabinCo2: 'alertness',
  radiationDose: 'radiation',
}

export type TaskId = 'spacewalk' | 'burn' | 'roboticArm' | 'exercise' | 'maintenance' | 'science' | 'rest'

export type AlternativeKind = 'measure' | 'postpone' | 'swap' | 'shorten' | 'lighter'

export interface Alternative {
  kind: AlternativeKind
  /** The kind in two or three words, for a heading. */
  label: string
  /** What to do instead, as one instruction. */
  text: string
}

export const ALTERNATIVE_LABEL: Record<AlternativeKind, string> = {
  measure: 'Measure first',
  postpone: 'Postpone',
  swap: 'Swap with a crewmate',
  shorten: 'Shorten',
  lighter: 'Do a lighter task',
}

const alternative = (kind: AlternativeKind, text: string): Alternative => ({
  kind,
  label: ALTERNATIVE_LABEL[kind],
  text,
})

export interface MissionTask {
  id: TaskId
  label: string
  /** What the task demands, in plain words. Shown to the crew member. */
  demand: string
  demands: Partial<Record<DemandId, DemandLevel>>
  /** Findings this task helps to fix. They never count against it. */
  remedyFor?: string[]
  /** What to suggest when the verdict is caution, and when it is no-go. */
  ifCaution: Alternative
  ifNoGo: Alternative
}

/**
 * The catalogue. Every task but rest lists `radiation`: during a solar
 * particle event the crew belongs in the storm shelter, whatever the work.
 */
export const TASKS: Record<TaskId, MissionTask> = {
  spacewalk: {
    id: 'spacewalk',
    label: 'Spacewalk',
    demand:
      'Hours of heavy work outside with no quick way back. Needs alertness, cardiovascular reserve, no acute illness and no radiation storm.',
    demands: { alertness: 'high', heart: 'high', health: 'high', radiation: 'high' },
    ifCaution: alternative(
      'shorten',
      'Cut the spacewalk down to its essential steps and agree extra check-ins with the crew inside.',
    ),
    ifNoGo: alternative(
      'postpone',
      'Move the spacewalk to another day, or let a crewmate go out while you support from inside.',
    ),
  },
  burn: {
    id: 'burn',
    label: 'Trajectory correction burn',
    demand:
      'Short and exact, with no second try. Needs peak alertness and quick reactions, and a pilot whose circulation and blood sugar are steady.',
    demands: { alertness: 'high', heart: 'some', health: 'some', radiation: 'some' },
    ifCaution: alternative(
      'swap',
      'A crewmate takes the controls today. You fly as second pilot and read the checklist.',
    ),
    ifNoGo: alternative(
      'swap',
      'A crewmate flies the burn and you stay off the flight deck. The burn window does not wait.',
    ),
  },
  roboticArm: {
    id: 'roboticArm',
    label: 'Robotic arm operation',
    demand:
      'Fine control for an hour or more, close to the hull. Needs sustained attention and steady hands, not physical strength.',
    demands: { alertness: 'high', health: 'some', radiation: 'some' },
    ifCaution: alternative(
      'shorten',
      'Split the operation into short blocks with breaks, and have a crewmate watch the clearances.',
    ),
    ifNoGo: alternative('swap', 'Let a rested crewmate operate the arm, or move the operation to another day.'),
  },
  exercise: {
    id: 'exercise',
    label: 'Exercise session',
    demand:
      'Two hours of loaded exercise to keep heart, muscle and bone. Needs a steady heart and no acute illness.',
    demands: { heart: 'some', health: 'high', radiation: 'some' },
    remedyFor: ['pattern:deconditioning', 'range:exerciseMin'],
    ifCaution: alternative(
      'shorten',
      'Keep the session brief and light, and stop if you feel dizzy, short of breath or unwell.',
    ),
    ifNoGo: alternative('lighter', 'Skip the session today. Rest or do light work, and train again when you are cleared.'),
  },
  maintenance: {
    id: 'maintenance',
    label: 'Maintenance work',
    demand: 'Checks and repairs inside the vehicle. Light work that needs a clear head for the procedures.',
    demands: { alertness: 'some', health: 'some', radiation: 'some' },
    ifCaution: alternative(
      'shorten',
      'Do only the jobs that cannot wait, and have a crewmate check each critical step.',
    ),
    ifNoGo: alternative('postpone', 'Leave the work for another day. A crewmate takes over anything urgent.'),
  },
  science: {
    id: 'science',
    label: 'Science work',
    demand: 'Experiments at the workbench. Light work that asks little of the body.',
    demands: { health: 'some', radiation: 'some' },
    ifCaution: alternative('shorten', 'Do the time-critical part of the experiment, then stop and rest.'),
    ifNoGo: alternative('postpone', 'Leave the experiment for another day. A crewmate takes over anything urgent.'),
  },
  rest: {
    id: 'rest',
    label: 'Rest day',
    demand: 'No planned work. Asks nothing of the body.',
    demands: {},
    // Never used: a rest day is always possible.
    ifCaution: alternative('shorten', 'Keep the day free.'),
    ifNoGo: alternative('postpone', 'Keep the day free.'),
  },
}

export const TASK_IDS = Object.keys(TASKS) as TaskId[]

/**
 * The routine: two weeks of science, maintenance and exercise with one rest
 * day a week, repeated for the whole transit.
 */
const RHYTHM: TaskId[] = [
  'science',
  'maintenance',
  'exercise',
  'science',
  'rest',
  'maintenance',
  'exercise',
  'science',
  'exercise',
  'maintenance',
  'science',
  'rest',
  'science',
  'maintenance',
]

/**
 * The demanding tasks, placed by hand on top of the routine. Some fall on
 * healthy days and some inside the scripted events of the simulated mission,
 * so the plan shows every verdict without turning each bad day into a
 * demanding one.
 */
const SCHEDULED: Record<number, TaskId> = {
  // First trajectory correction, on a healthy day.
  9: 'burn',
  16: 'roboticArm',
  23: 'spacewalk',
  // Days 28 to 46: heavy workload and sleep loss.
  36: 'roboticArm',
  42: 'spacewalk',
  // The spacewalk of day 42, done once the crew member has recovered.
  49: 'spacewalk',
  // After the life-support fault of days 54 to 58: blood oxygen and reactions are still off baseline.
  60: 'burn',
  63: 'spacewalk',
  // Days 70 to 77: infection with fever.
  73: 'roboticArm',
  // Days 86 to 90: blood pressure was not measured.
  90: 'burn',
  // Days 105 to 140: the exercise device is out of service.
  118: 'burn',
  120: 'roboticArm',
  128: 'spacewalk',
  // Days 148 and 149: solar particle event.
  148: 'spacewalk',
  // The spacewalk of day 148, done once the storm has passed.
  151: 'spacewalk',
  // Day 153: low blood sugar after a missed meal.
  153: 'burn',
  158: 'roboticArm',
  // Final correction before arrival, eight days after the second heart attack.
  176: 'burn',
}

/**
 * The main task of a mission day. Days outside the mission follow the routine,
 * so every whole-numbered day has an answer.
 */
export function taskForDay(day: number): MissionTask {
  const slot = (((day - 1) % RHYTHM.length) + RHYTHM.length) % RHYTHM.length
  return TASKS[SCHEDULED[day] ?? RHYTHM[slot]]
}

/** The plan for the whole mission: entry 0 is mission day 1. */
export const MISSION_PLAN: readonly TaskId[] = Array.from(
  { length: MISSION_DAYS },
  (_, i) => taskForDay(i + 1).id,
)

export type VerdictLevel = 'go' | 'caution' | 'no-go'

export const VERDICT_LABEL: Record<VerdictLevel, string> = {
  go: 'Go',
  caution: 'Caution',
  'no-go': 'No-go',
}

export interface ReadinessReason {
  /** The finding behind the reason, `unmeasured:<indicator>` or `recovery:heart`. */
  id: string
  /** What this reason does to the verdict on its own. */
  effect: Exclude<VerdictLevel, 'go'>
  /** The reason in plain words. */
  text: string
  /** The indicator to open for the numbers behind it. */
  metric: MetricId
}

export interface Verdict {
  task: MissionTask
  level: VerdictLevel
  label: string
  /** One sentence that puts the verdict into words. */
  summary: string
  /** Most serious first. Empty when nothing speaks against the task. */
  reasons: ReadinessReason[]
  /** What to do instead. Null when the task can go ahead as planned. */
  alternative: Alternative | null
  /** The indicators the task depends on, all of which were looked at. */
  checked: MetricId[]
}

/**
 * How hard a concern weighs:
 * - `warning`: caution for a task that stands or falls with the demand
 * - `limit`: no-go for such a task, caution where the demand only matters with margin
 * - `block`: no-go for every task with the demand
 */
type Severity = 'warning' | 'limit' | 'block'

interface Concern {
  id: string
  demands: DemandId[]
  severity: Severity
  /** A critical finding stops every task but rest, whatever the task demands. */
  critical: boolean
  /** Caused by the vehicle or by space weather, so a crewmate would face the same. */
  shared: boolean
  /** Calls for care in any work, whatever the task demands. */
  lightDuty?: true
  text: string
  metric: MetricId
}

interface PatternRule {
  demands: DemandId[]
  text: string
  metric: MetricId
  /** Overrides the severity that would follow from the finding's triage level. */
  severity?: Severity
  shared?: true
}

const PATTERN_RULES: Record<string, PatternRule> = {
  // Slowed reactions stop safety-critical work at any level, as the finding's own advice says.
  'pattern:fatigue': {
    demands: ['alertness'],
    text: 'Sleep loss is slowing your reactions',
    metric: 'reactionMs',
    severity: 'limit',
  },
  'pattern:behavioral': {
    demands: ['alertness'],
    text: 'Short sleep with falling mood',
    metric: 'sleepHours',
  },
  'pattern:co2': {
    demands: ['alertness'],
    text: 'Raised cabin CO₂ dulls concentration',
    metric: 'cabinCo2',
    shared: true,
  },
  'pattern:atmosphere': {
    demands: ['alertness', 'heart'],
    text: 'Low blood oxygen with raised cabin CO₂',
    metric: 'spo2',
    shared: true,
  },
  'pattern:cardiac': { demands: ['heart'], text: 'Possible heart attack', metric: 'restingHr' },
  'pattern:infection': {
    demands: ['health'],
    text: 'Possible infection with fever',
    metric: 'bodyTemp',
  },
  'pattern:deconditioning': {
    demands: ['heart'],
    text: 'Heart and muscles are losing condition',
    metric: 'restingHr',
  },
}

/** Indicators whose findings say something about the vehicle, not the person. */
const SHARED_METRICS: MetricId[] = ['cabinCo2', 'radiationDose']

/**
 * Indicators that call for care but never stop a task on their own: a low
 * mood or a week of missed exercise does not make a spacewalk unsafe.
 */
const WARNING_AT_MOST: MetricId[] = ['mood', 'exerciseMin']

/**
 * Resting heart rate that counts as a racing heart. The same line the rule
 * engine draws; its `recentPeak` covers the last 14 days.
 */
const RACING_HEART_BPM = 120

/** Systolic and diastolic are measured together and shown as one indicator. */
const groupOf = (metric: MetricId): MetricId => (metric === 'diastolic' ? 'systolic' : metric)
const groupLabel = (metric: MetricId): string =>
  groupOf(metric) === 'systolic' ? 'Blood pressure' : METRICS[metric].label

/** Concerns with the same key become one line, so blood pressure is never listed twice. */
const lineKey = (concern: Concern): string =>
  concern.id.startsWith('pattern:') ? concern.id : `${concern.id.split(':')[0]}:${groupOf(concern.metric)}`

function driftText(metric: MetricId, delta: number | null): string {
  if (metric === 'reactionMs') return 'Reactions are slower than your baseline'
  return `${groupLabel(metric)} is ${delta !== null && delta < 0 ? 'below' : 'above'} your baseline`
}

/** A single-indicator finding in a few words: the name of its band, or the direction of its drift. */
function lineText(finding: Finding, evaluation: Evaluation): string {
  const a = evaluation.assessments[finding.metrics[0]]
  if (finding.kind === 'drift') return driftText(a.metric, a.delta)
  return finding.kind === 'range' && a.band ? a.band.label : finding.title
}

function concernFor(finding: Finding, evaluation: Evaluation): Concern {
  const critical = finding.status === 'critical'
  const natural: Severity = finding.status === 'watch' ? 'warning' : 'limit'
  const rule = PATTERN_RULES[finding.id]
  if (rule) {
    return {
      id: finding.id,
      demands: rule.demands,
      severity: rule.severity ?? natural,
      critical,
      shared: rule.shared ?? false,
      text: rule.text,
      metric: rule.metric,
    }
  }

  const metric = finding.metrics[0]
  let severity = natural
  if (WARNING_AT_MOST.includes(metric)) severity = 'warning'
  // A reaction time in the slowed range stops tasks that need alertness, even at watch level.
  if (finding.id === 'range:reactionMs') severity = 'limit'
  return {
    id: finding.id,
    // A pattern this file does not know yet counts for every demand its indicators speak to.
    demands: [...new Set(finding.metrics.map((m) => METRIC_DEMAND[m]))],
    severity,
    critical,
    shared: finding.metrics.every((m) => SHARED_METRICS.includes(m)),
    text: lineText(finding, evaluation),
    metric,
  }
}

/** What one concern does to a task, or null when the task does not depend on it. */
function effectOn(task: MissionTask, concern: Concern): ReadinessReason['effect'] | null {
  if (concern.critical) return 'no-go'
  let effect: ReadinessReason['effect'] | null = concern.lightDuty ? 'caution' : null
  for (const demand of concern.demands) {
    const level = task.demands[demand]
    if (!level) continue
    if (concern.severity === 'block' || (concern.severity === 'limit' && level === 'high')) return 'no-go'
    if (concern.severity === 'limit' || level === 'high') effect = 'caution'
  }
  return effect
}

function unmeasuredText(metric: MetricId, daysSince: number | null): string {
  const label = groupLabel(metric)
  if (daysSince === null) return `${label} has never been measured`
  return `${label} last measured ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago`
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Advice for one task, given everything the rule engine found today. */
export function assessReadiness(task: MissionTask, evaluation: Evaluation): Verdict {
  const { findings, assessments } = evaluation
  const checked = DEMAND_IDS.filter((d) => task.demands[d]).flatMap((d) => DEMANDS[d].needs)

  const heart = assessments.restingHr
  // After a racing heart the muscle needs time, even when today's readings look calm again.
  const recovering =
    heart.recentPeak !== null &&
    heart.recentPeak > RACING_HEART_BPM &&
    heart.value !== null &&
    heart.value <= RACING_HEART_BPM

  // A rest day is the one plan that is never wrong.
  if (task.id === 'rest') {
    const critical = findings.some((f) => f.status === 'critical')
    return {
      task,
      level: 'go',
      label: VERDICT_LABEL.go,
      summary: critical
        ? 'Resting is the right plan today. Follow the steps under Findings first.'
        : findings.length > 0 || recovering
          ? 'Resting is the right plan today.'
          : 'A planned day off. Nothing speaks against it.',
      reasons: [],
      alternative: null,
      checked,
    }
  }

  const concerns = findings
    // The recovery itself already explains a heart rate that is still raised.
    .filter((f) => !(recovering && f.kind !== 'pattern' && f.metrics[0] === 'restingHr' && f.status !== 'critical'))
    .map((f) => concernFor(f, evaluation))
  if (recovering) {
    concerns.push({
      id: 'recovery:heart',
      demands: ['heart'],
      severity: 'block',
      critical: false,
      shared: false,
      // Even light work is done with care for as long as the heart recovers.
      lightDuty: true,
      text: 'Racing heart within the last 14 days',
      metric: 'restingHr',
    })
  }

  const remedies = task.remedyFor ?? []
  const helps = concerns.some((c) => remedies.includes(c.id) && !c.critical)
  const counted: { concern: Concern; reason: ReadinessReason }[] = []
  for (const concern of concerns) {
    if (remedies.includes(concern.id) && !concern.critical) continue
    const effect = effectOn(task, concern)
    if (!effect) continue
    const reason = { id: concern.id, effect, text: concern.text, metric: concern.metric }
    const twin = counted.findIndex((c) => lineKey(c.concern) === lineKey(concern))
    if (twin < 0) counted.push({ concern, reason })
    // Of two lines about the same indicator, the more serious one stays.
    else if (effect === 'no-go' && counted[twin].reason.effect === 'caution') counted[twin] = { concern, reason }
  }

  // Unknown is not the same as fine: an out-of-date reading the task depends on gives caution.
  const unmeasured: ReadinessReason[] = []
  for (const metric of checked) {
    const a = assessments[metric]
    if (!a.stale || unmeasured.some((r) => groupOf(r.metric) === groupOf(metric))) continue
    unmeasured.push({
      id: `unmeasured:${groupOf(metric)}`,
      effect: 'caution',
      text: unmeasuredText(metric, a.daysSinceReading),
      metric: groupOf(metric),
    })
  }

  // Within each effect the crew member's own findings lead: they are the ones a swap can answer.
  counted.sort((x, y) => Number(x.concern.shared) - Number(y.concern.shared))
  const blocking = counted.filter((c) => c.reason.effect === 'no-go')
  const reasons = [
    ...blocking.map((c) => c.reason),
    ...counted.filter((c) => c.reason.effect === 'caution').map((c) => c.reason),
    ...unmeasured,
  ]
  const listed = reasons.length === 1 ? 'reason listed' : 'reasons listed'
  const level: VerdictLevel = blocking.length > 0 ? 'no-go' : reasons.length > 0 ? 'caution' : 'go'
  const base = { task, level, label: VERDICT_LABEL[level], reasons, checked }

  if (level === 'go') {
    return {
      ...base,
      summary: helps
        ? 'This session is part of the fix for what the findings show.'
        : findings.length > 0
          ? "Today's findings do not touch what this task demands."
          : "Nothing in today's readings speaks against it.",
      alternative: null,
    }
  }

  if (level === 'caution') {
    if (counted.length === 0) {
      const names = listOf(unmeasured.map((r) => groupLabel(r.metric).toLowerCase()))
      return {
        ...base,
        summary: 'Not enough data to clear you. An out-of-date reading cannot vouch for you.',
        alternative: alternative('measure', `Log a fresh reading of ${names}, then look at this advice again.`),
      }
    }
    return {
      ...base,
      summary: `Possible with care. Settle the ${listed} before you start.`,
      alternative: counted.every((c) => c.concern.shared)
        ? alternative('postpone', 'Do only what cannot wait and leave the rest until conditions are back to normal.')
        : task.ifCaution,
    }
  }

  const critical = blocking.some((c) => c.concern.critical)
  return {
    ...base,
    summary: critical
      ? 'Not advised today. Deal with the critical finding first.'
      : `Not advised today. The ${listed} ${reasons.length === 1 ? 'stands' : 'stand'} in the way.`,
    // Swapping places does not help when the whole crew faces the same cause.
    alternative: blocking.every((c) => c.concern.shared)
      ? alternative('postpone', 'Wait until conditions are back to normal. A crewmate would face the same.')
      : task.ifNoGo,
  }
}

/** Advice for the task on the plan of the evaluated day. */
export function readinessForDay(evaluation: Evaluation): Verdict {
  return assessReadiness(taskForDay(evaluation.day), evaluation)
}
