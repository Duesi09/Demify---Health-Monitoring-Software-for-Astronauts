import { PROFILE_IDS, type LinkState, type ProfileId } from './missionContext'
import { STATUS_ORDER, type Evaluation, type Status } from './types'

/**
 * The light-time ledger: a consult sent to the flight surgeon, where its
 * signal is at any moment, and the earliest moment an answer can be back.
 * Light times come from the mission context. The handling time on the ground
 * and the replies are illustrative and are labelled as such on screen.
 */

/** Seconds the ground needs when it answers on the live voice loop. Illustrative. */
export const LIVE_HANDLING_S = 5
/** Seconds the ground needs to read the data and write an answer. Illustrative. */
export const MESSAGE_HANDLING_S = 600
/** Speed of the demo clock while fast-forward is on. */
export const FAST_FORWARD_RATE = 60
/** Consults kept in the ledger; the oldest drop off first. */
export const MAX_LEDGER_ENTRIES = 8

/**
 * Near Earth the flight surgeon answers in conversation. Once talking no
 * longer works, the answer is a written message that takes time to prepare.
 */
export function handlingTimeS(link: LinkState): number {
  return link.autonomy <= 2 ? LIVE_HANDLING_S : MESSAGE_HANDLING_S
}

/** Earliest moment an answer can be back, counted from sending, seconds. */
export function earliestAnswerS(link: LinkState): number {
  return link.roundTripS + handlingTimeS(link)
}

const ROUTINE_ACTION = 'Take your routine measurements at the usual times and log them on the Today page.'
const DUE_ACTION = 'Some measurements are out of date. Take them now and log them on the Today page.'

/** What the on-board medic advises today: the action of the most urgent finding. */
export function onboardAdvice(evaluation: Evaluation): string {
  const top = evaluation.findings[0]
  if (top) return top.action
  return evaluation.reminders.length > 0 ? DUE_ACTION : ROUTINE_ACTION
}

/** Splits advice into single steps, one sentence each. */
export function splitSteps(advice: string): string[] {
  return advice
    .split(/(?<=[.!?])\s+/)
    .map((step) => step.trim())
    .filter(Boolean)
}

/** One message to the flight surgeon. Times are on the ship clock, in milliseconds. */
export interface Consult {
  id: string
  profile: ProfileId
  day: number
  /** The finding that was sent, or null for a routine status report. */
  findingId: string | null
  status: Status
  subject: string
  detail: string
  /** The on-board advice at the moment of sending. */
  onboardAction: string
  sentAt: number
  oneWayMs: number
  handlingMs: number
}

/**
 * Builds the consult for today: the most urgent finding, or a routine status
 * report when there is none. Returns null when no signal can reach Earth.
 */
export function composeConsult(evaluation: Evaluation, link: LinkState, sentAt: number, id: string): Consult | null {
  if (!link.contact) return null
  const top = evaluation.findings[0]
  const due = evaluation.reminders.length > 0
  return {
    id,
    profile: link.profile,
    day: evaluation.day,
    findingId: top?.id ?? null,
    status: top?.status ?? 'nominal',
    subject: top?.title ?? 'Routine status report',
    detail:
      top?.detail ??
      (due
        ? "No findings in today's data. Some measurements are out of date."
        : 'No findings today. Every indicator is in its normal range.'),
    onboardAction: onboardAdvice(evaluation),
    sentAt,
    oneWayMs: link.oneWayS * 1000,
    handlingMs: handlingTimeS(link) * 1000,
  }
}

export interface Milestones {
  sentAt: number
  /** The message reaches Earth. */
  earthAt: number
  /** The answer leaves Earth. */
  replySentAt: number
  /** The answer reaches the ship: the earliest moment it can be back. */
  answerAt: number
}

export function milestones(consult: Consult): Milestones {
  const earthAt = consult.sentAt + consult.oneWayMs
  const replySentAt = earthAt + consult.handlingMs
  return { sentAt: consult.sentAt, earthAt, replySentAt, answerAt: replySentAt + consult.oneWayMs }
}

export type ConsultPhase = 'to-earth' | 'handling' | 'to-ship' | 'answered'

export const PHASE_LABEL: Record<ConsultPhase, string> = {
  'to-earth': 'In transit to Earth',
  handling: 'Being handled on Earth',
  'to-ship': 'Answer in transit',
  answered: 'Answered',
}

export interface ConsultProgress {
  phase: ConsultPhase
  /** Where the signal is: 0 at the ship, 1 at Earth. */
  position: number
  /** Share of the current phase that is done, 0 to 1. */
  phaseDone: number
  /** Milliseconds until the answer is back. */
  remainingMs: number
}

const share = (elapsed: number, total: number) => (total <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / total)))

export function consultProgress(consult: Consult, now: number): ConsultProgress {
  const { sentAt, earthAt, replySentAt, answerAt } = milestones(consult)
  const remainingMs = Math.max(0, answerAt - now)
  if (now >= answerAt) return { phase: 'answered', position: 0, phaseDone: 1, remainingMs }
  if (now >= replySentAt) {
    const done = share(now - replySentAt, consult.oneWayMs)
    return { phase: 'to-ship', position: 1 - done, phaseDone: done, remainingMs }
  }
  if (now >= earthAt) {
    return { phase: 'handling', position: 1, phaseDone: share(now - earthAt, consult.handlingMs), remainingMs }
  }
  const done = share(now - sentAt, consult.oneWayMs)
  return { phase: 'to-earth', position: done, phaseDone: done, remainingMs }
}

/** The consult for the same finding, day and place that is still waiting for its answer. */
export function openConsult(
  consults: Consult[],
  findingId: string | null,
  day: number,
  profile: ProfileId,
  now: number,
): Consult | undefined {
  return consults.find(
    (c) =>
      c.findingId === findingId &&
      c.day === day &&
      c.profile === profile &&
      consultProgress(c, now).phase !== 'answered',
  )
}

/** A reply from the flight surgeon. Every reply is simulated. */
export interface Reply {
  /** Whether the reply only confirms the on-board advice or also asks for something. */
  stance: 'confirms' | 'confirms-and-adds'
  text: string
}

export const STANCE_LABEL: Record<Reply['stance'], string> = {
  confirms: 'Confirms the on-board advice',
  'confirms-and-adds': 'Confirms the on-board advice and adds a request',
}

/**
 * Replies by kind of finding. Each one backs the advice the rule engine gave
 * on board and at most asks for more data; none of them overrules it.
 */
const PATTERN_REPLIES: Record<string, Reply> = {
  'pattern:cardiac': {
    stance: 'confirms-and-adds',
    text: 'We have your data and we agree with the on-board advice: treat this as a possible heart attack. Stay at rest and keep the Crew Medical Officer with you. Send the ECG recording and note the time the symptoms began. We are staying on this and will send the next steps once the ECG is here.',
  },
  'pattern:atmosphere': {
    stance: 'confirms-and-adds',
    text: 'We see the same picture: your oxygen saturation is down while cabin CO₂ is up. We agree that the cabin air is the cause, not an illness of your own. Carry on with the on-board steps. We are checking the life-support data on our side. Send your oxygen saturation again once the air has been dealt with.',
  },
  'pattern:infection': {
    stance: 'confirms-and-adds',
    text: 'Fever with a raised heart rate fits an infection, and we agree with the on-board advice. Keep to the rest, the fluids and the temperature checks. Send the temperature log and your symptoms with the next report. The Crew Medical Officer decides on treatment from the medical kit and we will review that decision.',
  },
  'pattern:behavioral': {
    stance: 'confirms-and-adds',
    text: 'Thank you for reporting this. We agree with the on-board advice. We are reviewing your schedule to protect your sleep period. A private talk with the flight surgeon can be arranged whenever you want one.',
  },
  'pattern:co2': {
    stance: 'confirms-and-adds',
    text: 'We agree: look at the air first. We are reviewing the CO₂ removal data on our side. Tell us what you find at your sleep station, and how you sleep once the air is better.',
  },
  'pattern:deconditioning': {
    stance: 'confirms-and-adds',
    text: 'We agree: daily exercise comes first. If equipment is the obstacle, tell us what is unavailable and we will send a replacement programme. Keep logging exercise and resting heart rate so we can follow the recovery.',
  },
}

const KIND_REPLIES: Record<string, Reply> = {
  range: {
    stance: 'confirms-and-adds',
    text: 'We have your reading and agree with the on-board advice. Follow those steps and measure again as advised. Send the new value with your next report, and tell the Crew Medical Officer at once if it moves further out of range.',
  },
  drift: {
    stance: 'confirms',
    text: 'We see the same slow change against your pre-flight baseline. We agree with the on-board advice and have nothing to add for now. Keep logging every day so the trend stays visible to both of us.',
  },
}

const ROUTINE_REPLY: Reply = {
  stance: 'confirms',
  text: 'Status report received. Nothing to add from the ground. Keep to your routine measurements.',
}

const FALLBACK_REPLY: Reply = {
  stance: 'confirms',
  text: 'Message received. We agree with the on-board advice. Carry on with it and report any change.',
}

/** The simulated reply to a finding, by its id; null means a routine status report. */
export function replyFor(findingId: string | null): Reply {
  if (findingId === null) return ROUTINE_REPLY
  // Patterns are keyed by their full id, single indicators by their kind.
  const kind = findingId.split(':')[0]
  const replies = kind === 'pattern' ? PATTERN_REPLIES : KIND_REPLIES
  const key = kind === 'pattern' ? findingId : kind
  return Object.hasOwn(replies, key) ? replies[key] : FALLBACK_REPLY
}

/** Every reply text, for checks that apply to all of them. */
export const ALL_REPLIES: readonly Reply[] = [
  ...Object.values(PATTERN_REPLIES),
  ...Object.values(KIND_REPLIES),
  ROUTINE_REPLY,
  FALLBACK_REPLY,
]

/**
 * The ship clock. It runs in real time by default and can be sped up for a
 * demo, so a wait of half an hour can be shown in half a minute.
 */
export interface ShipClock {
  /** Ship seconds per real second. */
  rate: number
  /** Real time at which `shipAt` was true, milliseconds. */
  realAt: number
  shipAt: number
}

export function startClock(realNow: number): ShipClock {
  return { rate: 1, realAt: realNow, shipAt: realNow }
}

export function shipNow(clock: ShipClock, realNow: number): number {
  // A computer clock set backwards must not make the ship clock run backwards.
  return clock.shipAt + Math.max(0, realNow - clock.realAt) * clock.rate
}

/** Changes the speed from this moment on, keeping the ship time reached so far. */
export function withRate(clock: ShipClock, realNow: number, rate: number): ShipClock {
  return { rate, realAt: realNow, shipAt: shipNow(clock, realNow) }
}

export interface Ledger {
  consults: Consult[]
  clock: ShipClock
}

export function emptyLedger(realNow: number): Ledger {
  return { consults: [], clock: startClock(realNow) }
}

/** Adds a consult at the top and drops the oldest beyond the limit. */
export function addConsult(ledger: Ledger, consult: Consult): Ledger {
  return { ...ledger, consults: [consult, ...ledger.consults].slice(0, MAX_LEDGER_ENTRIES) }
}

export function serializeLedger(ledger: Ledger): string {
  return JSON.stringify(ledger)
}

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function isConsult(value: unknown): value is Consult {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    PROFILE_IDS.includes(c.profile as ProfileId) &&
    Number.isInteger(c.day) &&
    (c.findingId === null || typeof c.findingId === 'string') &&
    STATUS_ORDER.includes(c.status as Status) &&
    typeof c.subject === 'string' &&
    typeof c.detail === 'string' &&
    typeof c.onboardAction === 'string' &&
    isTime(c.sentAt) &&
    isTime(c.oneWayMs) &&
    isTime(c.handlingMs)
  )
}

/**
 * Reads a stored ledger. Stored data can be missing, cut off or from an older
 * version, so anything that does not fit is dropped instead of trusted.
 */
export function parseLedger(raw: string | null, realNow: number): Ledger {
  const fresh = emptyLedger(realNow)
  if (!raw) return fresh
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return fresh
  }
  if (typeof data !== 'object' || data === null) return fresh
  const { consults, clock } = data as { consults?: unknown; clock?: Partial<ShipClock> | null }
  const validClock =
    typeof clock === 'object' &&
    clock !== null &&
    (clock.rate === 1 || clock.rate === FAST_FORWARD_RATE) &&
    isTime(clock.realAt) &&
    isTime(clock.shipAt)
  return {
    consults: Array.isArray(consults) ? consults.filter(isConsult).slice(0, MAX_LEDGER_ENTRIES) : [],
    clock: validClock ? (clock as ShipClock) : fresh.clock,
  }
}
