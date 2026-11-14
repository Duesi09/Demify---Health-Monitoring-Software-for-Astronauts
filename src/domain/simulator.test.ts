import { describe, expect, it } from 'vitest'
import { evaluate } from './engine'
import { METRICS, METRIC_IDS } from './metrics'
import { HEART_ATTACK_DAYS, MISSION_DAYS, simulateMission } from './simulator'

const readings = simulateMission()
const idsOn = (day: number) => evaluate(readings, day).findings.map((f) => f.id)

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

  it('contains a solar particle event on days 23 to 25 and background radiation otherwise', () => {
    expect(evaluate(readings, 22).assessments.radiationDose.status).toBe('nominal')
    expect(evaluate(readings, 23).assessments.radiationDose.status).toBe('watch')
    expect(evaluate(readings, 24).assessments.radiationDose.status).toBe('act')
    expect(idsOn(24)).toContain('range:radiationDose')
    expect(evaluate(readings, 25).assessments.radiationDose.status).toBe('watch')
    expect(evaluate(readings, 26).assessments.radiationDose.status).toBe('nominal')
  })

  it('stays well inside the career limit over the whole mission', () => {
    const { missionDose } = evaluate(readings, MISSION_DAYS).radiation
    // About 1.8 mSv a day for 180 days plus the storm.
    expect(missionDose).toBeGreaterThan(300)
    expect(missionDose).toBeLessThan(380)
    expect(idsOn(MISSION_DAYS)).not.toContain('limit:radiationCareer')
  })

  it('records no dose before launch', () => {
    const before = readings.filter((r) => r.metric === 'radiationDose' && r.day < 1)
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((r) => r.value === 0)).toBe(true)
  })
})
