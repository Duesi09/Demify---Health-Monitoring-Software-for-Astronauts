import { METRICS, METRIC_IDS, classify } from './metrics'
import { changeUnit, formatAverage, formatDelta, formatValue } from './format'
import {
  STATUS_ORDER,
  worst,
  type Evaluation,
  type Finding,
  type MetricAssessment,
  type MetricId,
  type Reading,
  type Reminder,
  type Status,
} from './types'

/** Length of the averaging window, in days. */
const WINDOW = 7
/** Readings needed inside the window before an average is trusted. */
const MIN_WINDOW_READINGS = 2
/** Pre-flight readings needed before a personal baseline is trusted. */
const MIN_BASELINE_READINGS = 3
/** Resting heart rate above which the heart counts as racing. */
const RACING_HEART_BPM = 120
/** Days the heart rate must stay raised before it counts as deconditioning. */
const DECONDITIONING_MIN_DAYS = 7
/** Days after an acute event during which its after-effects are still expected. */
const RECOVERY_DAYS = 14
/** How far back to look when counting how long a drift has lasted. */
const MAX_DRIFT_LOOKBACK = 90

type Series = Map<number, number>

/**
 * Indexes readings by metric and day. When a day has both a simulated and a
 * manual reading, the manual one wins.
 */
export function indexReadings(readings: Reading[]): Record<MetricId, Series> {
  const index = Object.fromEntries(METRIC_IDS.map((id) => [id, new Map()])) as Record<
    MetricId,
    Series
  >
  for (const r of readings) if (r.source === 'simulated') index[r.metric].set(r.day, r.value)
  for (const r of readings) if (r.source === 'manual') index[r.metric].set(r.day, r.value)
  return index
}

function windowMean(series: Series, endDay: number): number | null {
  let sum = 0
  let count = 0
  for (let day = endDay - WINDOW + 1; day <= endDay; day++) {
    const v = series.get(day)
    if (v !== undefined) {
      sum += v
      count++
    }
  }
  return count >= MIN_WINDOW_READINGS ? sum / count : null
}

function baselineOf(series: Series): number | null {
  let sum = 0
  let count = 0
  for (const [day, value] of series) {
    if (day <= 0) {
      sum += value
      count++
    }
  }
  return count >= MIN_BASELINE_READINGS ? sum / count : null
}

function peakOf(series: Series, endDay: number): number | null {
  let peak: number | null = null
  for (let day = endDay - RECOVERY_DAYS + 1; day <= endDay; day++) {
    const v = series.get(day)
    if (v !== undefined && (peak === null || v > peak)) peak = v
  }
  return peak
}

function latestUpTo(series: Series, today: number): { day: number; value: number } | null {
  let best: { day: number; value: number } | null = null
  for (const [day, value] of series) {
    if (day <= today && (best === null || day > best.day)) best = { day, value }
  }
  return best
}

function driftStatusOf(metric: MetricId, delta: number): Status {
  const rule = METRICS[metric].drift
  if (!rule) return 'nominal'
  const concerning =
    rule.direction === 'both' ? Math.abs(delta) : rule.direction === 'up' ? delta : -delta
  // Compare with a tiny tolerance so 36.7 + 0.5 counts as a 0.5 change.
  if (concerning >= rule.act - 1e-9) return 'act'
  if (concerning >= rule.watch - 1e-9) return 'watch'
  return 'nominal'
}

function assessMetric(metric: MetricId, series: Series, today: number): MetricAssessment {
  const def = METRICS[metric]
  const latest = latestUpTo(series, today)
  const baseline = baselineOf(series)
  const daysSinceReading = latest ? today - latest.day : null
  const stale = daysSinceReading === null || daysSinceReading > def.staleAfterDays

  const assessment: MetricAssessment = {
    metric,
    status: 'nominal',
    value: latest?.value ?? null,
    latestDay: latest?.day ?? null,
    daysSinceReading,
    stale,
    band: null,
    baseline,
    recentMean: null,
    delta: null,
    driftStatus: 'nominal',
    driftDays: 0,
    recentPeak: peakOf(series, today),
  }
  // Out-of-date data says nothing about today, so it is not judged.
  if (!latest || stale) return assessment

  const recentMean = windowMean(series, today)
  const judged = def.evaluateOn === 'avg7' ? (recentMean ?? latest.value) : latest.value
  assessment.band = classify(metric, judged)
  assessment.recentMean = recentMean

  // Drift only applies in flight: before launch the baseline is still forming.
  if (today >= 1 && baseline !== null && recentMean !== null && def.drift) {
    assessment.delta = recentMean - baseline
    assessment.driftStatus = driftStatusOf(metric, assessment.delta)
    if (assessment.driftStatus !== 'nominal') {
      const sign = Math.sign(assessment.delta)
      for (let back = 0; back < MAX_DRIFT_LOOKBACK && today - back >= 1; back++) {
        const mean = windowMean(series, today - back)
        if (mean === null) break
        const delta = mean - baseline
        if (Math.sign(delta) !== sign || driftStatusOf(metric, delta) === 'nominal') break
        assessment.driftDays++
      }
    }
  }

  assessment.status = worst(assessment.band.status, assessment.driftStatus)
  return assessment
}

/** At most one finding per indicator: the more urgent of range and drift. */
function metricFinding(a: MetricAssessment): Finding | null {
  const def = METRICS[a.metric]
  const duration = a.driftDays > 1 ? ` for ${a.driftDays} days` : ''
  let range: Finding | null = null
  let drift: Finding | null = null

  if (a.band && a.band.status !== 'nominal' && a.value !== null) {
    const judgedOnAverage = def.evaluateOn === 'avg7' && a.recentMean !== null
    range = {
      id: `range:${a.metric}`,
      kind: 'range',
      status: a.band.status,
      title: `${def.label}: ${a.band.label.toLowerCase()}`,
      detail: judgedOnAverage
        ? `7-day average is ${formatAverage(a.metric, a.recentMean!)} ${def.unit}.`
        : `Latest reading is ${formatValue(a.metric, a.value)} ${def.unit}.`,
      action: a.band.action ?? '',
      metrics: [a.metric],
    }
  }

  if (a.driftStatus !== 'nominal' && a.delta !== null && a.baseline !== null && def.drift) {
    drift = {
      id: `drift:${a.metric}`,
      kind: 'drift',
      status: a.driftStatus,
      title: `${def.label}: ${aboveOrBelow(a.delta)} your pre-flight baseline${duration}`,
      detail: `7-day average is ${formatDelta(a.metric, a.delta)} ${changeUnit(a.metric)} against your baseline of ${formatAverage(a.metric, a.baseline)} ${def.unit}.`,
      action: def.drift.action,
      metrics: [a.metric],
    }
  }

  if (!range || !drift) return range ?? drift
  // Both apply: lead with the more urgent one and keep the other's numbers.
  const driftLeads = worst(range.status, drift.status) !== range.status
  const [lead, other] = driftLeads ? [drift, range] : [range, drift]
  const extra = driftLeads
    ? other.detail
    : `It has been ${aboveOrBelow(a.delta!)} your pre-flight baseline${duration}.`
  return { ...lead, detail: `${lead.detail} ${extra}` }
}

function aboveOrBelow(delta: number): string {
  return delta > 0 ? 'above' : 'below'
}

/**
 * Patterns across several indicators. A combination often says more than any
 * single value, and can point at the cause instead of the symptom.
 */
function patternFindings(a: Record<MetricId, MetricAssessment>): Finding[] {
  const findings: Finding[] = []
  const fresh = (id: MetricId) => !a[id].stale
  const delta = (id: MetricId) => a[id].delta ?? 0

  // A racing heart at rest together with a sharp blood pressure change or low
  // blood oxygen: the measurable side of a possible heart attack.
  const urgent = (id: MetricId) =>
    fresh(id) && (a[id].band?.status === 'act' || a[id].band?.status === 'critical')
  const racing = fresh('restingHr') && a.restingHr.value !== null && a.restingHr.value > RACING_HEART_BPM
  const oxygenLow = fresh('spo2') && a.spo2.band !== null && a.spo2.band.status !== 'nominal'
  if (racing && (urgent('systolic') || urgent('diastolic') || oxygenLow)) {
    findings.push({
      id: 'pattern:cardiac',
      kind: 'pattern',
      status: 'critical',
      title: 'Possible heart attack: racing heart with abnormal blood pressure',
      detail:
        'A resting heart rate above 120 together with a sharp change in blood pressure or low blood oxygen can mean the heart muscle is not getting enough oxygen. Chest pain or pressure, pain spreading to the arm or jaw, shortness of breath, cold sweat or nausea make it likely.',
      action:
        'Stop all activity and call the Crew Medical Officer now. Chew aspirin (160 to 325 mg) unless you are allergic, give oxygen if blood oxygen is low, record an ECG and contact the flight surgeon.',
      metrics: ['restingHr', 'systolic', 'diastolic', 'spo2'],
    })
  }

  // Fever together with a raised heart rate suggests infection.
  if (
    fresh('bodyTemp') &&
    fresh('restingHr') &&
    a.bodyTemp.value !== null &&
    a.bodyTemp.value >= 38 &&
    a.restingHr.value !== null &&
    a.restingHr.baseline !== null &&
    a.restingHr.value - a.restingHr.baseline >= 10
  ) {
    findings.push({
      id: 'pattern:infection',
      kind: 'pattern',
      status: a.bodyTemp.value >= 39.5 ? 'critical' : 'act',
      title: 'Possible infection: fever with a raised heart rate',
      detail:
        'Immune function changes in spaceflight and dormant viruses can reactivate, so infections can take hold more easily than on Earth.',
      action:
        'Rest, drink fluids and re-measure temperature every 4 hours. Tell the Crew Medical Officer, log all symptoms and limit close contact with crewmates.',
      metrics: ['bodyTemp', 'restingHr'],
    })
  }

  const sleepLow = fresh('sleepHours') && a.sleepHours.status !== 'nominal' && delta('sleepHours') < 0
  const moodLow = fresh('mood') && (a.mood.status !== 'nominal' || delta('mood') <= -0.75)

  const co2High = fresh('cabinCo2') && a.cabinCo2.status !== 'nominal'
  // Counts a drop against the personal baseline as well as a low reading.
  const oxygenDown = fresh('spo2') && a.spo2.status !== 'nominal'

  // Low blood oxygen while cabin CO₂ is raised: the air is failing, not the person.
  if (co2High && oxygenDown) {
    const status = worst(a.cabinCo2.status, a.spo2.status) as Finding['status']
    findings.push({
      id: 'pattern:atmosphere',
      kind: 'pattern',
      status,
      title: 'Low blood oxygen with raised cabin CO₂',
      detail:
        'Your oxygen saturation is down while cabin CO₂ is up. Both together point to the cabin air, not to an illness of your own.',
      action:
        status === 'critical'
          ? 'Treat as a life-support fault. Use supplemental oxygen if available, move to another module and follow the cabin atmosphere procedure. Alert the crew and contact mission control and the flight surgeon.'
          : 'Check the cabin atmosphere readings and the airflow where you are. Re-measure your oxygen saturation in 15 minutes and tell the Crew Medical Officer.',
      metrics: ['cabinCo2', 'spo2'],
    })
  }

  // High cabin CO₂ alongside poor sleep or mood: fix the air before the symptoms.
  if (co2High && (sleepLow || moodLow)) {
    findings.push({
      id: 'pattern:co2',
      kind: 'pattern',
      status: worst(a.cabinCo2.status, 'watch') as Finding['status'],
      title: 'Symptoms may come from the cabin air',
      detail:
        'Cabin CO₂ is raised while your sleep or mood is down. Raised CO₂ is linked to headaches, poor sleep and trouble concentrating.',
      action:
        'Check the CO₂ removal system and the airflow in your sleep station before treating the symptoms themselves.',
      metrics: ['cabinCo2', 'sleepHours', 'mood'],
    })
  }

  // Lost sleep together with falling mood is a behavioural-health warning.
  if (sleepLow && moodLow) {
    const severe = a.sleepHours.status === 'act' && a.mood.status !== 'nominal'
    findings.push({
      id: 'pattern:behavioral',
      kind: 'pattern',
      status: severe ? 'act' : 'watch',
      title: 'Sleep loss together with falling mood',
      detail:
        'Short sleep and low mood feed each other, and both reduce attention and judgement during critical tasks.',
      action: severe
        ? 'Talk to the Crew Medical Officer today. Ask ground to lighten the schedule and protect your sleep period.'
        : 'Protect your sleep period for the next three nights and plan time to recover. If there is no improvement, talk to the Crew Medical Officer.',
      metrics: ['sleepHours', 'mood'],
    })
  }

  // Short sleep with slowed reactions: tiredness is already costing performance.
  const reactionsSlow = fresh('reactionMs') && a.reactionMs.status !== 'nominal'
  if (sleepLow && reactionsSlow) {
    findings.push({
      id: 'pattern:fatigue',
      kind: 'pattern',
      status: worst(a.sleepHours.status, a.reactionMs.status) as Finding['status'],
      title: 'Sleep loss is slowing your reactions',
      detail: 'Short sleep and slower reactions together raise the risk of errors in critical tasks.',
      action:
        'Do not start safety-critical tasks today (spacewalk, piloting, robotic arm) if they can wait. Protect your sleep period tonight and test again tomorrow.',
      metrics: ['sleepHours', 'reactionMs'],
    })
  }

  // A recent fever already explains both the missed exercise and the raised pulse.
  const feverish = fresh('bodyTemp') && a.bodyTemp.status !== 'nominal'
  // After a racing heart, rest is the treatment; advising exercise would be wrong.
  const heartRecovering = a.restingHr.recentPeak !== null && a.restingHr.recentPeak > RACING_HEART_BPM

  // Too little exercise together with a rising heart rate: deconditioning.
  if (
    !feverish &&
    !heartRecovering &&
    fresh('exerciseMin') &&
    fresh('restingHr') &&
    a.exerciseMin.status !== 'nominal' &&
    a.restingHr.driftStatus !== 'nominal' &&
    // Deconditioning builds over weeks; a short spike has another cause.
    a.restingHr.driftDays >= DECONDITIONING_MIN_DAYS
  ) {
    findings.push({
      id: 'pattern:deconditioning',
      kind: 'pattern',
      status: worst(a.exerciseMin.status, a.restingHr.driftStatus) as Finding['status'],
      title: 'Cardiovascular deconditioning pattern',
      detail:
        'Your exercise is below target while your resting heart rate climbs. Without loading, heart, muscle and bone lose capacity week by week.',
      action:
        'Restore daily exercise as the priority. If equipment is unavailable, agree a replacement programme with the Crew Medical Officer and ground.',
      metrics: ['exerciseMin', 'restingHr'],
    })
  }

  return findings
}

/** Assesses every indicator as of `today` and derives the overall triage level. */
export function evaluate(readings: Reading[], today: number): Evaluation {
  return evaluateIndexed(indexReadings(readings), today)
}

/** Same as `evaluate`, for callers that already hold the index. */
export function evaluateIndexed(index: Record<MetricId, Series>, today: number): Evaluation {
  const assessments = Object.fromEntries(
    METRIC_IDS.map((id) => [id, assessMetric(id, index[id], today)]),
  ) as Record<MetricId, MetricAssessment>

  const patterns = patternFindings(assessments)
  // A pattern already explains its indicators, so a single-indicator finding
  // is only listed when it is more urgent than every pattern covering it.
  const explained = (f: Finding) =>
    patterns.some(
      (p) => p.metrics.includes(f.metrics[0]) && worst(p.status, f.status) === p.status,
    )
  const findings = [
    ...patterns,
    ...METRIC_IDS.map((id) => metricFinding(assessments[id])).filter(
      (f): f is Finding => f !== null && !explained(f),
    ),
  ]
  // Most urgent first; within a level, patterns come before single values.
  findings.sort((x, y) => STATUS_ORDER.indexOf(y.status) - STATUS_ORDER.indexOf(x.status))

  const reminders: Reminder[] = METRIC_IDS.filter((id) => assessments[id].stale).map((id) => ({
    metric: id,
    daysSinceReading: assessments[id].daysSinceReading,
  }))

  const status = findings.reduce<Status>((s, f) => worst(s, f.status), 'nominal')
  return { day: today, status, assessments, findings, reminders }
}

/** The overall triage level of every mission day from 1 to `days`. */
export function missionStatuses(index: Record<MetricId, Series>, days: number): Status[] {
  return Array.from({ length: days }, (_, i) => evaluateIndexed(index, i + 1).status)
}
