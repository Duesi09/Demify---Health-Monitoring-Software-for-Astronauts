import "server-only";
import { formatUtc, SOURCE_LABEL } from "@/components/overview/format";
import type { CrewAssessment } from "@/lib/health/assess";
import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, Reading, ReadingSource, Status } from "@/lib/types";

/**
 * Server-side preparation of the crew health record. Everything time-relative
 * ("12 min ago") is computed here from the request time so server and client
 * HTML match (no hydration mismatch).
 */

export const RECORD_GROUPS: Array<{ id: string; title: string; ids: IndicatorId[] }> = [
  { id: "cardio", title: "Cardiovascular", ids: ["heartRate", "stDeviation", "systolicBP", "diastolicBP"] },
  { id: "resp", title: "Respiratory", ids: ["spo2", "respRate", "cabinCO2"] },
  { id: "metabolic", title: "Metabolic & nutrition", ids: ["glucose", "bodyMassChange", "hydration", "bodyTemp"] },
  { id: "mind", title: "Sleep & mind", ids: ["sleepHours", "mood", "stress"] },
  { id: "msk", title: "Musculoskeletal", ids: ["exerciseMinutes", "boneLoss"] },
  { id: "radiation", title: "Radiation", ids: ["radiationDoseRate", "radiationCumulative"] },
  { id: "immune", title: "Immune & eyes", ids: ["wbc", "visionChange"] },
];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface Spark {
  window: "24 h" | "7 d";
  /** [x 0..1 within the window, value] */
  points: Array<[number, number]>;
  basis: "measured" | "simulated";
}

export interface RecordRow {
  id: IndicatorId;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  value: number | null;
  status: Status;
  normal: string;
  baseline: number | null;
  /** Pre-formatted "+4 (+6 %)" or null. */
  change: string | null;
  takenUtc: string | null;
  takenRel: string | null;
  source: ReadingSource | null;
  sourceLabel: string | null;
  spark: Spark | null;
  finding: string;
  /**
   * What the "Current" value is: the resting median of the last 60 min
   * (simulated continuous telemetry), the current drill sample, or the latest
   * reading (manual / sensor / daily indicators).
   */
  basis: "median" | "drill" | "latest" | null;
}

export function relativeAge(iso: string, now: number): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function changeText(id: IndicatorId, value: number | null, baseline: number | null): string | null {
  if (value == null || baseline == null) return null;
  const d = INDICATORS[id].decimals;
  const diff = value - baseline;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const pct = baseline !== 0 ? ` (${sign}${Math.abs((diff / baseline) * 100).toFixed(0)} %)` : "";
  return `${sign}${Math.abs(diff).toFixed(d)}${pct}`;
}

/** Readings of one indicator in a window: real ones when there are enough to draw, else simulated. */
export function pickSeries(rs: Reading[], id: IndicatorId, since: number) {
  const inWindow = rs.filter((r) => r.indicator === id && Date.parse(r.takenAt) >= since);
  const real = inWindow.filter((r) => r.source !== "simulated");
  const sim = inWindow.filter((r) => r.source === "simulated");
  const useReal = real.length >= 2 || !sim.length;
  return { points: useReal ? real : sim, basis: useReal ? ("measured" as const) : ("simulated" as const) };
}

function sparkFor(id: IndicatorId, rs: Reading[], now: number): Spark | null {
  if (INDICATORS[id].continuous) {
    const since = now - DAY_MS;
    const { points, basis } = pickSeries(rs, id, since);
    if (points.length < 2) return null;
    // Average into 48 half-hour buckets so the line stays readable at 100 px.
    const buckets = new Map<number, { sum: number; n: number }>();
    for (const r of points) {
      const t = Date.parse(r.takenAt);
      if (t > now) continue;
      const b = Math.min(47, Math.floor(((t - since) / DAY_MS) * 48));
      const cur = buckets.get(b) ?? { sum: 0, n: 0 };
      cur.sum += r.value;
      cur.n += 1;
      buckets.set(b, cur);
    }
    const pts = [...buckets]
      .sort((a, b) => a[0] - b[0])
      .map(([b, { sum, n }]) => [(b + 0.5) / 48, sum / n] as [number, number]);
    // The newest sample (e.g. a live drill value) replaces the centre of its
    // own (last) bucket and is drawn at its own time. It lies after the
    // previous bucket's centre, so the line never doubles back.
    const last = points.findLast((r) => Date.parse(r.takenAt) <= now);
    if (last && pts.length) {
      pts[pts.length - 1] = [Math.min(1, Math.max(0, (Date.parse(last.takenAt) - since) / DAY_MS)), last.value];
    }
    return pts.length >= 2 ? { window: "24 h", points: pts, basis } : null;
  }
  // Daily indicators: one value per UTC day over 7 days, real entries win.
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const pts: Array<[number, number]> = [];
  let anyReal = false;
  for (let i = 0; i < 7; i++) {
    const day = new Date(todayStart - (6 - i) * DAY_MS).toISOString().slice(0, 10);
    const dayRs = rs.filter((r) => r.indicator === id && r.takenAt.startsWith(day));
    const real = dayRs.filter((r) => r.source !== "simulated");
    const pick = (real.length ? real : dayRs).at(-1);
    if (pick) {
      if (real.length) anyReal = true;
      pts.push([i / 6, pick.value]);
    }
  }
  return pts.length >= 2 ? { window: "7 d", points: pts, basis: anyReal ? "measured" : "simulated" } : null;
}

export function buildRecord(a: CrewAssessment, readings: Reading[], now: number): RecordRow[] {
  const byId = new Map(a.assessments.map((x) => [x.indicator, x]));
  return RECORD_GROUPS.flatMap((g) => g.ids).map((id) => {
    const def = INDICATORS[id];
    const as = byId.get(id);
    const value = as?.value ?? null;
    const baseline = a.crew.baseline[id] ?? null;
    const source = a.sources[id] ?? null;
    const basis: RecordRow["basis"] =
      value == null ? null : as?.drill ? "drill" : def.continuous && source === "simulated" ? "median" : "latest";
    return {
      id,
      label: def.label,
      short: def.short,
      unit: def.unit,
      decimals: def.decimals,
      value,
      status: as?.status ?? "unknown",
      normal: def.ranges.nominal,
      baseline,
      change: changeText(id, value, baseline),
      takenUtc: as?.takenAt ? formatUtc(as.takenAt) : null,
      takenRel: as?.takenAt ? relativeAge(as.takenAt, now) : null,
      source,
      sourceLabel: source ? SOURCE_LABEL[source] : null,
      spark: sparkFor(id, readings, now),
      finding: as?.finding ?? "",
      basis,
    };
  });
}
