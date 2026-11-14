/**
 * Reaction Self-Test: the rules of a browser version of the brief psychomotor
 * vigilance test (PVT-B) and how one run is scored.
 *
 * The PVT-B is the 3-minute test behind the Reaction Self-Test that crews run
 * on the International Space Station (Basner, Mollicone and Dinges, Acta
 * Astronautica 69, 2011). The values taken from it are marked `published`;
 * everything else is a project default and marked as such, here and on the page.
 */

export type TestLength = 'standard' | 'demo'

export interface Protocol {
  id: TestLength
  label: string
  /** How long one run lasts. No stimulus is started after this. */
  durationMs: number
  /** Shortest and longest wait between a response and the next stimulus. */
  minWaitMs: number
  maxWaitMs: number
  /** A response this slow or slower is a lapse of attention. */
  lapseMs: number
  /** A response faster than this cannot be a reaction to the stimulus. */
  anticipationMs: number
  /** A stimulus left unanswered this long ends the trial. */
  timeoutMs: number
  /** How long the reaction time stays frozen on screen. */
  feedbackMs: number
  /** Valid responses needed before a result is given. */
  minValid: number
}

const SHARED = {
  minWaitMs: 1000,
  maxWaitMs: 4000,
  lapseMs: 355,
  anticipationMs: 100,
  timeoutMs: 5000,
  feedbackMs: 700,
}

export const PROTOCOLS: Record<TestLength, Protocol> = {
  standard: { id: 'standard', label: 'Standard test', durationMs: 180_000, ...SHARED, minValid: 20 },
  // Long enough to show the flow, far too short to say anything about alertness.
  demo: { id: 'demo', label: 'Demo', durationMs: 30_000, ...SHARED, minValid: 5 },
}

/** The paper the published values come from, and where NASA describes the test on the station. */
export const SOURCES = [
  {
    label:
      'Basner M, Mollicone D, Dinges DF. Validity and sensitivity of a brief psychomotor vigilance test (PVT-B) to total and partial sleep deprivation. Acta Astronautica 69 (2011), pages 949 to 959.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/',
  },
  {
    label: 'NASA Spinoff 2013: the Reaction Self-Test on the International Space Station.',
    url: 'https://spinoff.nasa.gov/Spinoff2013/hm_1.html',
  },
]

export interface ProtocolRule {
  rule: string
  value: string
  basis: 'published' | 'project default'
}

const seconds = (ms: number) => {
  const s = ms / 1000
  return `${s} ${s === 1 ? 'second' : 'seconds'}`
}

/** The rules of a run in words, each with where its number comes from. */
export function protocolRules(p: Protocol): ProtocolRule[] {
  return [
    {
      rule: 'Length of the test',
      value: p.durationMs % 60_000 === 0 ? `${p.durationMs / 60_000} minutes` : seconds(p.durationMs),
      basis: p.id === 'standard' ? 'published' : 'project default',
    },
    {
      rule: 'Wait before the counter appears',
      value: `${p.minWaitMs / 1000} to ${seconds(p.maxWaitMs)}, at random`,
      basis: 'published',
    },
    { rule: 'Lapse', value: `A response of ${p.lapseMs} ms or slower`, basis: 'published' },
    {
      rule: 'False start',
      value: `A press before the counter appears, or faster than ${p.anticipationMs} ms`,
      basis: 'published',
    },
    {
      rule: 'No response',
      value: `After ${seconds(p.timeoutMs)} the trial ends and counts as a lapse`,
      basis: 'project default',
    },
    { rule: 'Your time stays on screen', value: seconds(p.feedbackMs), basis: 'project default' },
    {
      rule: 'Fewest valid responses for a result',
      value: String(p.minValid),
      basis: 'project default',
    },
  ]
}

/** The wait before the next stimulus: any value in the range is equally likely. */
export function nextWaitMs(p: Protocol, random: () => number = Math.random): number {
  return Math.round(p.minWaitMs + random() * (p.maxWaitMs - p.minWaitMs))
}

/** Whether a stimulus that appears after `waitMs` still falls inside the run. */
export function fitsInRun(p: Protocol, elapsedMs: number, waitMs: number): boolean {
  return elapsedMs + waitMs < p.durationMs
}

/** What happened in one trial. */
export type Trial =
  /** A press after the stimulus appeared, with the time it took. */
  | { kind: 'response'; ms: number }
  /** A press while no stimulus was on screen. */
  | { kind: 'falseStart' }
  /** The stimulus was left unanswered. */
  | { kind: 'timeout' }

export interface Score {
  /** Stimuli shown. */
  stimuli: number
  /** Responses that count as reactions. */
  valid: number
  meanMs: number
  medianMs: number
  /** Mean of the slowest tenth of the valid responses, where tiredness shows first. */
  slowestTenthMs: number
  /** Slow responses plus unanswered stimuli. */
  lapses: number
  falseStarts: number
  /** Unanswered stimuli, already included in `lapses`. */
  timeouts: number
}

export type ScoreResult =
  | { ok: true; score: Score }
  | { ok: false; valid: number; needed: number; falseStarts: number; reason: string }

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/**
 * Scores one run. Reaction times are taken from valid responses only: an
 * anticipated press is a false start, and an unanswered stimulus has no time
 * to average, so both are counted instead.
 */
export function scoreTrials(trials: Trial[], p: Protocol): ScoreResult {
  const times = trials.flatMap((t) => (t.kind === 'response' ? [t.ms] : []))
  const valid = times.filter((ms) => ms >= p.anticipationMs).sort((a, b) => a - b)
  const timeouts = trials.filter((t) => t.kind === 'timeout').length
  const falseStarts = trials.filter((t) => t.kind === 'falseStart').length + (times.length - valid.length)

  if (valid.length < p.minValid) {
    return {
      ok: false,
      valid: valid.length,
      needed: p.minValid,
      falseStarts,
      reason: `Only ${valid.length} valid ${valid.length === 1 ? 'response' : 'responses'} recorded. At least ${p.minValid} are needed for a result.`,
    }
  }

  const middle = valid.length / 2
  const median = Number.isInteger(middle) ? (valid[middle - 1] + valid[middle]) / 2 : valid[Math.floor(middle)]
  const slowest = valid.slice(-Math.ceil(valid.length / 10))

  return {
    ok: true,
    score: {
      stimuli: times.length + timeouts,
      valid: valid.length,
      meanMs: Math.round(mean(valid)),
      medianMs: Math.round(median),
      slowestTenthMs: Math.round(mean(slowest)),
      lapses: valid.filter((ms) => ms >= p.lapseMs).length + timeouts,
      falseStarts,
      timeouts,
    },
  }
}
