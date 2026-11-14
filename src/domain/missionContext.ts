import { MISSION_DAYS } from './simulator'

/**
 * Where the crew is and what that does to the link with Earth: how far a
 * signal travels, how long it takes, how small Earth looks, and who holds
 * medical authority. Distances are real constants; the transit trajectory and
 * the autonomy scale are illustrations and are labelled as such on screen.
 */

/** Speed of light in vacuum, km per second. Exact by definition. */
export const SPEED_OF_LIGHT_KM_S = 299_792.458
/** One astronomical unit, km. Exact by definition (IAU 2012). */
export const AU_KM = 149_597_870.7
/** Mean radius of Earth, km. */
export const EARTH_RADIUS_KM = 6_371
/** Mean distance between the centres of Earth and Moon, km. */
export const MOON_DISTANCE_KM = 384_400
/** Mean radius of the Moon, km. */
export const MOON_RADIUS_KM = 1_737.4
/** Typical altitude of the International Space Station, km. It varies by tens of km. */
export const ISS_ALTITUDE_KM = 400
/** Closest and farthest Earth to Mars distance, astronomical units (rounded). */
export const MARS_NEAREST_AU = 0.37
export const MARS_FARTHEST_AU = 2.67
/** Mean distance of Mars from the Sun, astronomical units. */
export const MARS_SUN_AU = 1.524
/** Radius of the Sun, km. */
export const SUN_RADIUS_KM = 695_700

/** Distance from Earth at the end of the simulated transit, astronomical units. Illustrative. */
export const TRANSIT_ARRIVAL_AU = 1.5
/** Shape of the illustrative transit curve: slow at first, since the ship leaves alongside Earth. */
const TRANSIT_EXPONENT = 1.5
/** Days without contact around solar conjunction. NASA pauses commanding for about two weeks. */
export const BLACKOUT_DAYS = 14

export type ProfileId = 'iss' | 'moon' | 'transit' | 'mars-far' | 'blackout'

export const PROFILE_IDS: readonly ProfileId[] = ['iss', 'moon', 'transit', 'mars-far', 'blackout']

/** The simulated mission is a Mars transit, so that is where the page opens. */
export const DEFAULT_PROFILE: ProfileId = 'transit'

export interface MissionProfile {
  id: ProfileId
  /** Short name for the switch. */
  label: string
  /** Full name of the place. */
  place: string
  /** One line on where the distance comes from. */
  basis: string
}

export const PROFILES: Record<ProfileId, MissionProfile> = {
  iss: {
    id: 'iss',
    label: 'Space station',
    place: 'International Space Station, low Earth orbit',
    basis: `About ${ISS_ALTITUDE_KM} km above the ground. Real links pass through relay satellites, which adds a fraction of a second.`,
  },
  moon: {
    id: 'moon',
    label: 'Moon',
    place: 'Moon',
    basis: 'Mean distance between the centres of Earth and Moon.',
  },
  transit: {
    id: 'transit',
    label: 'Mars transit',
    place: 'In transit to Mars',
    basis: `Illustrative trajectory: the distance grows smoothly to ${TRANSIT_ARRIVAL_AU} astronomical units on day ${MISSION_DAYS}. Not a computed orbit.`,
  },
  'mars-far': {
    id: 'mars-far',
    label: 'Mars, farthest',
    place: 'Mars at its farthest from Earth',
    basis: `Greatest distance between Earth and Mars, about ${MARS_FARTHEST_AU} astronomical units.`,
  },
  blackout: {
    id: 'blackout',
    label: 'Behind the Sun',
    place: 'Mars behind the Sun (solar conjunction)',
    basis: `Earth and Mars on opposite sides of the Sun: 1 plus ${MARS_SUN_AU} astronomical units, from the mean orbit sizes.`,
  },
}

/** Reads the `profile` query parameter; anything unknown gives the default. */
export function parseProfile(value: string | string[] | undefined): ProfileId {
  const id = Array.isArray(value) ? value[0] : value
  return PROFILE_IDS.includes(id as ProfileId) ? (id as ProfileId) : DEFAULT_PROFILE
}

/** Seconds a signal needs for `km` at the speed of light. */
export function lightTimeS(km: number): number {
  return km / SPEED_OF_LIGHT_KM_S
}

/**
 * Angle a sphere covers in the sky, in degrees, seen from `centreDistanceKm`
 * from its centre. This is the exact form, 2 x asin(radius / distance). From
 * the Moon outward it equals the familiar 2 x atan(radius / distance) to
 * within 0.02 percent; close to the sphere only the exact form is right.
 */
export function angularDiameterDeg(radiusKm: number, centreDistanceKm: number): number {
  return (2 * Math.asin(Math.min(1, radiusKm / centreDistanceKm)) * 180) / Math.PI
}

/** The full Moon seen from Earth: the size everyone knows, used as the yardstick. */
export const MOON_FROM_EARTH_DEG = angularDiameterDeg(MOON_RADIUS_KM, MOON_DISTANCE_KM)

/**
 * Smallest angle the unaided eye resolves, degrees: about 1 arcminute for
 * normal vision. Anything smaller is seen as a point, not a disc.
 */
export const EYE_LIMIT_DEG = 1 / 60

/** The Sun seen from Mars, for the blackout view. */
export const SUN_FROM_MARS_DEG = angularDiameterDeg(SUN_RADIUS_KM, MARS_SUN_AU * AU_KM)

/**
 * Distance from Earth on a day of the simulated transit, km. Illustrative:
 * a smooth curve from near zero to `TRANSIT_ARRIVAL_AU`, not a computed orbit.
 */
export function transitDistanceKm(day: number): number {
  const t = Math.min(MISSION_DAYS, Math.max(1, day)) / MISSION_DAYS
  return TRANSIT_ARRIVAL_AU * AU_KM * t ** TRANSIT_EXPONENT
}

/**
 * Steps of the autonomy scale, from the ground deciding to the crew deciding.
 * It illustrates NASA's concept of Earth-independent medical operations; the
 * steps and their limits are ours, not NASA's.
 */
export type AutonomyLevel = 1 | 2 | 3 | 4 | 5

export interface AutonomyStep {
  level: AutonomyLevel
  title: string
  /** When this step applies. */
  when: string
  detail: string
}

/** Round trip below which a conversation feels live, seconds. */
const LIVE_ROUND_TRIP_S = 1
/** Round trip below which talking still works, with a pause, seconds. */
const TALK_ROUND_TRIP_S = 10
/** Round trip below which the ground can still correct a treatment in progress, seconds. */
const STEER_ROUND_TRIP_S = 300

export const AUTONOMY_STEPS: readonly AutonomyStep[] = [
  {
    level: 1,
    title: 'The ground decides with you',
    when: 'Round trip under 1 second',
    detail: 'Live voice and video. The flight surgeon sees your data as you do and can guide every step.',
  },
  {
    level: 2,
    title: 'The ground decides, with a pause',
    when: 'Round trip under 10 seconds',
    detail: 'Talking still works. Every exchange has a gap of a few seconds.',
  },
  {
    level: 3,
    title: 'You start, the ground steers',
    when: 'Round trip under 5 minutes',
    detail: 'Talking no longer works. You start from the on-board advice and the ground corrects by message.',
  },
  {
    level: 4,
    title: 'You act first, the ground advises later',
    when: 'Round trip of 5 minutes or more',
    detail: 'The crew treats. The ground reviews what was done and advises afterwards.',
  },
  {
    level: 5,
    title: 'You are the medical authority',
    when: 'No contact',
    detail: 'Every decision is made on board until the link returns.',
  },
]

export function autonomyLevel(roundTripS: number, contact: boolean): AutonomyLevel {
  if (!contact) return 5
  if (roundTripS < LIVE_ROUND_TRIP_S) return 1
  if (roundTripS < TALK_ROUND_TRIP_S) return 2
  if (roundTripS < STEER_ROUND_TRIP_S) return 3
  return 4
}

/** Everything the page needs to know about the link for one profile and day. */
export interface LinkState {
  profile: ProfileId
  day: number
  /** Path a signal travels to Earth, km. */
  signalKm: number
  /** Distance to Earth's centre, km. Decides how large Earth looks. */
  viewKm: number
  /** False while no signal gets through at all. */
  contact: boolean
  /** Length of the blackout in days, or null when there is contact. */
  blackoutDays: number | null
  /** Light time over `signalKm`, seconds. Physical even in a blackout. */
  oneWayS: number
  roundTripS: number
  /** Apparent diameter of Earth, degrees. */
  earthAngleDeg: number
  autonomy: AutonomyLevel
  /** True when the distance comes from the illustrative trajectory. */
  illustrative: boolean
}

export function linkState(profile: ProfileId, day: number): LinkState {
  let signalKm: number
  let viewKm: number
  switch (profile) {
    case 'iss':
      // The signal goes straight down; Earth's size depends on the distance to its centre.
      signalKm = ISS_ALTITUDE_KM
      viewKm = EARTH_RADIUS_KM + ISS_ALTITUDE_KM
      break
    case 'moon':
      signalKm = viewKm = MOON_DISTANCE_KM
      break
    case 'transit':
      signalKm = viewKm = transitDistanceKm(day)
      break
    case 'mars-far':
      signalKm = viewKm = MARS_FARTHEST_AU * AU_KM
      break
    case 'blackout':
      signalKm = viewKm = (1 + MARS_SUN_AU) * AU_KM
      break
  }
  const contact = profile !== 'blackout'
  const oneWayS = lightTimeS(signalKm)
  return {
    profile,
    day,
    signalKm,
    viewKm,
    contact,
    blackoutDays: contact ? null : BLACKOUT_DAYS,
    oneWayS,
    roundTripS: 2 * oneWayS,
    earthAngleDeg: angularDiameterDeg(EARTH_RADIUS_KM, viewKm),
    autonomy: autonomyLevel(2 * oneWayS, contact),
    illustrative: profile === 'transit',
  }
}

/** Groups thousands the same way on the server and in every browser. */
function group(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Rounds to `digits` significant digits. */
function significant(value: number, digits: number): number {
  return Number(value.toPrecision(digits))
}

/** A length of time in plain words: "1.3 seconds", "4 min 56 s", "1 h 12 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 0.0995) {
    const ms = seconds * 1000
    return ms < 0.95 ? 'under 1 millisecond' : `${significant(ms, 2)} milliseconds`
  }
  // Whole values read better without a decimal: "5 seconds", not "5.0 seconds".
  if (Number.isInteger(seconds) && seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  if (seconds < 9.95) return `${seconds.toFixed(1)} seconds`
  const whole = Math.round(seconds)
  if (whole < 60) return `${whole} seconds`
  if (whole < 3600) return whole % 60 === 0 ? `${whole / 60} min` : `${Math.floor(whole / 60)} min ${whole % 60} s`
  const minutes = Math.round(whole / 60)
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** Time left on a countdown as "4:07" or "1:02:33"; counts whole seconds still to wait. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** A distance in km, and in astronomical units once that is the natural unit. */
export function formatDistance(km: number): { km: string; au: string | null } {
  const au = km / AU_KM
  return {
    km: km < 1e6 ? `${group(significant(km, 4))} km` : `${group(significant(km / 1e6, 3), km < 1e7 ? 2 : km < 1e8 ? 1 : 0)} million km`,
    au: au < 0.02 ? null : `${au.toFixed(2)} astronomical units`,
  }
}

/** An apparent size in the unit that keeps the number readable. */
export function formatAngle(deg: number): string {
  if (deg >= 9.95) return `${Math.round(deg)} degrees`
  if (deg >= 0.0995) return `${significant(deg, 2)} degrees`
  const arcsec = deg * 3600
  if (arcsec >= 119.5) return `${significant(arcsec / 60, 2)} arcminutes`
  return `${significant(arcsec, 2)} arcseconds`
}

/** How Earth compares in width with the full Moon seen from Earth. */
export function comparedWithMoon(deg: number): string {
  const ratio = deg / MOON_FROM_EARTH_DEG
  if (ratio >= 1.05) return `${significant(ratio, 2)} times the width of the full Moon`
  if (ratio > 0.95) return 'as wide as the full Moon'
  // Just under the Moon's size a fraction would round to "1/1".
  if (ratio > 0.4) return `${significant(ratio, 2)} times the width of the full Moon`
  return `1/${group(significant(1 / ratio, 2))} of the width of the full Moon`
}

/** Ship time as a clock reading in UTC, the time the space station keeps. */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
}
