import { describe, expect, it } from 'vitest'
import {
  ALL_REPLIES,
  FAST_FORWARD_RATE,
  MAX_LEDGER_ENTRIES,
  PHASE_LABEL,
  addConsult,
  composeConsult,
  consultProgress,
  earliestAnswerS,
  emptyLedger,
  handlingTimeS,
  milestones,
  onboardAdvice,
  openConsult,
  parseLedger,
  replyFor,
  serializeLedger,
  shipNow,
  splitSteps,
  startClock,
  withRate,
  type Consult,
} from './consult'
import { evaluate } from './engine'
import { linkState } from './missionContext'
import { MISSION_DAYS, simulateMission } from './simulator'

// En dash, em dash and middle dot, by code point, so this file does not contain them either.
const DASHES_AND_DOTS = new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xb7)}]`)

const readings = simulateMission()
const T0 = Date.UTC(2026, 10, 14, 12, 0, 0)

/** A consult from the simulated mission, sent at T0. */
function consultOn(day: number, profile: Parameters<typeof linkState>[0] = 'transit', id = 'c1'): Consult {
  const consult = composeConsult(evaluate(readings, day), linkState(profile, day), T0, id)
  if (!consult) throw new Error('no contact')
  return consult
}

describe('handling time on the ground', () => {
  it('is a few seconds while a conversation is possible', () => {
    expect(handlingTimeS(linkState('iss', 1))).toBe(5)
    expect(handlingTimeS(linkState('moon', 1))).toBe(5)
  })

  it('is ten minutes once the answer has to be written', () => {
    expect(handlingTimeS(linkState('transit', 56))).toBe(600)
    expect(handlingTimeS(linkState('mars-far', 56))).toBe(600)
  })

  it('makes the earliest answer the round trip plus the handling time', () => {
    const far = linkState('mars-far', 1)
    expect(earliestAnswerS(far)).toBe(far.roundTripS + 600)
    expect(earliestAnswerS(far) / 60).toBeCloseTo(54.4, 1)
    expect(earliestAnswerS(linkState('moon', 1))).toBeCloseTo(7.56, 2)
  })
})

describe('composing a consult', () => {
  it("sends today's most urgent finding with the on-board advice", () => {
    const evaluation = evaluate(readings, 97)
    const consult = consultOn(97)
    expect(consult.findingId).toBe('pattern:cardiac')
    expect(consult.findingId).toBe(evaluation.findings[0].id)
    expect(consult.status).toBe('critical')
    expect(consult.subject).toBe(evaluation.findings[0].title)
    expect(consult.onboardAction).toBe(evaluation.findings[0].action)
    expect(consult.day).toBe(97)
    expect(consult.profile).toBe('transit')
  })

  it('sends a routine status report on a day without findings', () => {
    const consult = consultOn(20)
    expect(consult.findingId).toBeNull()
    expect(consult.status).toBe('nominal')
    expect(consult.subject).toBe('Routine status report')
    expect(consult.onboardAction).toMatch(/routine measurements/)
  })

  it('mentions overdue measurements instead of claiming all is well', () => {
    const evaluation = evaluate(
      readings.filter((r) => r.metric !== 'glucose' || r.day < 1),
      20,
    )
    expect(evaluation.reminders.length).toBeGreaterThan(0)
    expect(evaluation.findings).toEqual([])
    const consult = composeConsult(evaluation, linkState('transit', 20), T0, 'c1')
    expect(consult?.subject).toBe('Routine status report')
    expect(consult?.detail).toMatch(/out of date/)
    expect(onboardAdvice(evaluation)).toMatch(/out of date/)
  })

  it('takes the light time and handling time of the moment of sending', () => {
    const link = linkState('transit', 97)
    const consult = consultOn(97)
    expect(consult.oneWayMs).toBe(link.oneWayS * 1000)
    expect(consult.handlingMs).toBe(600_000)
    expect(consult.sentAt).toBe(T0)
  })

  it('cannot be sent in a blackout', () => {
    expect(composeConsult(evaluate(readings, 97), linkState('blackout', 97), T0, 'c1')).toBeNull()
  })
})

describe('where the signal is', () => {
  const consult: Consult = { ...consultOn(97), oneWayMs: 300_000, handlingMs: 600_000 }
  const at = (minutes: number) => consultProgress(consult, T0 + minutes * 60_000)

  it('places the milestones one light time, the handling time and one light time apart', () => {
    expect(milestones(consult)).toEqual({
      sentAt: T0,
      earthAt: T0 + 300_000,
      replySentAt: T0 + 900_000,
      answerAt: T0 + 1_200_000,
    })
  })

  it('travels to Earth first', () => {
    expect(at(0)).toEqual({ phase: 'to-earth', position: 0, phaseDone: 0, remainingMs: 1_200_000 })
    expect(at(2.5)).toMatchObject({ phase: 'to-earth', position: 0.5, remainingMs: 1_050_000 })
  })

  it('waits on Earth while the ground handles it', () => {
    expect(at(5)).toMatchObject({ phase: 'handling', position: 1, phaseDone: 0 })
    expect(at(10)).toMatchObject({ phase: 'handling', position: 1, phaseDone: 0.5, remainingMs: 600_000 })
  })

  it('travels back with the answer', () => {
    expect(at(15)).toMatchObject({ phase: 'to-ship', position: 1, phaseDone: 0 })
    expect(at(18)).toMatchObject({ phase: 'to-ship', remainingMs: 120_000 })
    expect(at(18).position).toBeCloseTo(0.4, 10)
  })

  it('is answered once the round trip and the handling time have passed', () => {
    expect(at(20)).toEqual({ phase: 'answered', position: 0, phaseDone: 1, remainingMs: 0 })
    expect(at(600).phase).toBe('answered')
  })

  it('shows nothing odd before the sending time or with zero light time', () => {
    expect(consultProgress(consult, T0 - 5000)).toMatchObject({ phase: 'to-earth', position: 0 })
    const instant = { ...consult, oneWayMs: 0, handlingMs: 0 }
    expect(consultProgress(instant, T0).phase).toBe('answered')
  })

  it('resolves almost at once near Earth and takes most of an hour from Mars', () => {
    const answerAfterS = (c: Consult) => (milestones(c).answerAt - c.sentAt) / 1000
    expect(answerAfterS(consultOn(97, 'iss'))).toBeCloseTo(5.003, 3)
    expect(answerAfterS(consultOn(97, 'moon'))).toBeCloseTo(7.564, 3)
    expect(answerAfterS(consultOn(97)) / 60).toBeCloseTo(19.87, 2)
    expect(answerAfterS(consultOn(97, 'mars-far')) / 60).toBeCloseTo(54.41, 2)
  })

  it('names every phase', () => {
    expect(PHASE_LABEL).toEqual({
      'to-earth': 'In transit to Earth',
      handling: 'Being handled on Earth',
      'to-ship': 'Answer in transit',
      answered: 'Answered',
    })
  })

  it('finds the consult that is still open for the same finding, day and place', () => {
    const consults = [consult]
    expect(openConsult(consults, 'pattern:cardiac', 97, 'transit', T0 + 1000)).toBe(consult)
    expect(openConsult(consults, 'pattern:cardiac', 97, 'transit', T0 + 1_200_000)).toBeUndefined()
    expect(openConsult(consults, 'pattern:cardiac', 98, 'transit', T0 + 1000)).toBeUndefined()
    expect(openConsult(consults, 'pattern:cardiac', 97, 'moon', T0 + 1000)).toBeUndefined()
    expect(openConsult(consults, null, 97, 'transit', T0 + 1000)).toBeUndefined()
  })
})

describe('simulated replies', () => {
  it('has a reply of its own for every pattern the engine knows', () => {
    const ids = ['cardiac', 'atmosphere', 'infection', 'behavioral', 'co2', 'deconditioning'].map((p) => `pattern:${p}`)
    const texts = new Set(ids.map((id) => replyFor(id).text))
    expect(texts.size).toBe(ids.length)
    expect(texts.has(replyFor('something:else').text)).toBe(false)
  })

  it('answers single indicators by their kind', () => {
    expect(replyFor('range:glucose')).toBe(replyFor('range:bodyTemp'))
    expect(replyFor('drift:restingHr')).toBe(replyFor('drift:mood'))
    expect(replyFor('range:glucose')).not.toBe(replyFor('drift:glucose'))
  })

  it('falls back to a generic reply for anything unknown', () => {
    const fallback = replyFor('something:else')
    expect(fallback.text).toMatch(/agree with the on-board advice/)
    expect(replyFor('pattern:unknown')).toBe(fallback)
    expect(replyFor('')).toBe(fallback)
    expect(replyFor('constructor')).toBe(fallback)
    expect(replyFor('toString:x')).toBe(fallback)
  })

  it('answers a routine status report as such', () => {
    expect(replyFor(null).text).toMatch(/Status report received/)
  })

  it('answers every finding of the simulated mission', () => {
    for (let day = 1; day <= MISSION_DAYS; day++) {
      for (const finding of evaluate(readings, day).findings) {
        expect(replyFor(finding.id).text.length).toBeGreaterThan(40)
      }
    }
  })

  it('never overrules the on-board advice', () => {
    for (const reply of ALL_REPLIES) {
      // Every reply either agrees outright or adds nothing; none tells the crew to stop or ignore a step.
      expect(reply.text).toMatch(/agree|Nothing to add/)
      expect(reply.text).not.toMatch(/\b(ignore|disregard|instead of|stop taking|do not follow|wrong)\b/i)
    }
  })

  it('uses no dashes or middle dots', () => {
    for (const reply of ALL_REPLIES) expect(reply.text).not.toMatch(DASHES_AND_DOTS)
  })
})

describe('on-board advice', () => {
  it("is the action of today's most urgent finding", () => {
    const evaluation = evaluate(readings, 56)
    expect(onboardAdvice(evaluation)).toBe(evaluation.findings[0].action)
  })

  it('splits into one step per sentence', () => {
    expect(
      splitSteps(
        'Stop all activity and call the Crew Medical Officer now. Start the onboard checklist, give oxygen if blood oxygen is below 90.5 %.',
      ),
    ).toEqual([
      'Stop all activity and call the Crew Medical Officer now.',
      'Start the onboard checklist, give oxygen if blood oxygen is below 90.5 %.',
    ])
  })

  it('keeps decimal numbers together and copes with empty advice', () => {
    expect(splitSteps('Re-measure if above 37.5 degrees. Rest.')).toEqual(['Re-measure if above 37.5 degrees.', 'Rest.'])
    expect(splitSteps('')).toEqual([])
  })
})

describe('ship clock', () => {
  it('runs in real time by default', () => {
    const clock = startClock(T0)
    expect(clock.rate).toBe(1)
    expect(shipNow(clock, T0 + 90_000)).toBe(T0 + 90_000)
  })

  it('runs 60 times faster in fast-forward, from the moment it is switched on', () => {
    const fast = withRate(startClock(T0), T0 + 10_000, FAST_FORWARD_RATE)
    expect(shipNow(fast, T0 + 10_000)).toBe(T0 + 10_000)
    expect(shipNow(fast, T0 + 40_000)).toBe(T0 + 10_000 + 30 * 60_000)
  })

  it('keeps the time gained when it returns to real time', () => {
    const fast = withRate(startClock(T0), T0, FAST_FORWARD_RATE)
    const slow = withRate(fast, T0 + 30_000, 1)
    expect(shipNow(slow, T0 + 31_000)).toBe(T0 + 30 * 60_000 + 1000)
  })

  it('never runs backwards when the computer clock is set back', () => {
    expect(shipNow(startClock(T0), T0 - 60_000)).toBe(T0)
  })
})

describe('keeping the ledger', () => {
  it('survives a round trip through storage', () => {
    const ledger = addConsult({ consults: [], clock: withRate(startClock(T0), T0, FAST_FORWARD_RATE) }, consultOn(97))
    expect(parseLedger(serializeLedger(ledger), T0 + 5000)).toEqual(ledger)
  })

  it('starts empty and in real time when nothing is stored', () => {
    expect(parseLedger(null, T0)).toEqual(emptyLedger(T0))
    expect(parseLedger('', T0)).toEqual(emptyLedger(T0))
  })

  it('starts empty when the stored text is damaged', () => {
    for (const raw of ['{', 'null', '42', '"text"', '[]', '{"consults":"x","clock":7}']) {
      expect(parseLedger(raw, T0)).toEqual(emptyLedger(T0))
    }
  })

  it('drops entries that do not fit and keeps the rest', () => {
    const good = consultOn(56)
    const raw = JSON.stringify({
      consults: [good, { ...good, profile: 'venus' }, { ...good, sentAt: 'now' }, { ...good, status: 'fine' }, null, 3],
      clock: { rate: 7, realAt: T0, shipAt: T0 },
    })
    const ledger = parseLedger(raw, T0 + 1000)
    expect(ledger.consults).toEqual([good])
    // An unknown speed is not trusted either.
    expect(ledger.clock).toEqual(startClock(T0 + 1000))
  })

  it('puts the newest consult first and keeps the ledger short', () => {
    let ledger = emptyLedger(T0)
    for (let i = 0; i < MAX_LEDGER_ENTRIES + 3; i++) ledger = addConsult(ledger, consultOn(56, 'transit', `c${i}`))
    expect(ledger.consults).toHaveLength(MAX_LEDGER_ENTRIES)
    expect(ledger.consults[0].id).toBe(`c${MAX_LEDGER_ENTRIES + 2}`)
  })
})
