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

/**
 * NASA's own page for each risk we cite, keyed by the short name NASA uses as
 * the page title. Carbon dioxide is tracked by NASA's Human System Risk Board
 * and has no page in the Human Research Program list.
 */
const RISK_PAGES: Record<string, string> = {
  'Risk of Cardiovascular Adaptations': 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
  'Risk of Inadequate Food and Nutrition': 'https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/',
  'Risk of Hypoxia': 'https://www.nasa.gov/reference/risk-of-hypoxia/',
  'Risk of Behavioral Changes and Psychiatric Disorders':
    'https://www.nasa.gov/reference/risk-of-behavioral-changes-and-psychiatric-disorders/',
  'Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness':
    'https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/',
  'Risk of Spaceflight-Induced Bone Changes': 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/',
  'Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)':
    'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
  'Risk from Inadequate Sleep and Irregular Schedules':
    'https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/',
  'Risk of Altered Immune System Responses': 'https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/',
  'Risk of Altered Sensorimotor and Vestibular Function':
    'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
  'Risk of Acute and Chronic Carbon Dioxide Exposure':
    'https://www.nasa.gov/directorates/esdmd/hhp/risk-of-acute-and-chronic-carbon-dioxide-exposure/',
}

/** The page for one risk, or NASA's full list when we have no page for it. */
export function riskUrl(nasaRisk: string): string {
  return RISK_PAGES[nasaRisk] ?? NASA_RISKS_URL
}

export function hasRiskPage(nasaRisk: string): boolean {
  return Object.hasOwn(RISK_PAGES, nasaRisk)
}

/** The order NASA lists the hazards in. */
export const HAZARD_IDS: HazardId[] = ['radiation', 'isolation', 'distance', 'gravity', 'environment']
