import type { HazardId } from './hazards'

export type MetricId =
  | 'restingHr'
  | 'systolic'
  | 'diastolic'
  | 'glucose'
  | 'bodyTemp'
  | 'spo2'
  | 'sleepHours'
  | 'mood'
  | 'exerciseMin'
  | 'cabinCo2'

/** Triage levels, in rising order of urgency. */
export type Status = 'nominal' | 'watch' | 'act' | 'critical'

export const STATUS_ORDER: readonly Status[] = ['nominal', 'watch', 'act', 'critical']

export function worst(a: Status, b: Status): Status {
  return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b
}

/**
 * One measurement. `day` is the mission day: 1 is the first day in flight,
 * 0 and below are pre-flight days used to build the personal baseline.
 */
export interface Reading {
  day: number
  metric: MetricId
  value: number
  source: 'simulated' | 'manual'
}

/** A value range and what it means. Bands are listed from lowest to highest. */
export interface Band {
  /** Exclusive upper bound of the band; the last band uses Infinity. */
  below: number
  status: Status
  label: string
  /** What to do when a reading falls in this band (omitted for nominal bands). */
  action?: string
}

export interface DriftRule {
  /** Which direction of change from the personal baseline is a concern. */
  direction: 'up' | 'down' | 'both'
  /** Change of the 7-day average that warrants watching, in the metric's unit. */
  watch: number
  /** Change that warrants consulting the Crew Medical Officer. */
  act: number
  action: string
}

export interface MetricDef {
  id: MetricId
  label: string
  unit: string
  decimals: number
  /** Judge the latest reading, or the 7-day average (for habits like sleep). */
  evaluateOn: 'latest' | 'avg7'
  bands: Band[]
  drift?: DriftRule
  /** Days without a reading before the value counts as out of date. */
  staleAfterDays: number
  /** Hard plausibility limits for manual entry; values outside are typos. */
  inputMin: number
  inputMax: number
  inputStep: number
  /** Value range drawn on the range bar, wide enough to show every band. */
  scale: [number, number]
  /** The NASA spaceflight hazard that drives this indicator. */
  hazard: HazardId
  /** The matching NASA human spaceflight risk, by the short name of NASA's page for it. */
  nasaRisk?: string
  whyInSpace: string
  howToMeasure: string
  /** Where the reference ranges come from. */
  reference: string
}

export interface MetricAssessment {
  metric: MetricId
  /** Combined status of the range check and the baseline-drift check. */
  status: Status
  /** Latest reading, for display. */
  value: number | null
  latestDay: number | null
  daysSinceReading: number | null
  /** True when the latest reading is too old to judge today's health. */
  stale: boolean
  band: Band | null
  /** Personal pre-flight average. */
  baseline: number | null
  /** Average of the last 7 days. */
  recentMean: number | null
  /** recentMean minus baseline. */
  delta: number | null
  driftStatus: Status
  /** Consecutive days, ending today, the 7-day average has been off baseline. */
  driftDays: number
  /** Highest reading of the last two weeks, to recognise a recent acute event. */
  recentPeak: number | null
}

export interface Finding {
  id: string
  kind: 'range' | 'drift' | 'pattern'
  status: Exclude<Status, 'nominal'>
  title: string
  detail: string
  action: string
  metrics: MetricId[]
}

export interface Reminder {
  metric: MetricId
  /** null when the metric has never been measured. */
  daysSinceReading: number | null
}

export interface Evaluation {
  day: number
  status: Status
  assessments: Record<MetricId, MetricAssessment>
  /** Sorted most urgent first. */
  findings: Finding[]
  reminders: Reminder[]
}
