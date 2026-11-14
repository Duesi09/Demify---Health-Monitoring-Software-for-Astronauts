import { describe, expect, it } from 'vitest'
import { evaluate } from './engine'
import { METRICS, METRIC_IDS } from './metrics'
import { HEART_ATTACK_DAYS, MISSION_DAYS, SOLAR_EVENT_DAYS, simulateMission } from './simulator'
import type { MetricId, Reading } from './types'

const readings = simulateMission()
const idsOn = (day: number) => evaluate(readings, day).findings.map((f) => f.id)
const valueOn = (metric: MetricId, day: number) => readings.find((r) => r.metric === metric && r.day === day)!.value

/** The indicators of the first release, whose simulated values are pinned below. */
const FIRST_TEN: MetricId[] = [
  'restingHr',
  'systolic',
  'diastolic',
  'glucose',
  'bodyTemp',
  'spo2',
  'sleepHours',
  'mood',
  'exerciseMin',
  'cabinCo2',
]

/** A short fingerprint (FNV-1a) of the day, indicator and value of every reading, in order. */
function checksum(log: Reading[]): string {
  let hash = 0x811c9dc5
  for (const r of log) {
    const text = `${r.day}:${r.metric}:${r.value};`
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  }
  return hash.toString(16)
}

describe('simulateMission', () => {
  it('is repeatable for the same seed', () => {
    expect(simulateMission(7)).toEqual(simulateMission(7))
    expect(simulateMission(7)).not.toEqual(simulateMission(8))
  })

  it('only produces values a crew member could enter by hand', () => {
    for (const r of readings) {
      const def = METRICS[r.metric]
      expect(r.value, `${r.metric} on day ${r.day}`).toBeGreaterThanOrEqual(def.inputMin)
      expect(r.value, `${r.metric} on day ${r.day}`).toBeLessThanOrEqual(def.inputMax)
    }
  })

  it('gives every indicator a pre-flight baseline', () => {
    const result = evaluate(readings, 1)
    for (const id of METRIC_IDS) expect(result.assessments[id].baseline, id).not.toBeNull()
  })

  it('is mostly quiet on an uneventful day', () => {
    const result = evaluate(readings, 20)
    expect(['nominal', 'watch']).toContain(result.status)
    expect(result.findings.filter((f) => f.kind === 'pattern')).toEqual([])
  })

  it('contains the scripted events for the monitoring logic to find', () => {
    expect(idsOn(42)).toContain('pattern:behavioral')
    expect(idsOn(42)).toContain('pattern:co2')
    expect(idsOn(74)).toContain('pattern:infection')
    expect(idsOn(130)).toContain('pattern:deconditioning')
    expect(idsOn(153)).toContain('range:glucose')
    for (const day of HEART_ATTACK_DAYS) {
      expect(idsOn(day), `day ${day}`).toContain('pattern:cardiac')
      expect(evaluate(readings, day).status).toBe('critical')
    }
    expect(evaluate(readings, 90).reminders.map((r) => r.metric)).toContain('systolic')
  })

  it('reaches the highest triage level during the life-support fault', () => {
    const result = evaluate(readings, 56)
    expect(result.status).toBe('critical')
    expect(result.findings[0].id).toBe('pattern:atmosphere')
    for (const day of [55, 57]) expect(evaluate(readings, day).status, `day ${day}`).toBe('critical')
    // The cabin air is blamed, not the heart.
    for (let day = 54; day <= 58; day++) expect(idsOn(day), `day ${day}`).not.toContain('pattern:cardiac')
  })

  it('does not mistake the tail of the infection for deconditioning', () => {
    for (let day = 70; day <= 85; day++) {
      expect(idsOn(day), `day ${day}`).not.toContain('pattern:deconditioning')
    }
  })

  it('does not call the recovery from a heart attack deconditioning', () => {
    for (const attack of HEART_ATTACK_DAYS) {
      for (let day = attack; day <= Math.min(attack + 13, MISSION_DAYS); day++) {
        expect(idsOn(day), `day ${day}`).not.toContain('pattern:deconditioning')
      }
    }
    expect(idsOn(130)).toContain('pattern:deconditioning')
  })

  it('recovers after each event', () => {
    expect(idsOn(60).filter((id) => id.startsWith('pattern:'))).toEqual([])
    expect(idsOn(95).filter((id) => id.startsWith('pattern:'))).toEqual([])
    expect(idsOn(MISSION_DAYS).filter((id) => id.startsWith('pattern:'))).toEqual([])
  })

  it('keeps the values of the first ten indicators when an indicator is added', () => {
    // Fingerprints taken before radiation dose and reaction time existed. A new
    // indicator must draw from a stream of its own and leave these untouched.
    const firstTen = (log: Reading[]) => log.filter((r) => FIRST_TEN.includes(r.metric))
    expect(firstTen(readings)).toHaveLength(1801)
    expect(checksum(firstTen(readings))).toBe('9eae03f1')
    expect(checksum(firstTen(simulateMission(7)))).toBe('4e2d8c85')
  })

  it('measures the deep-space background dose from launch day on', () => {
    for (let day = -13; day <= 0; day++) expect(valueOn('radiationDose', day), `day ${day}`).toBeLessThan(0.1)
    for (let day = 1; day <= MISSION_DAYS; day++) {
      if (SOLAR_EVENT_DAYS.includes(day)) continue
      expect(valueOn('radiationDose', day), `day ${day}`).toBeGreaterThanOrEqual(1.5)
      expect(valueOn('radiationDose', day), `day ${day}`).toBeLessThanOrEqual(2.1)
    }
  })

  it('contains a solar particle event that calls for the storm shelter on two days', () => {
    const [first, second] = SOLAR_EVENT_DAYS
    expect(valueOn('radiationDose', first)).toBeGreaterThan(38)
    expect(valueOn('radiationDose', first)).toBeLessThan(46)
    expect(valueOn('radiationDose', second)).toBeGreaterThan(12)
    expect(valueOn('radiationDose', second)).toBeLessThan(18)
    for (const day of SOLAR_EVENT_DAYS) {
      const result = evaluate(readings, day)
      expect(result.status, `day ${day}`).toBe('act')
      expect(result.findings.map((f) => f.id), `day ${day}`).toEqual(['range:radiationDose'])
      expect(result.findings[0].action).toContain('storm shelter')
    }
    // Quiet the day before, and back to normal the day after.
    for (const day of [first - 1, second + 1]) {
      expect(evaluate(readings, day).status, `day ${day}`).toBe('nominal')
    }
  })

  it('slows reactions during the heavy workload, so fatigue is found next to the other patterns', () => {
    expect(idsOn(42)).toContain('pattern:fatigue')
    expect(idsOn(42)).toContain('pattern:behavioral')
    expect(idsOn(42)).toContain('pattern:co2')
    const reaction = evaluate(readings, 42).assessments.reactionMs
    // Still inside the normal range: only the personal baseline shows the slowing.
    expect(reaction.band?.status).toBe('nominal')
    expect(reaction.driftStatus).toBe('watch')
  })

  it('slows reactions clearly during the life-support fault, the infection and the heart attacks', () => {
    const usual = valueOn('reactionMs', 20)
    for (const day of [56, 74, ...HEART_ATTACK_DAYS]) {
      expect(valueOn('reactionMs', day) - usual, `day ${day}`).toBeGreaterThan(60)
      expect(evaluate(readings, day).assessments.reactionMs.status, `day ${day}`).not.toBe('nominal')
    }
  })

  it('keeps the new indicators quiet outside the scripted events', () => {
    // Each event, with the week the 7-day average needs to forget it.
    const eventWindows = [
      [28, 53],
      [54, 65],
      [70, 84],
      ...HEART_ATTACK_DAYS.map((day) => [day, day + 13]),
    ]
    const inEvent = (day: number) => eventWindows.some(([from, to]) => day >= from && day <= to)
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const { assessments, findings } = evaluate(readings, day)
      if (!SOLAR_EVENT_DAYS.includes(day)) {
        expect(assessments.radiationDose.status, `radiation dose on day ${day}`).toBe('nominal')
      }
      if (!inEvent(day)) {
        expect(assessments.reactionMs.status, `reaction time on day ${day}`).toBe('nominal')
        expect(findings.map((f) => f.id), `day ${day}`).not.toContain('pattern:fatigue')
      }
    }
  })

  it('changes the overall status of no day except the two days of the solar particle event', () => {
    // Days per status before the two indicators were added: 79 nominal, 26 watch, 70 act, 5 critical.
    const counts = { nominal: 0, watch: 0, act: 0, critical: 0 }
    for (let day = 1; day <= MISSION_DAYS; day++) counts[evaluate(readings, day).status]++
    expect(counts).toEqual({ nominal: 77, watch: 26, act: 72, critical: 5 })
  })
})
