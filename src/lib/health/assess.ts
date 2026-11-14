import "server-only";
import { config, currentMission } from "../config";
import { simulateDaily, simulateSeries } from "../sources/simulator";
import { estimateDoseRate, getSpaceWeather } from "../sources/swpc";
import { getCrew, listCrew, listReadings } from "../store/readings";
import type {
  Assessment,
  BodyRegionId,
  CrewMember,
  IndicatorId,
  Reading,
  Status,
} from "../types";
import { BODY_REGIONS, INDICATORS, classify, needsEscalation } from "./knowledge";

/**
 * Assessment engine: turns raw readings into per-indicator status, findings,
 * actions and escalation flags, then rolls them up per body region and crew.
 */

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), "unknown");
}

const REAL_CONTINUOUS_MAX_AGE_MS = 6 * 3_600_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** All readings for a crew member in the window: stored + simulated telemetry. */
export async function readingsFor(crew: CrewMember, hours = 24): Promise<Reading[]> {
  const since = Date.now() - hours * 3_600_000;
  const stored = await listReadings({ crewId: crew.id, since: new Date(since).toISOString() });
  // Continuous telemetry only needs the last day; daily check-ins cover the whole window.
  const sim = config.simulateTelemetry
    ? [...simulateSeries(crew, Math.max(since, Date.now() - 24 * 3_600_000)), ...simulateDaily(crew, since)]
    : [];
  return [...sim, ...stored].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/**
 * Representative current value for an indicator:
 *  - continuous wearable signals: median of the last 60 min at rest
 *    (readings tagged note="exercise" are skipped) -> robust to noise
 *  - manual / discrete indicators: latest reading
 * Real (manual/sensor) readings always win over simulated ones.
 */
function currentValue(id: IndicatorId, rs: Reading[]): { value: number; takenAt: string; source: Reading["source"] } | null {
  const all = rs.filter((r) => r.indicator === id);
  if (!all.length) return null;
  const def = INDICATORS[id];
  // A real (manual/sensor) reading wins over simulated telemetry, but for
  // continuous vitals only while it is recent: an old spot check must not
  // mask a week of newer telemetry.
  const realMaxAgeMs = def.continuous ? REAL_CONTINUOUS_MAX_AGE_MS : Infinity;
  const now = Date.now();
  const real = all.filter((r) => r.source !== "simulated" && now - Date.parse(r.takenAt) <= realMaxAgeMs);
  const pool = real.length ? real : all.filter((r) => r.source === "simulated");
  if (!pool.length) {
    const last = all[all.length - 1];
    return { value: last.value, takenAt: last.takenAt, source: last.source };
  }
  const last = pool[pool.length - 1];
  if (!def.continuous || pool === real) {
    return { value: last.value, takenAt: last.takenAt, source: last.source };
  }
  const cutoff = Date.parse(last.takenAt) - 60 * 60_000;
  const window = pool.filter((r) => Date.parse(r.takenAt) >= cutoff && r.note !== "exercise");
  const use = window.length ? window : pool.slice(-6);
  return {
    value: Number(median(use.map((r) => r.value)).toFixed(def.decimals)),
    takenAt: last.takenAt,
    source: last.source,
  };
}

function finding(id: IndicatorId, value: number, status: Status, crew: CrewMember): string {
  const def = INDICATORS[id];
  const v = `${value.toFixed(def.decimals)} ${def.unit}`;
  const base = crew.baseline[id];
  let delta = "";
  if (base != null && base !== 0) {
    const pct = ((value - base) / base) * 100;
    if (Math.abs(pct) >= 5) delta = ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)} % vs pre-flight baseline)`;
  }
  const word =
    status === "nominal"
      ? "within normal range"
      : status === "caution"
        ? delta && classify(id, value) === "nominal"
          ? "large change from your baseline, monitor closely"
          : "outside normal range, monitor closely"
        : "critical, act now";
  return `${def.short} ${v}${delta}: ${word}.`;
}

export interface CrewAssessment {
  crew: CrewMember;
  overall: Status;
  assessments: Assessment[];
  regions: Record<BodyRegionId, Status>;
  escalations: Assessment[];
  /** Source of each assessed value, for UI provenance labels. */
  sources: Partial<Record<IndicatorId, Reading["source"]>>;
}

export async function assessCrewMember(crewId: string): Promise<CrewAssessment | null> {
  const crew = await getCrew(crewId);
  if (!crew) return null;
  // Readings for discrete check-ins can be older; look back 7 days.
  const rs = await readingsFor(crew, 24 * 7);

  // Live radiation environment feeds the dose-rate indicator when no dosimeter value exists.
  let doseRate: number | null = null;
  try {
    const sw = await getSpaceWeather();
    doseRate = estimateDoseRate(sw.data.current.p10, currentMission()).rate;
  } catch {
    doseRate = null;
  }

  const assessments: Assessment[] = [];
  const sources: CrewAssessment["sources"] = {};
  for (const id of Object.keys(INDICATORS) as IndicatorId[]) {
    const def = INDICATORS[id];
    let cur = currentValue(id, rs);
    if (!cur && id === "radiationDoseRate" && doseRate != null) {
      cur = { value: Number(doseRate.toFixed(2)), takenAt: new Date().toISOString(), source: "noaa-swpc" };
    }
    if (!cur) {
      assessments.push({
        indicator: id,
        status: "unknown",
        value: null,
        unit: def.unit,
        takenAt: null,
        finding: `No ${def.short.toLowerCase()} recorded yet.`,
        actions: [],
        escalate: false,
      });
      continue;
    }
    let status = classify(id, cur.value);
    // Personal-baseline rule: a large shift from your own pre-flight value is
    // worth attention even inside the population range.
    const base = crew.baseline[id];
    if (status === "nominal" && def.continuous && base && Math.abs((cur.value - base) / base) >= 0.25) {
      status = "caution";
    }
    sources[id] = cur.source;
    assessments.push({
      indicator: id,
      status,
      value: cur.value,
      unit: def.unit,
      takenAt: cur.takenAt,
      finding: finding(id, cur.value, status, crew),
      actions: status === "nominal" ? [] : def.actions,
      escalate: status === "critical" || needsEscalation(id, cur.value),
    });
  }

  const byId = new Map(assessments.map((a) => [a.indicator, a]));
  const regions = Object.fromEntries(
    Object.values(BODY_REGIONS).map((r) => [r.id, worst(r.indicators.map((i) => byId.get(i)?.status ?? "unknown"))]),
  ) as Record<BodyRegionId, Status>;

  return {
    crew,
    overall: worst(assessments.map((a) => a.status)),
    assessments,
    regions,
    escalations: assessments.filter((a) => a.escalate),
    sources,
  };
}

export async function assessAllCrew(): Promise<CrewAssessment[]> {
  const crew = await listCrew();
  const out = await Promise.all(crew.map((c) => assessCrewMember(c.id)));
  return out.filter((x): x is CrewAssessment => x !== null);
}
