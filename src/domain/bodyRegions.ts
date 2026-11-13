import type { HazardId } from './hazards'
import { worst, type Evaluation, type MetricId, type Status } from './types'

/**
 * The body systems shown on the body map. Each one groups the indicators that
 * describe it and explains what spaceflight does to it, based on NASA's Human
 * Research Program hazard pages (https://www.nasa.gov/hrp/hazards/).
 */
export type RegionId = 'brain' | 'eyes' | 'immune' | 'lungs' | 'heart' | 'metabolism' | 'bones'

export interface BodyRegion {
  id: RegionId
  label: string
  /** What this body system does. */
  role: string
  /** What spaceflight does to it. */
  inSpace: string
  /** Countermeasures the crew member can take. */
  protect: string[]
  /** Indicators that describe this system; empty when none is tracked yet. */
  metrics: MetricId[]
  hazard: HazardId
  /** The matching risk in NASA's list, as NASA names it. */
  nasaRisk: string
  /** For systems without an indicator: what is planned. */
  planned?: string
}

export const BODY_REGIONS: BodyRegion[] = [
  {
    id: 'brain',
    label: 'Brain & mind',
    role: 'Controls attention, memory, mood and sleep.',
    inSpace:
      'Isolation, confinement, heavy workload and a disturbed day–night rhythm cause sleep loss. Together they can lower mood and performance on critical tasks.',
    protect: [
      'Keep a fixed sleep time and dim lights before sleep.',
      'Stay in regular contact with family and friends.',
      'Keep a journal and talk to a crewmate you trust.',
    ],
    metrics: ['sleepHours', 'mood'],
    hazard: 'isolation',
    nasaRisk: 'Risk of Behavioral Changes and Psychiatric Disorders',
  },
  {
    id: 'eyes',
    label: 'Eyes & vision',
    role: 'Sharp vision for reading procedures, watching displays and docking.',
    inSpace:
      'Body fluids shift upward to the head, which may put pressure on the eyes and cause vision problems. NASA calls this Spaceflight Associated Neuro-ocular Syndrome (SANS).',
    protect: [
      'Check your near and far vision regularly so a change is caught early.',
      'Report blurred vision or new blind spots to the Crew Medical Officer.',
    ],
    metrics: [],
    hazard: 'gravity',
    nasaRisk: 'Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)',
    planned: 'A vision self-test for this app is planned.',
  },
  {
    id: 'immune',
    label: 'Immune system',
    role: 'Defends the body against infections.',
    inSpace:
      'Stress hormone levels can rise and the immune system can change in flight. In a closed habitat, microbes pass more easily from person to person.',
    protect: [
      'Protect your sleep, eat complete meals and keep exercising.',
      'Wash hands and clean shared surfaces.',
      'Measure your temperature daily and report symptoms early.',
    ],
    metrics: ['bodyTemp'],
    hazard: 'environment',
    nasaRisk: 'Risk of Altered Immune System Responses',
  },
  {
    id: 'lungs',
    label: 'Lungs & cabin air',
    role: 'Take up oxygen and breathe out carbon dioxide.',
    inSpace:
      'All air comes from the life-support system. Without convection, exhaled CO₂ can pool around your head, and a fault can lower the oxygen you get.',
    protect: [
      'Check the cabin atmosphere readings every day.',
      'Keep air flowing where you work and sleep.',
      'Treat headache or poor concentration as a possible air problem.',
    ],
    metrics: ['spo2', 'cabinCo2'],
    hazard: 'environment',
    nasaRisk: 'Risk of Hypoxia',
  },
  {
    id: 'heart',
    label: 'Heart & circulation',
    role: 'Pumps blood and keeps blood pressure stable in every posture.',
    inSpace:
      'Without gravity, fluids move toward the head, blood volume falls and the heart has less work to do. Back in gravity, astronauts may feel lightheaded or faint.',
    protect: [
      'Do cardio and resistance exercise every day.',
      'Drink enough, especially before landing on a planet.',
      'Measure heart rate and blood pressure at the same time each day.',
    ],
    metrics: ['restingHr', 'systolic', 'diastolic'],
    hazard: 'gravity',
    nasaRisk: 'Risk of Cardiovascular Adaptations',
  },
  {
    id: 'metabolism',
    label: 'Metabolism & nutrition',
    role: 'Turns food into energy and keeps blood sugar stable.',
    inSpace:
      'Food cannot be resupplied on a long mission, and eating the same meals for months leads to menu fatigue and eating too little. An unloaded, less active body also handles sugar less well.',
    protect: [
      'Eat complete meals even when the menu bores you.',
      'Log what you eat so shortfalls are noticed.',
      'Exercise daily; it improves how the body uses sugar.',
    ],
    metrics: ['glucose'],
    hazard: 'distance',
    nasaRisk: 'Risk of Inadequate Food and Nutrition',
  },
  {
    id: 'bones',
    label: 'Bones & muscles',
    role: 'Carry the body and make every movement possible.',
    inSpace:
      'Without the load of gravity, weight-bearing bones lose on average 1% to 1.5% of their mineral density per month and muscles shrink. Calcium released from bone raises the risk of kidney stones.',
    protect: [
      'Do about 2 hours of resistance and cardio exercise every day.',
      'Drink enough to lower the risk of kidney stones.',
      'Take vitamin D as prescribed.',
    ],
    metrics: ['exerciseMin'],
    hazard: 'gravity',
    nasaRisk: 'Risk of Spaceflight-Induced Bone Changes',
  },
]

export function regionForMetric(metric: MetricId): BodyRegion {
  return BODY_REGIONS.find((r) => r.metrics.includes(metric))!
}

/** A triage level, `stale` when all data is out of date, or `unmonitored`. */
export type RegionStatus = Status | 'stale' | 'unmonitored'

/**
 * The status of a body system: the worst of its indicators and of any
 * pattern finding that involves one of them.
 */
export function regionStatus(region: BodyRegion, evaluation: Evaluation): RegionStatus {
  if (region.metrics.length === 0) return 'unmonitored'
  const fresh = region.metrics.filter((m) => !evaluation.assessments[m].stale)
  if (fresh.length === 0) return 'stale'

  let status = fresh.reduce<Status>((s, m) => worst(s, evaluation.assessments[m].status), 'nominal')
  for (const finding of evaluation.findings) {
    if (finding.kind === 'pattern' && finding.metrics.some((m) => fresh.includes(m))) {
      status = worst(status, finding.status)
    }
  }
  return status
}
