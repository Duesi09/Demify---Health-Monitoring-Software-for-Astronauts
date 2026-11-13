import { describe, expect, it } from 'vitest'
import { BODY_REGIONS, regionForMetric, regionStatus } from './bodyRegions'
import { evaluate } from './engine'
import { hasRiskPage } from './hazards'
import { METRICS, METRIC_IDS } from './metrics'
import { simulateMission } from './simulator'
import type { Reading } from './types'

const region = (id: string) => BODY_REGIONS.find((r) => r.id === id)!
const mission = simulateMission()

describe('body regions', () => {
  it('assigns every indicator to exactly one region', () => {
    for (const id of METRIC_IDS) {
      expect(BODY_REGIONS.filter((r) => r.metrics.includes(id)), id).toHaveLength(1)
      expect(regionForMetric(id).metrics).toContain(id)
    }
  })

  it('links every cited NASA risk to its own page', () => {
    const cited = [...BODY_REGIONS.map((r) => r.nasaRisk), ...METRIC_IDS.map((id) => METRICS[id].nasaRisk)]
    for (const risk of cited) if (risk) expect(hasRiskPage(risk), risk).toBe(true)
  })

  it('is nominal everywhere on an uneventful day', () => {
    const evaluation = evaluate(mission, 20)
    for (const r of BODY_REGIONS.filter((r) => r.metrics.length > 0)) {
      expect(regionStatus(r, evaluation), r.id).toBe('nominal')
    }
  })

  it('marks a region without indicators as unmonitored', () => {
    for (const id of ['eyes', 'balance', 'kidneys']) {
      expect(regionStatus(region(id), evaluate(mission, 20)), id).toBe('unmonitored')
    }
  })

  it('takes the worst status of its indicators', () => {
    const readings: Reading[] = [...mission, { day: 20, metric: 'spo2', value: 88, source: 'manual' }]
    expect(regionStatus(region('lungs'), evaluate(readings, 20))).toBe('critical')
  })

  it('shows the infection on both the immune system and the heart', () => {
    const evaluation = evaluate(mission, 74)
    expect(regionStatus(region('immune'), evaluation)).toBe('act')
    expect(regionStatus(region('heart'), evaluation)).toBe('act')
    expect(regionStatus(region('metabolism'), evaluation)).toBe('nominal')
  })

  it('turns the heart and lungs critical during the simulated heart attack', () => {
    const evaluation = evaluate(mission, 97)
    expect(regionStatus(region('heart'), evaluation)).toBe('critical')
    expect(regionStatus(region('lungs'), evaluation)).toBe('critical')
  })

  it('is stale when none of its indicators has a recent reading', () => {
    // Blood pressure is not measured on days 86 to 90, but heart rate still is.
    expect(regionStatus(region('heart'), evaluate(mission, 90))).toBe('nominal')
    const withoutSleepAndMood = mission.filter((r) => r.metric !== 'sleepHours' && r.metric !== 'mood')
    expect(regionStatus(region('brain'), evaluate(withoutSleepAndMood, 20))).toBe('stale')
  })
})
