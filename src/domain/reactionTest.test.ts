import { describe, expect, it } from 'vitest'
import { PROTOCOLS, fitsInRun, nextWaitMs, protocolRules, scoreTrials, type Trial } from './reactionTest'

const standard = PROTOCOLS.standard
const demo = PROTOCOLS.demo
const responses = (...times: number[]): Trial[] => times.map((ms) => ({ kind: 'response', ms }))

describe('protocol', () => {
  it('uses the published PVT-B values for the standard test', () => {
    expect(standard.durationMs).toBe(180_000)
    expect([standard.minWaitMs, standard.maxWaitMs]).toEqual([1000, 4000])
    expect(standard.lapseMs).toBe(355)
    expect(standard.anticipationMs).toBe(100)
  })

  it('keeps the demo short and marks its length as a project default', () => {
    expect(demo.durationMs).toBe(30_000)
    expect(protocolRules(demo)[0]).toMatchObject({ value: '30 seconds', basis: 'project default' })
    expect(protocolRules(standard)[0]).toMatchObject({ value: '3 minutes', basis: 'published' })
  })

  it('never lets the time on screen outlast the shortest wait', () => {
    for (const p of Object.values(PROTOCOLS)) expect(p.feedbackMs).toBeLessThan(p.minWaitMs)
  })

  it('writes the rules without dashes or middle dots', () => {
    const text = protocolRules(standard)
      .map((r) => `${r.rule} ${r.value}`)
      .join(' ')
    expect(text).not.toMatch(/[\u2013\u2014\u00b7]/)
    expect(text).toContain('1 to 4 seconds')
  })
})

describe('waiting time', () => {
  it('covers the whole range and nothing outside it', () => {
    expect(nextWaitMs(standard, () => 0)).toBe(1000)
    expect(nextWaitMs(standard, () => 0.5)).toBe(2500)
    expect(nextWaitMs(standard, () => 0.999999)).toBe(4000)
  })

  it('stays inside the range for ordinary random numbers', () => {
    for (let i = 0; i < 200; i++) {
      const wait = nextWaitMs(standard)
      expect(wait).toBeGreaterThanOrEqual(1000)
      expect(wait).toBeLessThanOrEqual(4000)
    }
  })

  it('starts no stimulus that would appear after the end of the run', () => {
    expect(fitsInRun(demo, 26_000, 3000)).toBe(true)
    expect(fitsInRun(demo, 27_000, 3000)).toBe(false)
    expect(fitsInRun(demo, 29_500, 1000)).toBe(false)
  })
})

describe('scoring', () => {
  it('reports mean and median of the valid responses', () => {
    const result = scoreTrials(responses(200, 250, 300, 350, 900), demo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score.meanMs).toBe(400)
    expect(result.score.medianMs).toBe(300)
    expect(result.score.valid).toBe(5)
    expect(result.score.stimuli).toBe(5)
  })

  it('takes the middle pair for the median of an even number of responses', () => {
    const result = scoreTrials(responses(210, 220, 240, 260, 300, 310), demo)
    expect(result.ok && result.score.medianMs).toBe(250)
  })

  it('counts a response of 355 ms or slower as a lapse', () => {
    const result = scoreTrials(responses(250, 260, 354, 355, 600), demo)
    expect(result.ok && result.score.lapses).toBe(2)
  })

  it('counts an unanswered stimulus as a lapse and leaves it out of the times', () => {
    const result = scoreTrials([...responses(250, 250, 250, 250, 250), { kind: 'timeout' }, { kind: 'timeout' }], demo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score.lapses).toBe(2)
    expect(result.score.timeouts).toBe(2)
    expect(result.score.meanMs).toBe(250)
    expect(result.score.stimuli).toBe(7)
  })

  it('counts a press before the stimulus as a false start, not as a reaction', () => {
    const result = scoreTrials([{ kind: 'falseStart' }, ...responses(240, 250, 260, 270, 280), { kind: 'falseStart' }], demo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score.falseStarts).toBe(2)
    expect(result.score.valid).toBe(5)
    expect(result.score.meanMs).toBe(260)
    // No stimulus was on screen for a false start.
    expect(result.score.stimuli).toBe(5)
  })

  it('counts a response faster than 100 ms as a false start', () => {
    const result = scoreTrials(responses(40, 99, 100, 250, 250, 250, 250), demo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score.falseStarts).toBe(2)
    expect(result.score.valid).toBe(5)
    expect(result.score.meanMs).toBe(220)
  })

  it('averages the slowest tenth, and at least the slowest response', () => {
    const twenty = responses(...Array.from({ length: 18 }, () => 250), 500, 700)
    const result = scoreTrials(twenty, standard)
    expect(result.ok && result.score.slowestTenthMs).toBe(600)

    const five = scoreTrials(responses(200, 210, 220, 230, 480), demo)
    expect(five.ok && five.score.slowestTenthMs).toBe(480)

    // 21 responses: the slowest tenth rounds up to 3.
    const twentyOne = scoreTrials(responses(...Array.from({ length: 18 }, () => 250), 300, 400, 500), standard)
    expect(twentyOne.ok && twentyOne.score.slowestTenthMs).toBe(400)
  })

  it('rounds the reported times to whole milliseconds', () => {
    const result = scoreTrials(responses(250.4, 251.3, 252.9, 260.2, 270.9), demo)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.score.meanMs).toBe(257)
    expect(result.score.medianMs).toBe(253)
  })

  it('gives no result when there are too few valid responses', () => {
    const result = scoreTrials([...responses(250, 260, 50, 270), { kind: 'falseStart' }, { kind: 'timeout' }], demo)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.valid).toBe(3)
    expect(result.needed).toBe(5)
    expect(result.falseStarts).toBe(2)
    expect(result.reason).toBe('Only 3 valid responses recorded. At least 5 are needed for a result.')
  })

  it('gives no result for a run without any trial', () => {
    const result = scoreTrials([], standard)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('Only 0 valid responses')
    expect(result.needed).toBe(20)
  })

  it('asks for more valid responses in the standard test than in the demo', () => {
    const ten = responses(...Array.from({ length: 10 }, () => 260))
    expect(scoreTrials(ten, demo).ok).toBe(true)
    expect(scoreTrials(ten, standard).ok).toBe(false)
  })

  it('does not depend on the order of the trials', () => {
    const a = scoreTrials(responses(500, 200, 300, 250, 400), demo)
    const b = scoreTrials(responses(200, 250, 300, 400, 500), demo)
    expect(a).toEqual(b)
  })
})
