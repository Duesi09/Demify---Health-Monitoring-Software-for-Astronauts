import { describe, expect, it } from 'vitest'
import {
  MILESTONES,
  completedDays,
  describeAge,
  fieldError,
  fieldValue,
  meaningOf,
  measureSteps,
  nextDueStep,
  planRoutine,
  streakOf,
  summariseRoutine,
  type StepGroup,
} from './checkin'
import { evaluate, indexReadings } from './engine'
import { METRICS, METRIC_IDS } from './metrics'
import { simulateMission } from './simulator'
import type { MetricId, Reading } from './types'
import { validateReading } from './validate'

const GROUPS: StepGroup[] = [
  { id: 'restingHr', label: 'Resting heart rate', metrics: ['restingHr'] },
  { id: 'bloodPressure', label: 'Blood pressure', metrics: ['systolic', 'diastolic'] },
  { id: 'glucose', label: 'Fasting blood sugar', metrics: ['glucose'] },
  { id: 'cabinCo2', label: 'Cabin CO₂', metrics: ['cabinCo2'] },
]

const reading = (metric: MetricId, day: number, value: number, source: Reading['source'] = 'simulated'): Reading => ({
  day,
  metric,
  value,
  source,
})

/** One reading per listed day for a metric. */
const on = (metric: MetricId, value: number, ...days: number[]) => days.map((d) => reading(metric, d, value))

const simulated = simulateMission()
const simulatedIndex = indexReadings(simulated)

describe('routine', () => {
  // Day 10: heart rate today, blood pressure 5 days ago, blood sugar 2 days ago, cabin CO₂ never.
  const readings = [
    ...on('restingHr', 60, 9, 10),
    ...on('systolic', 118, 5),
    ...on('diastolic', 76, 5),
    ...on('glucose', 90, 8),
  ]
  const steps = planRoutine(GROUPS, evaluate(readings, 10))
  const step = (id: string) => steps.find((s) => s.id === id)!

  it('tells due, open and done apart', () => {
    expect(step('restingHr').state).toBe('done')
    expect(step('bloodPressure').state).toBe('due')
    expect(step('glucose').state).toBe('open')
    expect(step('cabinCo2').state).toBe('due')
  })

  it('puts never measured first, then out of date, then not measured today, then done', () => {
    expect(steps.map((s) => s.id)).toEqual(['cabinCo2', 'bloodPressure', 'glucose', 'restingHr'])
  })

  it('reports the age of the reading and how long it stays current', () => {
    expect(step('bloodPressure')).toMatchObject({ daysSinceReading: 5, daysLeft: -2 })
    expect(step('glucose')).toMatchObject({ daysSinceReading: 2, daysLeft: 5 })
    expect(step('restingHr')).toMatchObject({ daysSinceReading: 0, daysLeft: 3 })
    expect(step('cabinCo2')).toMatchObject({ daysSinceReading: null, daysLeft: null })
  })

  it('puts the longest overdue first among the out-of-date steps', () => {
    const late = [...on('restingHr', 60, 2), ...on('systolic', 118, 5), ...on('diastolic', 76, 5), ...on('glucose', 90, 9), ...on('cabinCo2', 2, 7)]
    const order = planRoutine(GROUPS, evaluate(late, 10)).map((s) => s.id)
    // Overdue by 5 days (heart rate), 2 days (blood pressure, cabin CO₂ in the given order); blood sugar is still current.
    expect(order).toEqual(['restingHr', 'bloodPressure', 'cabinCo2', 'glucose'])
  })

  it('judges a pair of values by the older one', () => {
    const uneven = [...on('systolic', 118, 10), ...on('diastolic', 76, 4)]
    const bp = planRoutine(GROUPS, evaluate(uneven, 10)).find((s) => s.id === 'bloodPressure')!
    expect(bp).toMatchObject({ state: 'due', daysSinceReading: 6 })
  })

  it('counts a reading entered by hand today as done', () => {
    const logged = [...readings, reading('systolic', 10, 120, 'manual'), reading('diastolic', 10, 78, 'manual')]
    const bp = planRoutine(GROUPS, evaluate(logged, 10)).find((s) => s.id === 'bloodPressure')!
    expect(bp.state).toBe('done')
  })

  it('summarises the day', () => {
    expect(summariseRoutine(steps)).toEqual({ total: 4, measuredToday: 1, due: 2, open: 1 })
  })

  it('has only blood pressure due on simulated day 90 and nothing due on day 20', () => {
    const all: StepGroup[] = [
      { id: 'bloodPressure', label: 'Blood pressure', metrics: ['systolic', 'diastolic'] },
      ...METRIC_IDS.filter((m) => m !== 'systolic' && m !== 'diastolic').map((m) => ({
        id: m,
        label: METRICS[m].label,
        metrics: [m],
      })),
    ]
    const day90 = planRoutine(all, evaluate(simulated, 90))
    expect(day90[0]).toMatchObject({ id: 'bloodPressure', state: 'due', daysSinceReading: 5 })
    expect(summariseRoutine(day90)).toEqual({ total: 11, measuredToday: 10, due: 1, open: 0 })

    // Blood sugar is taken every third day, so day 20 has none, and none is due.
    expect(summariseRoutine(planRoutine(all, evaluate(simulated, 20)))).toEqual({
      total: 11,
      measuredToday: 10,
      due: 0,
      open: 1,
    })
  })
})

describe('next step', () => {
  const readings = [...on('restingHr', 60, 1), ...on('systolic', 118, 2), ...on('diastolic', 76, 2), ...on('glucose', 90, 9)]
  // Order: cabin CO₂ (never), heart rate, blood pressure (both overdue), blood sugar (open).
  const steps = planRoutine(GROUPS, evaluate(readings, 10))
  const none = new Set<string>()

  it('starts with the most urgent step', () => {
    expect(nextDueStep(steps, null, none)).toBe('cabinCo2')
  })

  it('moves on to the next step that is due', () => {
    expect(nextDueStep(steps, 'cabinCo2', none)).toBe('restingHr')
    expect(nextDueStep(steps, 'restingHr', none)).toBe('bloodPressure')
  })

  it('wraps around to a due step that was passed over', () => {
    expect(nextDueStep(steps, 'bloodPressure', none)).toBe('cabinCo2')
  })

  it('leaves out skipped steps and steps that are not due', () => {
    expect(nextDueStep(steps, 'cabinCo2', new Set(['restingHr']))).toBe('bloodPressure')
    expect(nextDueStep(steps, 'bloodPressure', new Set(['cabinCo2', 'restingHr']))).toBeNull()
  })

  it('never returns the step the crew member is on', () => {
    const onlyOne = planRoutine(GROUPS, evaluate([...readings, ...on('restingHr', 60, 10), ...on('cabinCo2', 2, 10)], 10))
    expect(nextDueStep(onlyOne, 'bloodPressure', none)).toBeNull()
  })
})

describe('wording', () => {
  it('describes the age of a reading', () => {
    expect(describeAge(null)).toBe('never measured')
    expect(describeAge(0)).toBe('today')
    expect(describeAge(1)).toBe('yesterday')
    expect(describeAge(5)).toBe('5 days ago')
  })

  it('splits an instruction into one step per sentence', () => {
    expect(measureSteps(METRICS.systolic.howToMeasure)).toEqual([
      'Rest for 5 minutes, strap in so your arm is relaxed, and place the cuff on your bare upper arm at heart level.',
      'Do not talk during the measurement.',
    ])
    expect(measureSteps(METRICS.mood.howToMeasure)).toHaveLength(2)
  })

  it('keeps a single sentence and a decimal number whole', () => {
    expect(measureSteps(METRICS.radiationDose.howToMeasure)).toHaveLength(1)
    expect(measureSteps('Wait until it reads 36.5 or more. Then log it.')).toEqual([
      'Wait until it reads 36.5 or more.',
      'Then log it.',
    ])
  })

  it('finds at least one step in every instruction of the catalogue', () => {
    for (const id of METRIC_IDS) {
      const steps = measureSteps(METRICS[id].howToMeasure)
      expect(steps.length).toBeGreaterThan(0)
      expect(steps.join(' ')).toBe(METRICS[id].howToMeasure)
    }
  })
})

describe('field check', () => {
  it('accepts a value inside the limits', () => {
    expect(fieldError('systolic', '118')).toBeNull()
    expect(fieldError('bodyTemp', ' 36.8 ')).toBeNull()
    expect(fieldError('bodyTemp', '36,8')).toBeNull()
    expect(fieldValue('36,8')).toBe(36.8)
  })

  it('says in words what is wrong', () => {
    expect(fieldError('systolic', '')).toBe('Enter a number.')
    expect(fieldError('systolic', 'abc')).toBe('Enter a number.')
    expect(fieldError('systolic', '20')).toBe('Enter a value between 50 and 260 mmHg.')
    expect(fieldError('systolic', '118.5')).toBe('Enter a whole number.')
    expect(fieldError('mood', '6')).toBe('Enter a value between 1 and 5.')
  })

  it('agrees with the check the server runs', () => {
    const samples = ['', 'x', '-1', '0', '0.5', '1', '3', '5', '36.6', '50', '99.5', '120', '260', '700', '5000']
    for (const id of METRIC_IDS) {
      for (const typed of samples) {
        const value = typed.trim() === '' ? NaN : Number(typed)
        expect(fieldError(id, typed) === null, `${id} ${typed}`).toBe(validateReading(id, value) === null)
      }
    }
  })
})

describe('meaning of a reading', () => {
  const baseline = (metric: MetricId, value: number) =>
    Array.from({ length: 14 }, (_, i) => reading(metric, i - 13, value))

  it('names the value and its range', () => {
    const a = evaluate([reading('systolic', 5, 118)], 5).assessments.systolic
    expect(meaningOf(a)).toEqual({
      status: 'nominal',
      reading: 'Systolic pressure 118 mmHg',
      range: 'Normal',
      drift: null,
      action: null,
    })
  })

  it('gives the action of the range when the value is outside it', () => {
    const meaning = meaningOf(evaluate([reading('systolic', 5, 150)], 5).assessments.systolic)!
    expect(meaning.status).toBe('act')
    expect(meaning.range).toBe('High blood pressure')
    expect(meaning.action).toBe(METRICS.systolic.bands.find((b) => b.label === 'High blood pressure')!.action)
  })

  it('keeps the spelling of a range name', () => {
    const meaning = meaningOf(evaluate([reading('cabinCo2', 5, 4.5)], 5).assessments.cabinCo2)!
    expect(meaning.range).toContain('CO₂')
    expect(meaning.reading).toBe('Cabin CO₂ 4.5 mmHg')
  })

  it('judges a habit on its 7-day average', () => {
    const week = [3, 4, 5].map((d) => reading('sleepHours', d, 5))
    const meaning = meaningOf(evaluate(week, 5).assessments.sleepHours)!
    expect(meaning.reading).toBe('Sleep, 7-day average 5.0 h')
    expect(meaning.status).not.toBe('nominal')
    expect(meaning.action).not.toBeNull()
  })

  it('reports a drift from the baseline even when the value is in its normal range', () => {
    // Seven days in flight, so the 7-day average no longer holds pre-flight readings.
    const readings = [...baseline('reactionMs', 260), ...on('reactionMs', 310, 1, 2, 3, 4, 5, 6, 7)]
    const meaning = meaningOf(evaluate(readings, 7).assessments.reactionMs)!
    expect(meaning.range).toBe('Normal')
    expect(meaning.status).toBe('watch')
    expect(meaning.drift).toBe('Your 7-day average is +50.0 ms against your pre-flight baseline of 260 ms.')
    expect(meaning.action).toBe(METRICS.reactionMs.drift!.action)
  })

  it('says nothing about a reading that is out of date or missing', () => {
    expect(meaningOf(evaluate([reading('systolic', 1, 118)], 9).assessments.systolic)).toBeNull()
    expect(meaningOf(evaluate([], 9).assessments.systolic)).toBeNull()
  })

  it('uses no dashes or middle dots', () => {
    const e = evaluate(simulated, 40)
    for (const id of METRIC_IDS) {
      const m = meaningOf(e.assessments[id])
      if (m) expect(`${m.reading} ${m.drift ?? ''}`).not.toMatch(/[\u2013\u2014\u00b7]/)
    }
  })
})

describe('complete days', () => {
  it('follows the reminders of the rule engine day by day', () => {
    const complete = completedDays(simulatedIndex, 100)
    expect(complete).toHaveLength(100)
    complete.forEach((done, i) => {
      expect(done).toBe(evaluate(simulated, i + 1).reminders.length === 0)
    })
  })

  it('finds the two days on which blood pressure was out of date in the simulation', () => {
    const complete = completedDays(simulatedIndex, 180)
    const missed = complete.flatMap((done, i) => (done ? [] : [i + 1]))
    expect(missed).toEqual([89, 90])
  })

  it('counts day 90 as complete once blood pressure is logged that day', () => {
    const logged = indexReadings([...simulated, reading('systolic', 90, 117, 'manual'), reading('diastolic', 90, 75, 'manual')])
    const complete = completedDays(logged, 90)
    expect(complete[89]).toBe(true)
    expect(complete[88]).toBe(false)
  })

  it('is empty before the mission starts', () => {
    expect(completedDays(simulatedIndex, 0)).toEqual([])
  })
})

describe('streak', () => {
  const days = (pattern: string) => [...pattern].map((c) => c === 'x')

  it('counts complete days in a row up to today', () => {
    expect(streakOf(days('xxx'))).toMatchObject({ current: 3, todayComplete: true, longest: { length: 3, endDay: 3 } })
  })

  it('keeps the streak alive while today is still open', () => {
    const streak = streakOf(days('xxx.'))
    expect(streak).toMatchObject({ current: 3, todayComplete: false, previous: null })
    expect(streak.longest).toEqual({ length: 3, endDay: 3 })
  })

  it('ends the streak once a whole day was missed', () => {
    const streak = streakOf(days('xxx..'))
    expect(streak).toMatchObject({ current: 0, todayComplete: false })
    expect(streak.previous).toEqual({ length: 3, endDay: 3 })
  })

  it('starts again at one after a missed day', () => {
    const streak = streakOf(days('xxxx.x'))
    expect(streak).toMatchObject({ current: 1, todayComplete: true })
    expect(streak.previous).toEqual({ length: 4, endDay: 4 })
    expect(streak.longest).toEqual({ length: 4, endDay: 4 })
  })

  it('remembers the longest run, and the earlier one when two are equal', () => {
    expect(streakOf(days('xx.xxxx.x')).longest).toEqual({ length: 4, endDay: 7 })
    expect(streakOf(days('xxx.xxx')).longest).toEqual({ length: 3, endDay: 3 })
  })

  it('names the next milestone and the last one reached', () => {
    expect(streakOf(days('xxx'))).toMatchObject({ nextMilestone: 7, reachedMilestone: null })
    expect(streakOf(days('x'.repeat(7)))).toMatchObject({ nextMilestone: 30, reachedMilestone: 7 })
    expect(streakOf(days('x'.repeat(45)))).toMatchObject({ nextMilestone: 60, reachedMilestone: 30 })
    expect(streakOf(days('x'.repeat(180)))).toMatchObject({ nextMilestone: null, reachedMilestone: 180 })
  })

  it('handles a mission that has not started and one with no complete day', () => {
    expect(streakOf([])).toEqual({
      current: 0,
      todayComplete: false,
      longest: null,
      previous: null,
      nextMilestone: MILESTONES[0],
      reachedMilestone: null,
    })
    expect(streakOf(days('...'))).toMatchObject({ current: 0, longest: null, previous: null })
  })

  it('shows the break around days 89 and 90 of the simulated mission', () => {
    const complete = completedDays(simulatedIndex, 180)
    const at = (day: number) => streakOf(complete.slice(0, day))

    expect(at(88)).toMatchObject({ current: 88, todayComplete: true, nextMilestone: 90 })
    // Day 89 is open: the streak is at risk, not yet lost.
    expect(at(89)).toMatchObject({ current: 88, todayComplete: false })
    expect(at(90)).toMatchObject({ current: 0, todayComplete: false, previous: { length: 88, endDay: 88 } })
    expect(at(91)).toMatchObject({ current: 1, todayComplete: true, longest: { length: 88, endDay: 88 } })
    expect(at(180)).toMatchObject({ current: 90, longest: { length: 90, endDay: 180 } })
  })
})
