import { describe, expect, it } from 'vitest'
import { BACKGROUND, MISSION_EVENTS, STRENGTHS, citation, dayRange, eventsOn } from './events'
import type { Evidence, EvidenceNote } from './events'
import { HEART_ATTACK_DAYS, MISSION_DAYS } from './simulator'

const notes: EvidenceNote[] = [...MISSION_EVENTS, ...BACKGROUND]
const idsOn = (day: number) => eventsOn(day).map((e) => e.id)

/** Every piece of text a reader can see in a note. */
function copyOf(note: EvidenceNote): string[] {
  return [
    note.title,
    note.story,
    note.note ?? '',
    ...note.evidence.flatMap((e) => [e.finding, e.authors, e.publication]),
  ]
}

function expectComplete(e: Evidence, where: string) {
  for (const field of [e.finding, e.authors, e.publication, e.url]) {
    expect(field.trim(), where).not.toBe('')
  }
  expect(Number.isInteger(e.year), where).toBe(true)
  expect(e.year, where).toBeGreaterThanOrEqual(1960)
  expect(e.year, where).toBeLessThanOrEqual(2026)
  expect(STRENGTHS, where).toContain(e.strength)
  // A cited source is an observation. Only an event can be a scenario.
  expect(e.strength, where).not.toBe('scenario')
}

describe('mission events', () => {
  it('lie within the mission and come in order', () => {
    let previousStart = 0
    for (const e of MISSION_EVENTS) {
      expect(e.firstDay, e.id).toBeGreaterThanOrEqual(1)
      expect(e.lastDay, e.id).toBeLessThanOrEqual(MISSION_DAYS)
      expect(e.firstDay, e.id).toBeLessThanOrEqual(e.lastDay)
      expect(e.firstDay, e.id).toBeGreaterThanOrEqual(previousStart)
      previousStart = e.firstDay
    }
  })

  it('have unique ids, a title and a story', () => {
    const ids = notes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const n of notes) {
      expect(n.title.trim(), n.id).not.toBe('')
      expect(n.story.trim(), n.id).not.toBe('')
      expect(STRENGTHS, n.id).toContain(n.basis)
    }
  })

  it('link every source over https', () => {
    for (const n of notes) {
      for (const e of n.evidence) {
        const url = new URL(e.url)
        expect(url.protocol, `${n.id}: ${e.url}`).toBe('https:')
        expect(e.url, n.id).not.toMatch(/\s/)
      }
    }
  })

  it('back every event that is not a scenario with complete evidence', () => {
    for (const n of notes) {
      if (n.basis !== 'scenario') expect(n.evidence.length, n.id).toBeGreaterThanOrEqual(1)
      for (const e of n.evidence) expectComplete(e, `${n.id}: ${citation(e)}`)
    }
  })

  it('never claim more than the strongest source supports', () => {
    for (const n of notes) {
      if (n.basis === 'observed in spaceflight') {
        expect(n.evidence.some((e) => e.strength === 'observed in spaceflight'), n.id).toBe(true)
      }
    }
  })

  it('say honestly what is not known for every scenario', () => {
    const scenarios = notes.filter((n) => n.basis === 'scenario')
    expect(scenarios.map((n) => n.id)).toEqual(['skipped-bp', 'heart-attack-1', 'low-blood-sugar', 'heart-attack-2'])
    for (const n of scenarios) {
      expect(n.note?.trim() ?? '', n.id).not.toBe('')
      expect(n.note, n.id).toMatch(/scenario/)
    }
  })

  it('follow the copy rules: no dashes, no middle dots, no promises', () => {
    for (const n of notes) {
      for (const text of copyOf(n)) {
        expect(text, n.id).not.toMatch(/[\u2013\u2014\u00b7]/)
        expect(text, n.id).not.toMatch(/this will happen/i)
      }
    }
  })
})

describe('eventsOn', () => {
  it('finds the scripted events on their days', () => {
    expect(idsOn(42)).toEqual(['workload', 'scrubber'])
    expect(idsOn(56)).toEqual(['air-fault'])
    expect(idsOn(74)).toEqual(['infection'])
    expect(idsOn(97)).toEqual(['heart-attack-1'])
    expect(idsOn(130)).toEqual(['exercise-outage'])
    expect(idsOn(148)).toEqual(['solar-particle-event'])
    expect(idsOn(153)).toEqual(['low-blood-sugar'])
    expect(idsOn(168)).toEqual(['heart-attack-2'])
  })

  it('includes the first and last day of an event and nothing beyond', () => {
    expect(idsOn(27)).toEqual([])
    expect(idsOn(28)).toEqual(['workload'])
    expect(idsOn(46)).toEqual(['workload'])
    expect(idsOn(47)).toEqual([])
    expect(idsOn(88)).toEqual(['skipped-bp'])
    expect(idsOn(149)).toEqual(['solar-particle-event'])
    expect(idsOn(150)).toEqual([])
  })

  it('returns nothing on a quiet day or outside the mission', () => {
    expect(eventsOn(20)).toEqual([])
    expect(eventsOn(0)).toEqual([])
    expect(eventsOn(MISSION_DAYS + 1)).toEqual([])
  })

  it('starts a heart attack event on each day the simulator scripts one', () => {
    const starts = MISSION_EVENTS.filter((e) => e.id.startsWith('heart-attack')).map((e) => e.firstDay)
    expect(starts).toEqual(HEART_ATTACK_DAYS)
  })
})

describe('background', () => {
  it('covers the slow whole-mission changes, each with evidence from spaceflight', () => {
    expect(BACKGROUND.map((n) => n.id)).toEqual([
      'background-sleep',
      'background-temperature',
      'background-co2',
      'background-radiation',
    ])
    for (const n of BACKGROUND) expect(n.basis, n.id).toBe('observed in spaceflight')
  })
})

describe('text helpers', () => {
  it('write a source as authors, year, publication', () => {
    expect(citation(MISSION_EVENTS[0].evidence[0])).toBe('Barger and colleagues, 2014, The Lancet Neurology')
  })

  it('write day ranges in words', () => {
    expect(dayRange(MISSION_EVENTS[0])).toBe('Days 28 to 46')
    expect(dayRange(MISSION_EVENTS.find((e) => e.id === 'low-blood-sugar')!)).toBe('Day 153')
  })
})
