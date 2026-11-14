import type { MetricId, Reading } from './types'

/**
 * Generates a plausible, repeatable mission log for one crew member. It stands
 * in for real sensors until hardware input exists, and gives the dashboard
 * trends worth looking at.
 */

export const PREFLIGHT_DAYS = 14
export const MISSION_DAYS = 180

interface Profile {
  /** Pre-flight average on Earth. */
  base: number
  /** Day-to-day spread (standard deviation). */
  noise: number
  /** Lasting shift once adapted to spaceflight. */
  inFlightShift: number
  min: number
  max: number
  /** Rounding step of the instrument, e.g. 0.1 for a thermometer. */
  step: number
  /** Spread before launch, when it differs from the spread in flight. */
  groundNoise?: number
}

const PROFILE: Record<MetricId, Profile> = {
  restingHr: { base: 58, noise: 2.2, inFlightShift: 3, min: 35, max: 200, step: 1 },
  systolic: { base: 116, noise: 2.5, inFlightShift: -3, min: 60, max: 230, step: 1 },
  diastolic: { base: 74, noise: 2.5, inFlightShift: -2, min: 35, max: 140, step: 1 },
  glucose: { base: 88, noise: 3, inFlightShift: 3, min: 40, max: 400, step: 1 },
  bodyTemp: { base: 36.7, noise: 0.12, inFlightShift: 0.3, min: 34, max: 41.5, step: 0.1 },
  spo2: { base: 98, noise: 0.6, inFlightShift: -0.5, min: 70, max: 100, step: 1 },
  sleepHours: { base: 7.6, noise: 0.5, inFlightShift: -0.5, min: 2, max: 11, step: 0.1 },
  mood: { base: 4.2, noise: 0.45, inFlightShift: -0.2, min: 1, max: 5, step: 1 },
  exerciseMin: { base: 110, noise: 12, inFlightShift: 15, min: 0, max: 240, step: 5 },
  cabinCo2: { base: 0.4, noise: 0.15, inFlightShift: 2, min: 0.2, max: 9, step: 0.1 },
  // On the ground the dose is practically zero; in flight it comes from `scenarioOffset`.
  radiationDose: { base: 0, noise: 0.12, inFlightShift: 0, min: 0, max: 500, step: 0.1, groundNoise: 0 },
}

/** Days it takes for the body to settle into the in-flight shift. */
const ADAPTATION_DAYS = 12

/** Smooth 0→1→0 plateau between `start` and `end`, ramping over `ramp` days. */
function bump(day: number, start: number, end: number, ramp: number): number {
  if (day < start || day > end) return 0
  return Math.min(1, (day - start + 1) / ramp, (end - day + 1) / ramp)
}

/**
 * Daily dose in deep space from galactic cosmic rays, in mSv. Curiosity's RAD
 * instrument measured about 1.8 mSv per day on the cruise to Mars.
 */
const DEEP_SPACE_BACKGROUND = 1.8

/** A solar particle event: mission day and the dose it adds that day, in mSv. */
const SOLAR_STORM: Record<number, number> = { 23: 2.8, 24: 11.7, 25: 3.4 }

/**
 * Indicators added after the mission was first scripted. They draw their
 * random variation from a generator of their own, so adding one leaves every
 * value of the other indicators exactly as it was.
 */
const LATE_METRICS = new Set<MetricId>(['radiationDose'])

/** Mission days on which the crew member has a heart attack. */
export const HEART_ATTACK_DAYS = [97, 168]
/** Days the after-effects of a heart attack last. */
const RECOVERY_DAYS = 6

/** Strength of the after-effects: 1 on the day after a heart attack, fading to 0. */
function afterHeartAttack(day: number): number {
  for (const attackDay of HEART_ATTACK_DAYS) {
    const since = day - attackDay
    if (since >= 1 && since <= RECOVERY_DAYS) return (RECOVERY_DAYS + 1 - since) / RECOVERY_DAYS
  }
  return 0
}

/**
 * Health events written into the mission so the monitoring logic has
 * something to find. Returns the extra offset for a metric on a given day.
 */
function scenarioOffset(metric: MetricId, day: number): number {
  // Days 28 to 46: heavy workload with shifted sleep; days 36 to 44 a CO₂ scrubber degrades.
  const overload = bump(day, 28, 46, 6)
  const scrubber = bump(day, 36, 44, 3)
  // Days 70 to 77: an infection with fever.
  const infection = bump(day, 70, 77, 3)
  // Days 105 to 140: the exercise device is out of service; the heart deconditions.
  const noExercise = bump(day, 105, 140, 4)
  const deconditioning = bump(day, 108, 146, 18)
  // Days 54 to 58: the degraded scrubber fails; CO₂ removal and oxygen supply drop.
  const airFault = bump(day, 54, 58, 2)
  // Days 97 and 168: a heart attack. The heart races, blood pressure shoots up and
  // blood oxygen drops. In the days after, the heart stays fast and pressure runs low.
  const attack = HEART_ATTACK_DAYS.includes(day) ? 1 : 0
  const afterAttack = afterHeartAttack(day)

  switch (metric) {
    case 'sleepHours':
      return -1.7 * overload - 0.6 * infection - 0.4 * scrubber - 2.5 * attack - 0.8 * afterAttack
    case 'mood':
      return -1.4 * overload - 0.9 * infection - 2 * attack - afterAttack
    case 'cabinCo2':
      return 1.5 * scrubber + 3.8 * airFault
    case 'bodyTemp':
      return 1.5 * infection + 0.3 * attack
    case 'restingHr':
      return 16 * infection + 12 * deconditioning + 3 * overload + 8 * airFault + 68 * attack + 30 * afterAttack
    case 'exerciseMin':
      return -90 * infection - 88 * noExercise - 125 * attack - 110 * afterAttack
    case 'systolic':
      return 12 * deconditioning + 52 * attack - 14 * afterAttack
    case 'diastolic':
      return 6 * deconditioning + 27 * attack - 8 * afterAttack
    case 'spo2':
      return -9.5 * airFault - 6 * attack - 2 * afterAttack
    case 'radiationDose':
      // The background applies in full from launch; days 23 to 25 add a solar storm.
      return day >= 1 ? DEEP_SPACE_BACKGROUND + (SOLAR_STORM[day] ?? 0) : 0
    case 'glucose':
      // Day 153: a missed meal before the morning measurement.
      return day === 153 ? -36 : 0
    default:
      return 0
  }
}

/** Whether the crew member took this measurement on this day. */
function isMeasured(metric: MetricId, day: number): boolean {
  // Fasting blood sugar is a finger-prick test, done every third day.
  if (metric === 'glucose') return ((day % 3) + 3) % 3 === 0
  // Days 86 to 90: blood pressure measurements were skipped.
  if ((metric === 'systolic' || metric === 'diastolic') && day >= 86 && day <= 90) return false
  return true
}

/** Small seeded generator (mulberry32) so every run produces the same log. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-12)
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function roundTo(value: number, step: number): number {
  return Math.round((Math.round(value / step) * step + Number.EPSILON) * 1000) / 1000
}

export function simulateMission(seed = 2026): Reading[] {
  const random = seededRandom(seed)
  const lateRandom = seededRandom(seed + 7919)
  const readings: Reading[] = []
  const metrics = Object.keys(PROFILE) as MetricId[]

  for (let day = -PREFLIGHT_DAYS + 1; day <= MISSION_DAYS; day++) {
    const adapted = day >= 1 ? 1 - Math.exp(-day / ADAPTATION_DAYS) : 0
    for (const metric of metrics) {
      const p = PROFILE[metric]
      // Draw noise for every slot, measured or not, so that skipping a
      // measurement never shifts the values of later days.
      const spread = day < 1 && p.groundNoise !== undefined ? p.groundNoise : p.noise
      const noise = gaussian(LATE_METRICS.has(metric) ? lateRandom : random) * spread
      if (!isMeasured(metric, day)) continue
      const raw = p.base + p.inFlightShift * adapted + scenarioOffset(metric, day) + noise
      const value = roundTo(Math.min(p.max, Math.max(p.min, raw)), p.step)
      readings.push({ day, metric, value, source: 'simulated' })
    }
  }
  return readings
}
