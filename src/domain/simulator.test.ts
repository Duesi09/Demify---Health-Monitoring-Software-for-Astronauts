import { describe, expect, it } from 'vitest'
import { evaluate } from './engine'
import { METRICS, METRIC_IDS } from './metrics'
import { MISSION_DAYS, simulateMission } from './simulator'

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
    expect(evaluate(readings, 90).reminders.map((r) => r.metric)).toContain('systolic')
  })

  it('recovers after each event', () => {
    expect(idsOn(60).filter((id) => id.startsWith('pattern:'))).toEqual([])
    expect(idsOn(95).filter((id) => id.startsWith('pattern:'))).toEqual([])
    expect(idsOn(MISSION_DAYS).filter((id) => id.startsWith('pattern:'))).toEqual([])
  })
})
