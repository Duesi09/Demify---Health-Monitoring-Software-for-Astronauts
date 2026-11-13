import { describe, expect, it } from 'vitest'
import { evaluate, indexReadings, missionStatuses } from './engine'
import { classify } from './metrics'
import type { MetricId, Reading } from './types'

/** Builds a log: a flat pre-flight baseline, then the given in-flight values. */
function log(metric: MetricId, baseline: number, inFlight: (number | null)[]): Reading[] {
  const readings: Reading[] = []
  for (let day = -13; day <= 0; day++) readings.push({ day, metric, value: baseline, source: 'simulated' })
  inFlight.forEach((value, i) => {
    if (value !== null) readings.push({ day: i + 1, metric, value, source: 'simulated' })
  })
  return readings
}

const days = (n: number, value: number) => Array<number>(n).fill(value)

describe('range bands', () => {
  it('classifies blood pressure by the ACC/AHA categories', () => {
    expect(classify('systolic', 119).status).toBe('nominal')
    expect(classify('systolic', 120).status).toBe('watch')
    expect(classify('systolic', 140).status).toBe('act')
    expect(classify('systolic', 180).status).toBe('critical')
    expect(classify('systolic', 89).status).toBe('act')
  })

  it('classifies fasting blood sugar including both hypoglycaemia levels', () => {
    expect(classify('glucose', 53).status).toBe('critical')
    expect(classify('glucose', 69).status).toBe('act')
    expect(classify('glucose', 70).status).toBe('nominal')
    expect(classify('glucose', 100).status).toBe('watch')
    expect(classify('glucose', 126).status).toBe('act')
  })

  it('treats 38.0 °C as fever and 89% oxygen as critical', () => {
    expect(classify('bodyTemp', 37.9).status).toBe('watch')
    expect(classify('bodyTemp', 38).status).toBe('act')
    expect(classify('spo2', 89).status).toBe('critical')
    expect(classify('spo2', 95).status).toBe('nominal')
  })
})

describe('evaluate', () => {
  it('reports nominal when every value sits at baseline', () => {
    const result = evaluate(log('restingHr', 58, days(20, 58)), 20)
    expect(result.assessments.restingHr.status).toBe('nominal')
    expect(result.findings).toEqual([])
    expect(result.status).toBe('nominal')
  })

  it('flags a value inside the normal range that has drifted from the personal baseline', () => {
    // 67 bpm is textbook-normal, but 9 above this person's 58.
    const result = evaluate(log('restingHr', 58, [...days(10, 58), ...days(12, 67)]), 22)
    const a = result.assessments.restingHr
    expect(a.band?.status).toBe('nominal')
    expect(a.driftStatus).toBe('watch')
    expect(a.delta).toBeCloseTo(9)
    expect(result.findings[0].id).toBe('drift:restingHr')
  })

  it('counts how many days a drift has lasted', () => {
    // The 7-day average crosses +8 once 7 of the 7 window days are at 67,
    // i.e. on the 7th raised day (day 17), so by day 22 it has lasted 6 days.
    const result = evaluate(log('restingHr', 58, [...days(10, 58), ...days(12, 67)]), 22)
    expect(result.assessments.restingHr.driftDays).toBe(6)
    expect(result.findings[0].title).toContain('for 6 days')
  })

  it('ignores drift in the unconcerning direction', () => {
    const result = evaluate(log('restingHr', 58, days(20, 50)), 20)
    expect(result.assessments.restingHr.driftStatus).toBe('nominal')
  })

  it('judges sleep on the 7-day average, not a single night', () => {
    const oneBadNight = evaluate(log('sleepHours', 7.5, [...days(9, 7.5), 3]), 10)
    expect(oneBadNight.assessments.sleepHours.band?.status).toBe('nominal')
    const badWeek = evaluate(log('sleepHours', 7.5, [...days(3, 7.5), ...days(7, 5)]), 10)
    expect(badWeek.assessments.sleepHours.band?.status).toBe('act')
  })

  it('merges range and drift into a single finding per indicator', () => {
    const result = evaluate(log('sleepHours', 7.5, days(10, 5)), 10)
    const sleepFindings = result.findings.filter((f) => f.metrics.includes('sleepHours'))
    expect(sleepFindings).toHaveLength(1)
    expect(sleepFindings[0].detail).toContain('below your pre-flight baseline')
  })

  it('does not judge out-of-date readings and asks for a new measurement', () => {
    // A critical reading on day 5, then nothing for 10 days.
    const result = evaluate(log('spo2', 98, [...days(4, 98), 85]), 15)
    expect(result.assessments.spo2.stale).toBe(true)
    expect(result.assessments.spo2.status).toBe('nominal')
    expect(result.findings).toEqual([])
    expect(result.reminders).toContainEqual({ metric: 'spo2', daysSinceReading: 10 })
  })

  it('lets a manual reading override the simulated one for the same day', () => {
    const readings = log('bodyTemp', 36.7, days(5, 36.7))
    readings.push({ day: 5, metric: 'bodyTemp', value: 39.6, source: 'manual' })
    const result = evaluate(readings, 5)
    expect(result.assessments.bodyTemp.value).toBe(39.6)
    expect(result.status).toBe('critical')
  })

  it('only sees readings up to the evaluated day', () => {
    const result = evaluate(log('bodyTemp', 36.7, [...days(5, 36.7), 39.6]), 5)
    expect(result.assessments.bodyTemp.value).toBe(36.7)
  })
})

describe('patterns across indicators', () => {
  it('recognises fever with a raised heart rate as possible infection', () => {
    const readings = [
      ...log('bodyTemp', 36.7, [...days(5, 36.8), 38.4]),
      ...log('restingHr', 58, [...days(5, 60), 74]),
    ]
    const result = evaluate(readings, 6)
    expect(result.findings[0].id).toBe('pattern:infection')
    expect(result.status).toBe('act')
  })

  it('recognises a racing heart with a blood pressure spike as a possible heart attack', () => {
    const readings = [
      ...log('restingHr', 58, [...days(5, 60), 128]),
      ...log('systolic', 116, [...days(5, 114), 166]),
      ...log('diastolic', 74, [...days(5, 73), 101]),
    ]
    const result = evaluate(readings, 6)
    expect(result.findings[0].id).toBe('pattern:cardiac')
    expect(result.status).toBe('critical')
    // The pattern explains the single readings, so they are not listed again.
    expect(result.findings.map((f) => f.id)).toEqual(['pattern:cardiac'])
  })

  it('also recognises it from a racing heart with low blood oxygen', () => {
    const readings = [
      ...log('restingHr', 58, [...days(5, 60), 128]),
      ...log('spo2', 98, [...days(5, 98), 91]),
    ]
    expect(evaluate(readings, 6).findings[0].id).toBe('pattern:cardiac')
  })

  it('does not call a fast heart alone a heart attack', () => {
    const readings = [
      ...log('restingHr', 58, [...days(5, 60), 128]),
      ...log('systolic', 116, days(6, 114)),
      ...log('spo2', 98, days(6, 98)),
    ]
    const ids = evaluate(readings, 6).findings.map((f) => f.id)
    expect(ids).not.toContain('pattern:cardiac')
    expect(ids).toContain('range:restingHr')
  })

  it('does not call a fever alone an infection pattern', () => {
    const readings = [
      ...log('bodyTemp', 36.7, [...days(5, 36.8), 38.4]),
      ...log('restingHr', 58, days(6, 60)),
    ]
    const ids = evaluate(readings, 6).findings.map((f) => f.id)
    expect(ids).not.toContain('pattern:infection')
    expect(ids).toContain('range:bodyTemp')
  })

  it('points at cabin air when CO₂ is raised and sleep is down', () => {
    const readings = [
      ...log('cabinCo2', 0.4, days(10, 3.6)),
      ...log('sleepHours', 7.5, days(10, 5.8)),
    ]
    const ids = evaluate(readings, 10).findings.map((f) => f.id)
    expect(ids).toContain('pattern:co2')
  })

  it('drops single-indicator findings that a pattern already explains', () => {
    const readings = [
      ...log('bodyTemp', 36.7, [...days(5, 36.8), 38.4]),
      ...log('restingHr', 58, [...days(5, 60), 74]),
    ]
    const ids = evaluate(readings, 6).findings.map((f) => f.id)
    expect(ids).toEqual(['pattern:infection'])
  })

  it('keeps a single-indicator finding that is more urgent than its pattern', () => {
    const readings = [
      ...log('cabinCo2', 0.4, days(10, 3.6)),
      ...log('sleepHours', 7.5, days(10, 5)),
    ]
    const result = evaluate(readings, 10)
    expect(result.findings.find((f) => f.id === 'pattern:co2')?.status).toBe('watch')
    expect(result.findings.map((f) => f.id)).toContain('range:sleepHours')
  })

  it('reads low blood oxygen with raised cabin CO₂ as a cabin-air problem', () => {
    const readings = [
      ...log('cabinCo2', 0.4, days(10, 3.6)),
      ...log('spo2', 98, [...days(9, 98), 93]),
    ]
    const result = evaluate(readings, 10)
    // The pattern replaces the two single-indicator findings it explains.
    expect(result.findings.map((f) => f.id)).toEqual(['pattern:atmosphere'])
    expect(result.findings[0].metrics).toEqual(['cabinCo2', 'spo2'])
    expect(result.status).toBe('watch')
  })

  it('does not blame the cabin air for raised CO₂ alone', () => {
    const readings = [
      ...log('cabinCo2', 0.4, days(10, 3.6)),
      ...log('spo2', 98, days(10, 98)),
    ]
    const ids = evaluate(readings, 10).findings.map((f) => f.id)
    expect(ids).not.toContain('pattern:atmosphere')
    expect(ids).toContain('range:cabinCo2')
  })

  it('makes the cabin-air pattern critical when either reading is critical', () => {
    const lowOxygen = evaluate(
      [...log('cabinCo2', 0.4, days(10, 3.6)), ...log('spo2', 98, [...days(9, 98), 88])],
      10,
    )
    expect(lowOxygen.findings[0].id).toBe('pattern:atmosphere')
    expect(lowOxygen.findings[0].status).toBe('critical')
    expect(lowOxygen.findings[0].action).toContain('life-support fault')
    expect(lowOxygen.status).toBe('critical')

    const highCo2 = evaluate(
      [...log('cabinCo2', 0.4, [...days(9, 2.4), 5.5]), ...log('spo2', 98, [...days(9, 98), 93])],
      10,
    )
    expect(highCo2.findings[0].id).toBe('pattern:atmosphere')
    expect(highCo2.findings[0].status).toBe('critical')
  })

  it('does not read the recovery after a racing heart as deconditioning', () => {
    // Day 11: the heart races. Afterwards exercise stays low and the pulse raised.
    const readings = [
      ...log('exerciseMin', 60, [...days(10, 120), ...days(12, 20)]),
      ...log('restingHr', 58, [...days(10, 58), 128, ...days(11, 80)]),
    ]
    expect(evaluate(readings, 22).findings.map((f) => f.id)).not.toContain('pattern:deconditioning')
    // Three weeks later the same picture is no longer explained by that event.
    const later = [
      ...log('exerciseMin', 60, [...days(10, 120), ...days(30, 20)]),
      ...log('restingHr', 58, [...days(10, 58), 128, ...days(29, 80)]),
    ]
    expect(evaluate(later, 40).findings.map((f) => f.id)).toContain('pattern:deconditioning')
  })

  it('does not read a few days of raised heart rate as deconditioning', () => {
    const readings = [
      ...log('exerciseMin', 60, [...days(10, 120), ...days(7, 20)]),
      ...log('restingHr', 58, [...days(10, 58), ...days(7, 80)]),
    ]
    const ids = evaluate(readings, 17).findings.map((f) => f.id)
    expect(ids).not.toContain('pattern:deconditioning')
  })

  it('links low exercise and a climbing heart rate as deconditioning', () => {
    const readings = [
      ...log('exerciseMin', 60, days(14, 30)),
      ...log('restingHr', 58, days(14, 68)),
    ]
    const finding = evaluate(readings, 14).findings.find((f) => f.id === 'pattern:deconditioning')
    expect(finding?.status).toBe('act')
  })

  it('does not read the days during or after a fever as deconditioning', () => {
    const lowExerciseRaisedPulse = [
      ...log('exerciseMin', 60, days(14, 30)),
      ...log('restingHr', 58, days(14, 68)),
    ]
    const during = evaluate(
      [...lowExerciseRaisedPulse, ...log('bodyTemp', 36.7, [...days(10, 36.8), ...days(4, 38.4)])],
      14,
    )
    expect(during.findings.map((f) => f.id)).not.toContain('pattern:deconditioning')

    // Fever gone for four days, but the 7-day average is still raised.
    const after = evaluate(
      [...lowExerciseRaisedPulse, ...log('bodyTemp', 36.7, [...days(10, 38.4), ...days(4, 36.8)])],
      14,
    )
    expect(after.assessments.bodyTemp.band?.status).toBe('nominal')
    expect(after.assessments.bodyTemp.status).toBe('watch')
    expect(after.findings.map((f) => f.id)).not.toContain('pattern:deconditioning')
  })

  it('still reports deconditioning when temperature is normal or out of date', () => {
    const lowExerciseRaisedPulse = [
      ...log('exerciseMin', 60, days(14, 30)),
      ...log('restingHr', 58, days(14, 68)),
    ]
    const normal = evaluate(
      [...lowExerciseRaisedPulse, ...log('bodyTemp', 36.7, days(14, 36.8))],
      14,
    )
    expect(normal.findings.map((f) => f.id)).toContain('pattern:deconditioning')

    // A fever last measured nine days ago says nothing about today.
    const outOfDate = evaluate(
      [...lowExerciseRaisedPulse, ...log('bodyTemp', 36.7, [...days(4, 36.8), 38.4])],
      14,
    )
    expect(outOfDate.assessments.bodyTemp.stale).toBe(true)
    expect(outOfDate.findings.map((f) => f.id)).toContain('pattern:deconditioning')
  })
})

describe('missionStatuses', () => {
  it('gives one status per mission day, matching evaluate', () => {
    const readings = [...log('bodyTemp', 36.7, [...days(5, 36.8), 38.4, 36.8])]
    const statuses = missionStatuses(indexReadings(readings), 7)
    expect(statuses).toHaveLength(7)
    expect(statuses[5]).toBe(evaluate(readings, 6).status)
    expect(statuses[5]).toBe('act')
    expect(statuses[6]).toBe('nominal')
  })
})
