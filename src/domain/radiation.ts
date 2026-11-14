import { classify } from './metrics'
import { MISSION_DAYS } from './simulator'

/**
 * What makes radiation different from every other indicator: the dose adds
 * up over the whole mission and never goes back down, and a solar particle
 * event asks for one crew action within about an hour. This file holds the
 * running total, its projection, the storm shelter procedure and its clocks.
 *
 * Every figure cited here was checked against search results for the source
 * named beside it. Add a figure only after the same check.
 */

/** NASA's career limit for the effective dose from spaceflight, in mSv (NASA-STD-3001). */
export const CAREER_LIMIT_MSV = 600

/** Quiet days averaged for the projection. */
export const PROJECTION_WINDOW_DAYS = 14

/** The lowest daily dose a chart with a logarithmic axis can place. */
export const MIN_PLOTTED_DOSE = 0.5

type Series = ReadonlyMap<number, number>

/** Sums of readings in steps of 0.1 pick up floating point dust; this removes it. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** True when a daily dose is in the range that asks the crew to take shelter. */
export function isShelterDose(dose: number): boolean {
  const status = classify('radiationDose', dose).status
  return status === 'act' || status === 'critical'
}

// ---------------------------------------------------------------------------
// The running total
// ---------------------------------------------------------------------------

export interface DoseDay {
  day: number
  /** Dose counted for this day, in mSv. */
  dose: number
  /** True when the day has no reading and the typical dose is counted instead. */
  estimated: boolean
  /** Total from mission day 1 up to and including this day, in mSv. */
  cumulative: number
  /** True when the reading is in the solar particle event range. */
  event: boolean
}

/**
 * The typical daily dose so far: the median of the readings from mission day
 * 1 to `toDay`. A median, so that a solar particle event does not move it.
 * Null when no mission day has a reading.
 */
export function typicalDailyDose(series: Series, toDay: number): number | null {
  const doses: number[] = []
  for (let day = 1; day <= toDay; day++) {
    const dose = series.get(day)
    if (dose !== undefined) doses.push(dose)
  }
  if (doses.length === 0) return null
  doses.sort((a, b) => a - b)
  const mid = doses.length >> 1
  return doses.length % 2 === 1 ? doses[mid] : tidy((doses[mid - 1] + doses[mid]) / 2)
}

/**
 * One entry per mission day from 1 to `toDay`, with the running total.
 *
 * The body received a dose on a day without a reading as well, so leaving
 * the day out would understate the total. Such a day is counted at the
 * typical daily dose so far and marked as estimated. Days before launch do
 * not count: the limit is for spaceflight exposure. Empty when no mission
 * day has a reading.
 */
export function doseLog(series: Series, toDay: number): DoseDay[] {
  const typical = typicalDailyDose(series, toDay)
  if (typical === null) return []
  const log: DoseDay[] = []
  let cumulative = 0
  for (let day = 1; day <= toDay; day++) {
    const reading = series.get(day)
    const dose = reading ?? typical
    cumulative = tidy(cumulative + dose)
    log.push({
      day,
      dose,
      estimated: reading === undefined,
      cumulative,
      event: reading !== undefined && isShelterDose(reading),
    })
  }
  return log
}

/** The mission dose so far: the total on the last day of the log, 0 for an empty log. */
export function totalDose(log: DoseDay[]): number {
  return log.length === 0 ? 0 : log[log.length - 1].cumulative
}

/** Share of the career limit as a fraction: 0.5 is half the limit. Not capped at 1. */
export function limitShare(dose: number, limit = CAREER_LIMIT_MSV): number {
  return dose / limit
}

// ---------------------------------------------------------------------------
// Solar particle events
// ---------------------------------------------------------------------------

export interface DoseEvent {
  firstDay: number
  lastDay: number
  /** Everything received on the event days, in mSv. */
  dose: number
  /** The highest daily dose of the event and the day it fell on. */
  peak: number
  peakDay: number
}

/** Runs of consecutive days whose reading is in the solar particle event range. */
export function solarEvents(log: DoseDay[]): DoseEvent[] {
  const events: DoseEvent[] = []
  let open: DoseEvent | null = null
  for (const entry of log) {
    if (!entry.event) {
      open = null
      continue
    }
    if (open === null) {
      open = { firstDay: entry.day, lastDay: entry.day, dose: 0, peak: entry.dose, peakDay: entry.day }
      events.push(open)
    }
    open.lastDay = entry.day
    open.dose = tidy(open.dose + entry.dose)
    if (entry.dose > open.peak) {
      open.peak = entry.dose
      open.peakDay = entry.day
    }
  }
  return events
}

/** The event a mission day belongs to, if any. */
export function eventOn(events: DoseEvent[], day: number): DoseEvent | null {
  return events.find((e) => day >= e.firstDay && day <= e.lastDay) ?? null
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface Projection {
  /** The recent average of quiet days, in mSv per day. */
  ratePerDay: number
  /** How many days the average is taken over. */
  basisDays: number
  /** Mission days still ahead. */
  daysLeft: number
  /** Dose the remaining days would add at this rate, in mSv. */
  added: number
  /** Projected mission dose on the last mission day, in mSv. */
  total: number
  /** Projected share of the career limit, as a fraction. */
  share: number
}

/**
 * Projects the mission dose to the last mission day at the recent average
 * rate: the mean of the last `window` measured days outside a solar particle
 * event. Event days are left out because nobody can foresee the next event;
 * the projection therefore assumes there is none. Null without a quiet,
 * measured day to average.
 */
export function projectDose(
  log: DoseDay[],
  missionDays = MISSION_DAYS,
  window = PROJECTION_WINDOW_DAYS,
): Projection | null {
  const quiet = log.filter((d) => !d.estimated && !d.event).slice(-window)
  if (quiet.length === 0) return null
  const ratePerDay = quiet.reduce((sum, d) => sum + d.dose, 0) / quiet.length
  const daysLeft = Math.max(0, missionDays - log[log.length - 1].day)
  const added = tidy(ratePerDay * daysLeft)
  const total = tidy(totalDose(log) + added)
  return { ratePerDay: tidy(ratePerDay), basisDays: quiet.length, daysLeft, added, total, share: limitShare(total) }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface Source {
  id: string
  /** A few words that name the source where it is cited in running text. */
  short: string
  /** Authors or the body that published the source. */
  authors: string
  /** Left out when the year could not be confirmed. */
  year?: number
  title: string
  url: string
  /** What this page takes from the source, in one plain sentence. */
  usedFor: string
}

export const SOURCES = {
  zeitlin2013: {
    id: 'zeitlin2013',
    short: 'Zeitlin and colleagues, 2013',
    authors: 'Zeitlin and colleagues',
    year: 2013,
    title: 'Measurements of Energetic Particle Radiation in Transit to Mars on the Mars Science Laboratory, Science',
    url: 'https://doi.org/10.1126/science.1235989',
    usedFor:
      'The steady deep-space dose of about 1.8 mSv per day, measured inside the spacecraft that carried the Curiosity rover to Mars (no crew on board).',
  },
  careerLimit: {
    id: 'careerLimit',
    short: 'NASA-STD-3001 technical brief',
    authors: 'NASA Office of the Chief Health and Medical Officer',
    title: 'Radiation Protection, technical brief on NASA-STD-3001',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf',
    usedFor:
      "The career limit: the total effective dose from spaceflight over an astronaut's career is to stay below 600 mSv, for all ages and sexes.",
  },
  orionShelter: {
    id: 'orionShelter',
    short: 'NASA shelter evaluation, 2016',
    authors: 'NASA',
    year: 2016,
    title: 'Scientists and Engineers Evaluate Orion Radiation Protection Plan',
    url: 'https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/',
    usedFor:
      'The storm shelter: in a test on the ground, a crew built a shelter from stowage bags in the central part of the Orion crew module. The plan is to build it within an hour of the warning and to stay for as long as 24 hours.',
  },
  storm1972: {
    id: 'storm1972',
    short: 'NASA, 2019',
    authors: 'NASA (L. Tran)',
    year: 2019,
    title: 'How NASA Will Protect Astronauts From Space Radiation at the Moon',
    url: 'https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon',
    usedFor:
      'The solar storm of August 1972 fell between the Apollo 16 and Apollo 17 missions, when no astronauts were in its path. NASA watches the Sun with its spacecraft to give astronauts the all-clear after an event.',
  },
  artemis1: {
    id: 'artemis1',
    short: 'George and colleagues, 2024',
    authors: 'George and colleagues',
    year: 2024,
    title: 'Space radiation measurements during the Artemis I lunar mission, Nature',
    url: 'https://doi.org/10.1038/s41586-024-07927-7',
    usedFor:
      'How much shielding can matter: inside the Orion spacecraft (no crew on board) the dose rate differed up to fourfold between the most and the least shielded places while it crossed the proton belt around Earth, which resembles a large solar particle event.',
  },
  hazard: {
    id: 'hazard',
    short: 'NASA hazard page',
    authors: 'NASA Human Research Program',
    title: 'Hazard: Space Radiation',
    url: 'https://www.nasa.gov/hrp/hazard-space-radiation/',
    usedFor: 'Space radiation as the first of the five hazards of human spaceflight.',
  },
  cancerRisk: {
    id: 'cancerRisk',
    short: 'NASA cancer risk page',
    authors: 'NASA Human Research Program',
    title: 'Risk of Radiation-Induced Cancers',
    url: 'https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/',
    usedFor:
      'Why the total matters: radiation beyond low Earth orbit may raise the risk of cancer later in life. Shielding works against solar particle events but hardly against galactic cosmic rays.',
  },
  acuteSyndrome: {
    id: 'acuteSyndrome',
    short: 'NASA evidence report',
    authors: 'NASA Human Research Program',
    title: 'Evidence Report: Risk of Acute Radiation Syndromes Due to Solar Particle Events',
    url: 'https://ntrs.nasa.gov/citations/20160003870',
    usedFor: 'The early symptoms to watch for after a large dose: nausea, vomiting, loss of appetite and tiredness.',
  },
  background: {
    id: 'background',
    short: 'UNSCEAR, 2026',
    authors: 'United Nations Scientific Committee on the Effects of Atomic Radiation (UNSCEAR)',
    year: 2026,
    title: 'Evaluation of public exposure to ionizing radiation, United Nations press release',
    url: 'https://unis.unvienna.org/unis/en/pressrels/2026/unisous453.html',
    usedFor: 'Natural background radiation on Earth: about 3 mSv per year as a world average.',
  },
  chestXray: {
    id: 'chestXray',
    short: 'RadiologyInfo.org',
    authors: 'RadiologyInfo.org (Radiological Society of North America and American College of Radiology)',
    title: 'Radiation Dose from X-Ray and CT Exams',
    url: 'https://www.radiologyinfo.org/en/info/safety-xray',
    usedFor: 'One chest X-ray of an adult: about 0.1 mSv.',
  },
  station: {
    id: 'station',
    short: 'NASA fact sheet',
    authors: 'NASA',
    title: 'NASA Facts: Understanding Space Radiation (archived fact sheet)',
    url: 'https://webarchive.library.unt.edu/eot2008/20090112024921/http://spaceflight.nasa.gov/spacenews/factsheets/pdfs/radiation.pdf',
    usedFor:
      'Six months on the International Space Station: on average about 80 mSv at solar maximum and about 160 mSv at solar minimum. An older figure; some newer estimates are lower.',
  },
} as const satisfies Record<string, Source>

export type SourceId = keyof typeof SOURCES

/** The order the sources are listed in on the page. */
export const SOURCE_ORDER: SourceId[] = [
  'hazard',
  'zeitlin2013',
  'careerLimit',
  'cancerRisk',
  'orionShelter',
  'storm1972',
  'artemis1',
  'acuteSyndrome',
  'background',
  'chestXray',
  'station',
]

// ---------------------------------------------------------------------------
// Everyday comparisons
// ---------------------------------------------------------------------------

export interface Comparison {
  id: 'chestXray' | 'background' | 'station'
  label: string
  /** The dose of one of these, in mSv. A range when the source gives one. */
  low: number
  high: number
  source: SourceId
}

/** Familiar doses, smallest first. They show orders of magnitude, not exact equivalence. */
export const COMPARISONS: Comparison[] = [
  { id: 'chestXray', label: 'One chest X-ray', low: 0.1, high: 0.1, source: 'chestXray' },
  { id: 'background', label: 'One year of natural background radiation on Earth', low: 3, high: 3, source: 'background' },
  { id: 'station', label: 'Six months on the International Space Station', low: 80, high: 160, source: 'station' },
]

export interface Equivalent {
  comparison: Comparison
  /** How many of the comparison the dose equals. A range when the comparison is one. */
  fewest: number
  most: number
}

/** How many of each everyday comparison a dose equals. */
export function equivalents(dose: number): Equivalent[] {
  return COMPARISONS.map((comparison) => ({
    comparison,
    fewest: dose / comparison.high,
    most: dose / comparison.low,
  }))
}

// ---------------------------------------------------------------------------
// Storm shelter procedure
// ---------------------------------------------------------------------------

export interface ShelterStep {
  id: string
  title: string
  detail: string
  /** Set when the step follows a published source. */
  source?: SourceId
  /** How the step relates to its source, shown beside the step. */
  sourceNote?: string
}

/**
 * The storm shelter checklist, in the order the crew works through it. A
 * prototype written for this project, not a flight procedure; steps that
 * follow a published source name it.
 */
export const SHELTER_STEPS: ShelterStep[] = [
  {
    id: 'inside',
    title: 'Stop outside work. Get everyone inside.',
    detail:
      'End any spacewalk and any work in thinly shielded parts of the vehicle. Tell every crew member that a solar particle event has started.',
  },
  {
    id: 'build',
    title: 'Build the shelter in the best shielded part of the vehicle.',
    detail:
      'Stack stowage bags around the shelter space, so that as much mass as possible sits between you and the outside. Aim to finish within about 1 hour of the alarm.',
    source: 'orionShelter',
    sourceNote: 'From the NASA shelter evaluation: shelter built from stowage bags, within an hour',
  },
  {
    id: 'crew',
    title: 'Get all crew into the shelter.',
    detail: 'Count the crew. When the last person is inside, start the shelter clock.',
  },
  {
    id: 'dosimeter',
    title: 'Keep your dosimeter on you. Log the dose.',
    detail:
      'Read the dosimeter when you enter the shelter and once every hour after that. Log each reading with its time.',
  },
  {
    id: 'stay',
    title: 'Stay in the shelter until the dose rate is back to normal.',
    detail:
      'This can take up to 24 hours. Leave only for tasks that cannot wait, and keep them short. If you can reach mission control, wait for their all-clear.',
    source: 'orionShelter',
    sourceNote: 'From the NASA shelter evaluation: a stay of as long as 24 hours',
  },
  {
    id: 'report',
    title: 'Report to mission control.',
    detail:
      'Send the time of the alarm, the dose readings and the state of the crew. Do not wait for an answer before you take shelter.',
  },
  {
    id: 'symptoms',
    title: 'Watch for symptoms and log them.',
    detail:
      'Nausea, vomiting, loss of appetite or unusual tiredness in the next hours and days can be signs of a high dose. Tell the Crew Medical Officer about any of them.',
    source: 'acuteSyndrome',
    sourceNote: 'Symptoms from the NASA evidence report on acute radiation syndromes',
  },
]

/** The dose rate of the example event that a drill uses, in mSv per day. */
export const DRILL_EXAMPLE_DOSE = 40

// ---------------------------------------------------------------------------
// Illustrative shelter benefit
// ---------------------------------------------------------------------------

/**
 * The assumed factor by which the shelter cuts the dose from solar particles.
 * An assumption the crew member can move within this range. The upper end is
 * the largest difference measured between places inside Orion on Artemis I;
 * no factor here describes a real shelter.
 */
export const SHELTER_FACTOR = { min: 1.5, max: 4, step: 0.5, initial: 2 } as const

export interface ShelterEstimate {
  /** Dose over the period in the open cabin, in mSv. All three are rounded to 0.1. */
  unsheltered: number
  /** Dose over the same period in the shelter, in mSv. */
  sheltered: number
  /** The difference: what the shelter avoids, in mSv. */
  avoided: number
}

/**
 * An illustration of what a shelter avoids, not a prediction. It assumes that
 * the day's dose arrives evenly over 24 hours, that the dose above the normal
 * background comes from solar particles, and that the shelter divides that
 * part by `factor`. The background is left unchanged, since shielding does
 * little against galactic cosmic rays.
 */
export function shelterEstimate(input: {
  /** The measured dose of the event day, in mSv per day. */
  dailyDose: number
  /** The normal daily dose without an event, in mSv per day. */
  backgroundPerDay: number
  /** The assumed reduction factor, kept inside the range of `SHELTER_FACTOR`. */
  factor: number
  /** Time spent in the shelter. */
  hours: number
}): ShelterEstimate {
  const factor = Math.min(SHELTER_FACTOR.max, Math.max(SHELTER_FACTOR.min, input.factor))
  const hours = Math.max(0, input.hours)
  const background = Math.min(input.dailyDose, Math.max(0, input.backgroundPerDay))
  const solar = input.dailyDose - background
  // Rounded to what is shown, so the three numbers always add up on screen.
  const shown = (dose: number) => Math.round(tidy(dose) * 10) / 10
  const unsheltered = shown((input.dailyDose * hours) / 24)
  const sheltered = shown(((background + solar / factor) * hours) / 24)
  return { unsheltered, sheltered, avoided: shown(unsheltered - sheltered) }
}

// ---------------------------------------------------------------------------
// Clocks
// ---------------------------------------------------------------------------

/** Target for a finished shelter, counted from the alarm. */
export const BUILD_TARGET_MS = 60 * 60 * 1000
/** The longest stay the crew should be ready for. */
export const SHELTER_STAY_MS = 24 * 60 * 60 * 1000

/** Clock speeds. Anything but 1 is a fast-forward for demos and must be labelled as one. */
export const CLOCK_SPEEDS = [
  { speed: 1, label: 'Real time' },
  { speed: 60, label: '1 minute per second' },
  { speed: 600, label: '10 minutes per second' },
] as const

/**
 * A stopwatch that survives a page reload: it stores when it was started, not
 * a counter that needs the page to stay open.
 */
export interface Clock {
  /** Time counted before the latest start, in ms. */
  banked: number
  /** Wall-clock time of the latest start, in ms; null while the clock stands still. */
  startedAt: number | null
  /** How many clock seconds pass per real second. */
  speed: number
}

export function newClock(speed = 1): Clock {
  return { banked: 0, startedAt: null, speed }
}

export function isRunning(clock: Clock): boolean {
  return clock.startedAt !== null
}

/** Time on the clock at wall-clock time `now`, in ms. */
export function elapsedMs(clock: Clock, now: number): number {
  if (clock.startedAt === null) return clock.banked
  // A wall clock set back while the clock runs must not take time off it.
  return clock.banked + Math.max(0, now - clock.startedAt) * clock.speed
}

export function startClock(clock: Clock, now: number): Clock {
  return clock.startedAt === null ? { ...clock, startedAt: now } : clock
}

export function pauseClock(clock: Clock, now: number): Clock {
  return { ...clock, banked: elapsedMs(clock, now), startedAt: null }
}

/** Changes the speed without losing the time already counted. */
export function setClockSpeed(clock: Clock, speed: number, now: number): Clock {
  return { banked: elapsedMs(clock, now), startedAt: clock.startedAt === null ? null : now, speed }
}

/** "01:05:09". Hours keep counting past 24. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const part = (n: number) => String(n).padStart(2, '0')
  return `${part(Math.floor(seconds / 3600))}:${part(Math.floor(seconds / 60) % 60)}:${part(seconds % 60)}`
}

/** "1 h 5 min" or "40 min", for sentences and screen readers. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} min`
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`
}

// ---------------------------------------------------------------------------
// Numbers as text
// ---------------------------------------------------------------------------

/** A dose in mSv with one decimal, as the dosimeter resolves it. */
export function formatDose(dose: number): string {
  return dose.toFixed(1)
}

/** A fraction as a whole percentage; below 1% one decimal, so a small share is not shown as 0%. */
export function formatShare(fraction: number): string {
  const percent = fraction * 100
  return `${percent > 0 && percent < 1 ? percent.toFixed(1) : Math.round(percent)}%`
}

/** A count for a comparison: "3,090", "103", "2.4", or "0.3" for less than one. */
export function formatCount(count: number): string {
  if (count >= 100) return Math.round(count).toLocaleString('en-US')
  if (count >= 10) return String(Math.round(count))
  return String(Number(count.toFixed(1)))
}
