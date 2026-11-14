import 'server-only'
import { HAZARDS } from '@/domain/hazards'
import { METRIC_IDS, METRICS } from '@/domain/metrics'
import { MISSION_DAYS } from '@/domain/simulator'
import { READING_SOURCES, STATUS_ORDER, type MetricDef } from '@/domain/types'

/**
 * The step a value must keep to. The same rule as the entry forms of the UI:
 * whole numbers for indicators without decimals, else the indicator's own step.
 */
export function inputStepOf(def: MetricDef): number {
  return def.decimals === 0 ? 1 : def.inputStep
}

function metricView(def: MetricDef) {
  return {
    id: def.id,
    label: def.label,
    unit: def.unit,
    decimals: def.decimals,
    input: { min: def.inputMin, max: def.inputMax, step: inputStepOf(def) },
    evaluatedOn: def.evaluateOn,
    staleAfterDays: def.staleAfterDays,
    // JSON has no Infinity: the open ends of the first and last band are null.
    bands: def.bands.map((band, index) => ({
      from: index === 0 ? null : def.bands[index - 1].below,
      below: Number.isFinite(band.below) ? band.below : null,
      status: band.status,
      label: band.label,
      action: band.action ?? null,
    })),
    drift: def.drift ? { direction: def.drift.direction, watch: def.drift.watch, act: def.drift.act, action: def.drift.action } : null,
    hazard: { id: def.hazard, ...HAZARDS[def.hazard] },
    reference: def.reference,
  }
}

/** The indicator catalogue as the API serves it, so a client can validate and label data without the source code. */
export function metricsCatalog() {
  return {
    notice:
      'The ranges are demo defaults taken from general clinical reference ranges. They are not flight rules and not medical advice, and need sign-off from flight surgeons before real use.',
    missionDays: { first: 1, last: MISSION_DAYS },
    statuses: [...STATUS_ORDER],
    sources: [...READING_SOURCES],
    metrics: METRIC_IDS.map((id) => metricView(METRICS[id])),
  }
}
