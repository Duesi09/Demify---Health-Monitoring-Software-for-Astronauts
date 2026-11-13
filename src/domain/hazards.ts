/**
 * The five hazards of human spaceflight defined by NASA's Human Research
 * Program. Every indicator we track is tied to the hazard that drives it.
 * Source: https://www.nasa.gov/hrp/hazards/
 */
export type HazardId = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment'

export const HAZARDS: Record<HazardId, { label: string; url: string }> = {
  radiation: {
    label: 'Space radiation',
    url: 'https://www.nasa.gov/hrp/hazard-space-radiation/',
  },
  isolation: {
    label: 'Isolation and confinement',
    url: 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/',
  },
  distance: {
    label: 'Distance from Earth',
    url: 'https://www.nasa.gov/hrp/hazard-distance-from-earth/',
  },
  gravity: {
    label: 'Gravity fields',
    url: 'https://www.nasa.gov/hrp/hazard-gravity-fields/',
  },
  environment: {
    label: 'Hostile/closed environments',
    url: 'https://www.nasa.gov/hrp/hazard-hostile-closed-environments/',
  },
}

/** NASA's list of human spaceflight risks, which the `nasaRisk` names refer to. */
export const NASA_RISKS_URL = 'https://www.nasa.gov/hrp/risks/'
