import { describe, expect, it } from 'vitest'
import {
  AU_KM,
  AUTONOMY_STEPS,
  DEFAULT_PROFILE,
  EARTH_RADIUS_KM,
  MOON_DISTANCE_KM,
  MOON_FROM_EARTH_DEG,
  PROFILES,
  PROFILE_IDS,
  SPEED_OF_LIGHT_KM_S,
  SUN_FROM_MARS_DEG,
  angularDiameterDeg,
  autonomyLevel,
  comparedWithMoon,
  formatAngle,
  formatClock,
  formatCountdown,
  formatDistance,
  formatDuration,
  lightTimeS,
  linkState,
  parseProfile,
  transitDistanceKm,
} from './missionContext'
import { MISSION_DAYS } from './simulator'

// En dash, em dash and middle dot, by code point, so this file does not contain them either.
const DASHES_AND_DOTS = new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xb7)}]`)

const ARCSEC = 1 / 3600

describe('constants', () => {
  it('uses the defined speed of light and astronomical unit', () => {
    expect(SPEED_OF_LIGHT_KM_S).toBe(299_792.458)
    expect(AU_KM).toBe(149_597_870.7)
    expect(EARTH_RADIUS_KM).toBe(6_371)
    expect(MOON_DISTANCE_KM).toBe(384_400)
  })

  it('gives 499 seconds of light time for one astronomical unit', () => {
    expect(lightTimeS(AU_KM)).toBeCloseTo(499.005, 3)
  })
})

describe('apparent size', () => {
  it('puts the full Moon seen from Earth at about 0.52 degrees', () => {
    expect(MOON_FROM_EARTH_DEG).toBeCloseTo(0.518, 3)
  })

  it('puts the Sun seen from Mars at about 0.35 degrees', () => {
    expect(SUN_FROM_MARS_DEG).toBeCloseTo(0.35, 2)
  })

  it('matches 2 x atan(radius / distance) from the Moon outward', () => {
    for (const km of [MOON_DISTANCE_KM, 0.37 * AU_KM, 2.67 * AU_KM]) {
      const atan = (2 * Math.atan(EARTH_RADIUS_KM / km) * 180) / Math.PI
      expect(angularDiameterDeg(EARTH_RADIUS_KM, km) / atan).toBeCloseTo(1, 3)
    }
  })

  it('never exceeds half the sky, even on the surface', () => {
    expect(angularDiameterDeg(EARTH_RADIUS_KM, EARTH_RADIUS_KM)).toBeCloseTo(180, 6)
    expect(angularDiameterDeg(EARTH_RADIUS_KM, 1)).toBe(180)
  })
})

describe('mission profiles', () => {
  it('opens on the Mars transit, the simulated mission', () => {
    expect(DEFAULT_PROFILE).toBe('transit')
    expect(parseProfile(undefined)).toBe('transit')
    expect(parseProfile('nonsense')).toBe('transit')
    expect(parseProfile('moon')).toBe('moon')
    expect(parseProfile(['mars-far', 'iss'])).toBe('mars-far')
  })

  it('describes every profile', () => {
    for (const id of PROFILE_IDS) {
      expect(PROFILES[id].id).toBe(id)
      expect(PROFILES[id].label).not.toBe('')
    }
  })

  it('has no meaningful delay on the space station, where Earth fills the view', () => {
    const iss = linkState('iss', 42)
    expect(iss.oneWayS).toBeLessThan(0.01)
    expect(iss.earthAngleDeg).toBeCloseTo(140.4, 1)
    expect(iss.autonomy).toBe(1)
    expect(iss.contact).toBe(true)
  })

  it('gives about 1.3 seconds one way from the Moon and an Earth of about 1.9 degrees', () => {
    const moon = linkState('moon', 42)
    expect(moon.signalKm).toBe(384_400)
    expect(moon.oneWayS).toBeCloseTo(1.282, 3)
    expect(moon.roundTripS).toBeCloseTo(2.564, 3)
    expect(moon.earthAngleDeg).toBeCloseTo(1.899, 3)
    expect(moon.autonomy).toBe(2)
  })

  it('gives about 22 minutes one way from Mars at its farthest', () => {
    const far = linkState('mars-far', 42)
    expect(far.signalKm / AU_KM).toBeCloseTo(2.67, 10)
    expect(far.oneWayS / 60).toBeCloseTo(22.2, 1)
    expect(far.roundTripS / 60).toBeCloseTo(44.4, 1)
    expect(far.earthAngleDeg / ARCSEC).toBeCloseTo(6.6, 1)
    expect(far.autonomy).toBe(4)
  })

  it('has no contact for about two weeks behind the Sun', () => {
    const blackout = linkState('blackout', 42)
    expect(blackout.contact).toBe(false)
    expect(blackout.blackoutDays).toBe(14)
    expect(blackout.signalKm / AU_KM).toBeCloseTo(2.524, 10)
    expect(blackout.autonomy).toBe(5)
    expect(linkState('moon', 42).blackoutDays).toBeNull()
  })

  it('does not depend on the day outside the transit', () => {
    for (const id of ['iss', 'moon', 'mars-far', 'blackout'] as const) {
      expect(linkState(id, 1).signalKm).toBe(linkState(id, MISSION_DAYS).signalKm)
    }
  })
})

describe('illustrative Mars transit', () => {
  it('grows from near zero to 1.5 astronomical units at arrival', () => {
    expect(transitDistanceKm(1) / AU_KM).toBeLessThan(0.001)
    expect(transitDistanceKm(MISSION_DAYS) / AU_KM).toBeCloseTo(1.5, 10)
  })

  it('arrives about 12.5 light-minutes from Earth', () => {
    expect(linkState('transit', MISSION_DAYS).oneWayS / 60).toBeCloseTo(12.475, 2)
  })

  it('moves away from Earth every single day', () => {
    for (let day = 2; day <= MISSION_DAYS; day++) {
      expect(transitDistanceKm(day)).toBeGreaterThan(transitDistanceKm(day - 1))
    }
  })

  it('stays within the mission when the day is out of range', () => {
    expect(transitDistanceKm(0)).toBe(transitDistanceKm(1))
    expect(transitDistanceKm(999)).toBe(transitDistanceKm(MISSION_DAYS))
  })

  it('gives the expected link on the demo days', () => {
    const expected: [day: number, oneWayS: number, arcsec: number, autonomy: number][] = [
      [1, 0.31, 28307, 1],
      [20, 27.7, 316.2, 3],
      [56, 129.9, 67.5, 3],
      [97, 296.1, 29.6, 4],
      [180, 748.5, 11.7, 4],
    ]
    for (const [day, oneWayS, arcsec, autonomy] of expected) {
      const link = linkState('transit', day)
      expect(link.oneWayS).toBeCloseTo(oneWayS, 1)
      expect(link.earthAngleDeg / ARCSEC / arcsec).toBeCloseTo(1, 2)
      expect(link.autonomy).toBe(autonomy)
      expect(link.illustrative).toBe(true)
    }
  })

  it('computes light time from distance and the speed of light', () => {
    for (const id of PROFILE_IDS) {
      const link = linkState(id, 97)
      expect(link.oneWayS).toBe(link.signalKm / SPEED_OF_LIGHT_KM_S)
      expect(link.roundTripS).toBe(2 * link.oneWayS)
    }
  })
})

describe('autonomy scale', () => {
  it('moves authority to the crew as the round trip grows', () => {
    expect(autonomyLevel(0.003, true)).toBe(1)
    expect(autonomyLevel(2.6, true)).toBe(2)
    expect(autonomyLevel(10, true)).toBe(3)
    expect(autonomyLevel(299, true)).toBe(3)
    expect(autonomyLevel(300, true)).toBe(4)
    expect(autonomyLevel(2665, true)).toBe(4)
  })

  it('makes the crew the medical authority without contact, whatever the distance', () => {
    expect(autonomyLevel(0.003, false)).toBe(5)
  })

  it('never hands authority back on the way out', () => {
    let previous = 1
    for (let day = 1; day <= MISSION_DAYS; day++) {
      const level = linkState('transit', day).autonomy
      expect(level).toBeGreaterThanOrEqual(previous)
      previous = level
    }
  })

  it('has one step per level, in order', () => {
    expect(AUTONOMY_STEPS.map((s) => s.level)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('formatting', () => {
  it('writes durations in plain words', () => {
    expect(formatDuration(0.0004)).toBe('under 1 millisecond')
    expect(formatDuration(0.001334)).toBe('1.3 milliseconds')
    expect(formatDuration(1.2822)).toBe('1.3 seconds')
    expect(formatDuration(27.7)).toBe('28 seconds')
    expect(formatDuration(5)).toBe('5 seconds')
    expect(formatDuration(1)).toBe('1 second')
    expect(formatDuration(59.7)).toBe('1 min')
    expect(formatDuration(600)).toBe('10 min')
    expect(formatDuration(296.1)).toBe('4 min 56 s')
    expect(formatDuration(1332.3)).toBe('22 min 12 s')
    expect(formatDuration(3264.7)).toBe('54 min 25 s')
    expect(formatDuration(4000)).toBe('1 h 7 min')
  })

  it('counts down in whole seconds still to wait', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-500)).toBe('0:00')
    expect(formatCountdown(400)).toBe('0:01')
    expect(formatCountdown(247_000)).toBe('4:07')
    expect(formatCountdown(3_753_000)).toBe('1:02:33')
  })

  it('writes distances in km, with astronomical units once they are natural', () => {
    expect(formatDistance(400)).toEqual({ km: '400 km', au: null })
    expect(formatDistance(384_400)).toEqual({ km: '384,400 km', au: null })
    expect(formatDistance(transitDistanceKm(56))).toEqual({ km: '38.9 million km', au: '0.26 astronomical units' })
    expect(formatDistance(2.67 * AU_KM)).toEqual({ km: '399 million km', au: '2.67 astronomical units' })
  })

  it('writes apparent sizes in the unit that fits', () => {
    expect(formatAngle(140.4)).toBe('140 degrees')
    expect(formatAngle(1.899)).toBe('1.9 degrees')
    expect(formatAngle(MOON_FROM_EARTH_DEG)).toBe('0.52 degrees')
    expect(formatAngle(316 * ARCSEC)).toBe('5.3 arcminutes')
    expect(formatAngle(67.5 * ARCSEC)).toBe('68 arcseconds')
    expect(formatAngle(6.58 * ARCSEC)).toBe('6.6 arcseconds')
  })

  it('compares Earth with the full Moon', () => {
    expect(comparedWithMoon(linkState('moon', 1).earthAngleDeg)).toBe('3.7 times the width of the full Moon')
    expect(comparedWithMoon(MOON_FROM_EARTH_DEG)).toBe('as wide as the full Moon')
    expect(comparedWithMoon(linkState('transit', 7).earthAngleDeg)).toBe('0.82 times the width of the full Moon')
    expect(comparedWithMoon(linkState('transit', 56).earthAngleDeg)).toBe('1/28 of the width of the full Moon')
  })

  it('reads the ship clock in UTC', () => {
    expect(formatClock(Date.UTC(2026, 10, 14, 9, 5, 3))).toBe('09:05:03')
  })

  it('uses no dashes or middle dots in any text', () => {
    const texts = [
      ...PROFILE_IDS.flatMap((id) => [PROFILES[id].label, PROFILES[id].place, PROFILES[id].basis]),
      ...AUTONOMY_STEPS.flatMap((s) => [s.title, s.when, s.detail]),
    ]
    for (const text of texts) expect(text).not.toMatch(DASHES_AND_DOTS)
  })
})
