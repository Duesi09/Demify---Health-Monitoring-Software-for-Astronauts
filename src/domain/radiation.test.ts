import { describe, expect, it } from 'vitest'
import { evaluateIndexed, indexReadings } from './engine'
import { METRICS } from './metrics'
import {
  BUILD_TARGET_MS,
  CAREER_LIMIT_MSV,
  COMPARISONS,
  SHELTER_FACTOR,
  SHELTER_STEPS,
  SOURCES,
  SOURCE_ORDER,
  doseLog,
  elapsedMs,
  equivalents,
  eventOn,
  formatClock,
  formatCount,
  formatDuration,
  formatShare,
  isRunning,
  isShelterDose,
  limitShare,
  newClock,
  pauseClock,
  projectDose,
  setClockSpeed,
  shelterEstimate,
  solarEvents,
  startClock,
  totalDose,
  typicalDailyDose,
} from './radiation'
import { MISSION_DAYS, SOLAR_EVENT_DAYS, simulateMission } from './simulator'

const index = indexReadings(simulateMission())
const simulated = index.radiationDose
const totalOn = (day: number) => totalDose(doseLog(simulated, day))

/** A made-up log: `dose` on every day from 1 to `days`, with single days overridden or removed. */
function series(days: number, dose: number, changes: Record<number, number | null> = {}): Map<number, number> {
  const map = new Map<number, number>()
  for (let day = 1; day <= days; day++) map.set(day, dose)
  for (const [day, value] of Object.entries(changes)) {
    if (value === null) map.delete(Number(day))
    else map.set(Number(day), value)
  }
  return map
}

describe('doseLog', () => {
  it('adds the daily readings from mission day 1', () => {
    const log = doseLog(series(10, 2), 4)
    expect(log.map((d) => d.cumulative)).toEqual([2, 4, 6, 8])
    expect(totalDose(log)).toBe(8)
    expect(log.every((d) => !d.estimated && !d.event)).toBe(true)
  })

  it('leaves out the days before launch', () => {
    const withPreflight = series(3, 2)
    withPreflight.set(0, 5)
    withPreflight.set(-3, 5)
    expect(totalDose(doseLog(withPreflight, 3))).toBe(6)
  })

  it('counts a day without a reading at the typical dose and marks it', () => {
    const log = doseLog(series(5, 2, { 3: null }), 5)
    expect(log[2]).toMatchObject({ day: 3, dose: 2, estimated: true, event: false })
    expect(totalDose(log)).toBe(10)
  })

  it('does not let a solar particle event raise the dose filled into a gap', () => {
    const log = doseLog(series(9, 2, { 4: 40, 5: null }), 9)
    expect(log[4]).toMatchObject({ dose: 2, estimated: true })
    expect(totalDose(log)).toBe(7 * 2 + 40 + 2)
  })

  it('is empty when no mission day has a reading', () => {
    expect(doseLog(new Map(), 12)).toEqual([])
    expect(doseLog(new Map([[-2, 0.01]]), 12)).toEqual([])
    expect(totalDose([])).toBe(0)
  })

  it('never goes down from one day to the next', () => {
    const log = doseLog(simulated, MISSION_DAYS)
    expect(log).toHaveLength(MISSION_DAYS)
    for (let i = 1; i < log.length; i++) expect(log[i].cumulative).toBeGreaterThan(log[i - 1].cumulative)
  })

  it('keeps sums of 0.1 steps free of floating point dust', () => {
    const log = doseLog(series(30, 0.1), 30)
    expect(totalDose(log)).toBe(3)
  })
})

describe('the simulated mission', () => {
  it('reaches known totals on known days', () => {
    expect(totalOn(1)).toBe(1.8)
    expect(totalOn(20)).toBe(35.9)
    expect(totalOn(147)).toBe(264.2)
    expect(totalOn(149)).toBe(321.8)
    expect(totalOn(MISSION_DAYS)).toBe(377.6)
  })

  it('has a reading on every mission day, so nothing is estimated', () => {
    expect(doseLog(simulated, MISSION_DAYS).filter((d) => d.estimated)).toEqual([])
  })

  it('stays below the career limit', () => {
    expect(limitShare(totalOn(MISSION_DAYS))).toBeCloseTo(0.629, 3)
  })

  it('finds the solar particle event and what it added', () => {
    const events = solarEvents(doseLog(simulated, MISSION_DAYS))
    expect(events).toEqual([{ firstDay: 148, lastDay: 149, dose: 57.6, peak: 43.1, peakDay: 148 }])
    expect([events[0].firstDay, events[0].lastDay]).toEqual(SOLAR_EVENT_DAYS)
    // The step in the running total across the event is the event's dose.
    expect(totalOn(149) - totalOn(147)).toBeCloseTo(events[0].dose, 6)
    // Two days of the event weigh as much as a month of quiet days.
    expect(events[0].dose / typicalDailyDose(simulated, 149)!).toBe(32)
  })

  it('sees no event before it starts and half of it on its first day', () => {
    expect(solarEvents(doseLog(simulated, 147))).toEqual([])
    expect(solarEvents(doseLog(simulated, 148))).toEqual([
      { firstDay: 148, lastDay: 148, dose: 43.1, peak: 43.1, peakDay: 148 },
    ])
  })

  it('marks as event days exactly the days the rule engine sends the crew to the shelter', () => {
    const log = doseLog(simulated, MISSION_DAYS)
    for (const entry of log) {
      const status = evaluateIndexed(index, entry.day).assessments.radiationDose.status
      expect(entry.event).toBe(status === 'act' || status === 'critical')
    }
  })
})

describe('isShelterDose', () => {
  it('follows the bands of the indicator', () => {
    const act = METRICS.radiationDose.bands.find((b) => b.status === 'act')!
    const watch = METRICS.radiationDose.bands.find((b) => b.status === 'watch')!
    // A band starts where the one below it ends.
    expect(isShelterDose(watch.below)).toBe(true)
    expect(isShelterDose(watch.below - 0.1)).toBe(false)
    expect(isShelterDose(act.below)).toBe(true)
    expect(isShelterDose(1.8)).toBe(false)
  })
})

describe('solarEvents', () => {
  it('keeps events apart when a quiet day lies between them', () => {
    const log = doseLog(series(12, 2, { 3: 20, 4: 30, 6: 60 }), 12)
    expect(solarEvents(log)).toEqual([
      { firstDay: 3, lastDay: 4, dose: 50, peak: 30, peakDay: 4 },
      { firstDay: 6, lastDay: 6, dose: 60, peak: 60, peakDay: 6 },
    ])
  })

  it('tells which event a day belongs to', () => {
    const events = solarEvents(doseLog(simulated, MISSION_DAYS))
    expect(eventOn(events, 147)).toBeNull()
    expect(eventOn(events, 148)).toBe(events[0])
    expect(eventOn(events, 149)).toBe(events[0])
    expect(eventOn(events, 150)).toBeNull()
  })
})

describe('typicalDailyDose', () => {
  it('is the median, which an event does not move', () => {
    expect(typicalDailyDose(series(9, 2, { 5: 43 }), 9)).toBe(2)
    expect(typicalDailyDose(new Map([[1, 1.6], [2, 2]]), 2)).toBe(1.8)
    expect(typicalDailyDose(new Map(), 9)).toBeNull()
  })

  it('only looks at days up to the given day', () => {
    expect(typicalDailyDose(series(9, 2, { 8: 5, 9: 5 }), 3)).toBe(2)
  })
})

describe('limitShare', () => {
  it('is the dose as a fraction of the 600 mSv career limit', () => {
    expect(CAREER_LIMIT_MSV).toBe(600)
    expect(limitShare(0)).toBe(0)
    expect(limitShare(150)).toBe(0.25)
    expect(limitShare(600)).toBe(1)
  })

  it('is not capped, so a dose over the limit shows as over', () => {
    expect(limitShare(660)).toBeCloseTo(1.1)
  })
})

describe('projectDose', () => {
  it('extends the total at the recent average rate to the last mission day', () => {
    const projection = projectDose(doseLog(series(40, 2), 40), 180)!
    expect(projection).toEqual({ ratePerDay: 2, basisDays: 14, daysLeft: 140, added: 280, total: 360, share: 0.6 })
  })

  it('averages only the most recent days', () => {
    const changes = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [27 + i, 3]))
    const projection = projectDose(doseLog(series(40, 2, changes), 40), 180)!
    expect(projection.ratePerDay).toBe(3)
    expect(projection.total).toBe(26 * 2 + 14 * 3 + 140 * 3)
  })

  it('leaves event days and estimated days out of the rate', () => {
    const log = doseLog(series(30, 2, { 28: null, 29: 45, 30: 15 }), 30)
    const projection = projectDose(log, 180)!
    expect(projection.ratePerDay).toBe(2)
    // The dose of the event itself stays in the total.
    expect(projection.total).toBe(totalDose(log) + 150 * 2)
  })

  it('uses fewer days when the mission is young', () => {
    expect(projectDose(doseLog(series(3, 2), 3), 180)).toMatchObject({ basisDays: 3, daysLeft: 177, total: 360 })
  })

  it('adds nothing on the last mission day', () => {
    const log = doseLog(simulated, MISSION_DAYS)
    expect(projectDose(log)).toMatchObject({ daysLeft: 0, added: 0, total: totalDose(log) })
  })

  it('gives nothing when there is no quiet, measured day to average', () => {
    expect(projectDose([])).toBeNull()
    expect(projectDose(doseLog(new Map([[1, 40]]), 1))).toBeNull()
  })

  it('projects the simulated mission from day 20 and from the event', () => {
    expect(projectDose(doseLog(simulated, 20))!.total).toBeCloseTo(322.8, 1)
    const atEvent = projectDose(doseLog(simulated, 149))!
    expect(atEvent.total).toBeCloseTo(378.0, 1)
    expect(atEvent.share).toBeCloseTo(0.63, 2)
    // The projection from the event lands close to what the mission then measures.
    expect(Math.abs(atEvent.total - totalOn(MISSION_DAYS))).toBeLessThan(1)
  })
})

describe('equivalents', () => {
  it('expresses a dose in everyday comparisons', () => {
    const [xray, background, station] = equivalents(300)
    expect(xray.most).toBe(3000)
    expect(background.most).toBe(100)
    expect([station.fewest, station.most]).toEqual([1.875, 3.75])
  })

  it('lists the comparisons from the smallest dose to the largest, each with a source', () => {
    const doses = COMPARISONS.map((c) => c.low)
    expect(doses).toEqual([...doses].sort((a, b) => a - b))
    for (const c of COMPARISONS) expect(SOURCES[c.source].url).toMatch(/^https:\/\//)
  })
})

describe('shelterEstimate', () => {
  it('halves the solar part and leaves the background alone', () => {
    const estimate = shelterEstimate({ dailyDose: 43.1, backgroundPerDay: 1.8, factor: 2, hours: 24 })
    // 1.8 of background plus half of the 41.3 from solar particles is 22.45.
    // The numbers are rounded as shown, so they add up on screen.
    expect(estimate).toEqual({ unsheltered: 43.1, sheltered: 22.5, avoided: 20.6 })
  })

  it('scales with the time spent in the shelter', () => {
    const day = shelterEstimate({ dailyDose: 40, backgroundPerDay: 2, factor: 4, hours: 24 })
    const sixHours = shelterEstimate({ dailyDose: 40, backgroundPerDay: 2, factor: 4, hours: 6 })
    expect(day.avoided).toBe(28.5)
    expect(sixHours.avoided).toBeCloseTo(day.avoided / 4, 1)
    expect(shelterEstimate({ dailyDose: 40, backgroundPerDay: 2, factor: 4, hours: 0 }).avoided).toBe(0)
  })

  it('avoids nothing on a day without solar particles', () => {
    expect(shelterEstimate({ dailyDose: 1.8, backgroundPerDay: 1.8, factor: 4, hours: 24 }).avoided).toBe(0)
    expect(shelterEstimate({ dailyDose: 1.6, backgroundPerDay: 1.8, factor: 4, hours: 24 }).avoided).toBe(0)
  })

  it('keeps the assumed factor inside its labelled range', () => {
    const input = { dailyDose: 40, backgroundPerDay: 2, hours: 24 }
    expect(shelterEstimate({ ...input, factor: 100 })).toEqual(shelterEstimate({ ...input, factor: SHELTER_FACTOR.max }))
    expect(shelterEstimate({ ...input, factor: 0 })).toEqual(shelterEstimate({ ...input, factor: SHELTER_FACTOR.min }))
  })
})

describe('clocks', () => {
  const T0 = 1_000_000

  it('stands still until it is started', () => {
    const clock = newClock()
    expect(isRunning(clock)).toBe(false)
    expect(elapsedMs(clock, T0 + 5000)).toBe(0)
  })

  it('counts real time once started', () => {
    const clock = startClock(newClock(), T0)
    expect(isRunning(clock)).toBe(true)
    expect(elapsedMs(clock, T0 + 90_000)).toBe(90_000)
  })

  it('keeps its time while paused and continues from there', () => {
    const paused = pauseClock(startClock(newClock(), T0), T0 + 10_000)
    expect(isRunning(paused)).toBe(false)
    expect(elapsedMs(paused, T0 + 500_000)).toBe(10_000)
    const resumed = startClock(paused, T0 + 500_000)
    expect(elapsedMs(resumed, T0 + 505_000)).toBe(15_000)
  })

  it('ignores a second start, so a double click loses no time', () => {
    const clock = startClock(newClock(), T0)
    expect(startClock(clock, T0 + 3000)).toBe(clock)
  })

  it('fast-forwards without losing what was counted in real time', () => {
    const real = startClock(newClock(), T0)
    const fast = setClockSpeed(real, 60, T0 + 10_000)
    expect(elapsedMs(fast, T0 + 10_000)).toBe(10_000)
    // One real second later, a minute has passed on the clock.
    expect(elapsedMs(fast, T0 + 11_000)).toBe(70_000)
    const back = setClockSpeed(fast, 1, T0 + 11_000)
    expect(elapsedMs(back, T0 + 12_000)).toBe(71_000)
  })

  it('changes speed while paused without starting', () => {
    const paused = pauseClock(startClock(newClock(), T0), T0 + 4000)
    const fast = setClockSpeed(paused, 600, T0 + 9000)
    expect(isRunning(fast)).toBe(false)
    expect(elapsedMs(fast, T0 + 99_000)).toBe(4000)
  })

  it('reaches the one hour build target in six seconds at the fastest speed', () => {
    const clock = startClock(newClock(600), T0)
    expect(elapsedMs(clock, T0 + 6000)).toBe(BUILD_TARGET_MS)
  })

  it('never runs backwards when the wall clock is set back', () => {
    const clock = startClock(newClock(), T0)
    expect(elapsedMs(clock, T0 - 60_000)).toBe(0)
  })
})

describe('formatting', () => {
  it('writes clock time as hours, minutes and seconds', () => {
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(3_909_999)).toBe('01:05:09')
    expect(formatClock(25 * 3_600_000)).toBe('25:00:00')
    expect(formatClock(-5)).toBe('00:00:00')
  })

  it('writes durations in words', () => {
    expect(formatDuration(40 * 60_000)).toBe('40 min')
    expect(formatDuration(65 * 60_000)).toBe('1 h 5 min')
    expect(formatDuration(24 * 3_600_000)).toBe('24 h')
  })

  it('writes shares as percentages without hiding a small share', () => {
    expect(formatShare(0.5363)).toBe('54%')
    expect(formatShare(0.003)).toBe('0.3%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(1.1)).toBe('110%')
  })

  it('writes counts at a sensible precision', () => {
    expect(formatCount(3218)).toBe('3,218')
    expect(formatCount(107.3)).toBe('107')
    expect(formatCount(12.4)).toBe('12')
    expect(formatCount(2.44)).toBe('2.4')
    expect(formatCount(0.26)).toBe('0.3')
  })
})

describe('copy and sources', () => {
  const texts = [
    ...SHELTER_STEPS.flatMap((s) => [s.title, s.detail, s.sourceNote ?? '']),
    ...Object.values(SOURCES).flatMap((s) => [s.short, s.authors, s.title, s.usedFor]),
    ...COMPARISONS.map((c) => c.label),
  ]

  it('uses no dashes or middle dots', () => {
    for (const text of texts) expect(text).not.toMatch(/[\u2013\u2014\u00b7]/)
  })

  it('lists every source once, each with a secure link', () => {
    expect([...SOURCE_ORDER].sort()).toEqual(Object.keys(SOURCES).sort())
    for (const source of Object.values(SOURCES)) expect(source.url).toMatch(/^https:\/\//)
  })

  it('gives every source its own short name, so two links never read the same', () => {
    const shorts = Object.values(SOURCES).map((s) => s.short)
    expect(new Set(shorts).size).toBe(shorts.length)
  })

  it('names a source that exists wherever a step cites one', () => {
    expect(SHELTER_STEPS).toHaveLength(7)
    expect(new Set(SHELTER_STEPS.map((s) => s.id)).size).toBe(SHELTER_STEPS.length)
    for (const step of SHELTER_STEPS) {
      if (step.source) expect(step.sourceNote).toBeTruthy()
    }
  })
})
