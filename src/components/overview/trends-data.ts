import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, Reading } from "@/lib/types";

/**
 * Server-side preparation of the overview's "Crew trends" small multiples.
 * Pure and serialisable: raw readings in, a few compact rows per chart out,
 * so the client payload stays small (24 hourly points or 7 daily points per
 * crew member and chart).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Readings stamped further ahead than this (device clock skew) are ignored, as in assess.ts. */
const FUTURE_SKEW_MS = 5 * 60_000;

export type TrendWindow = "24h" | "7d";

export interface TrendSpec {
  id: string;
  indicator: IndicatorId;
  title: string;
  /** How a point is derived, shown under the chart title. */
  method: string;
  window: TrendWindow;
  /** Resting values only: drop readings tagged note="exercise". */
  restingOnly?: boolean;
}

export const TREND_SPECS: TrendSpec[] = [
  {
    id: "rhr",
    indicator: "heartRate",
    title: "Resting heart rate",
    method: "Hourly median at rest, last 24 h",
    window: "24h",
    restingOnly: true,
  },
  { id: "sbp", indicator: "systolicBP", title: "Systolic blood pressure", method: "Hourly median, last 24 h", window: "24h" },
  { id: "spo2", indicator: "spo2", title: "SpO₂", method: "Hourly median, last 24 h", window: "24h" },
  { id: "sleep", indicator: "sleepHours", title: "Sleep", method: "One value per day, last 7 days", window: "7d" },
  { id: "stress", indicator: "stress", title: "Stress", method: "One value per day, last 7 days", window: "7d" },
];

export interface TrendCrew {
  id: string;
  name: string;
}

export interface TrendRow {
  /** ISO start of the hour or UTC day. */
  t: string;
  /** Value per crew id (null = no reading in that bucket). */
  v: Record<string, number | null>;
  /** Crew ids whose value here comes from crew or device entries rather than the simulator. */
  real?: string[];
}

export interface TrendChart {
  id: string;
  title: string;
  method: string;
  window: TrendWindow;
  unit: string;
  decimals: number;
  /** Nominal band (inclusive, in display precision). */
  band: { from: number; to: number } | null;
  /** Human readable nominal range from the knowledge base. */
  nominalText: string;
  yDomain: [number, number];
  /** Evenly spaced, round tick values inside yDomain. */
  yTicks: number[];
  rows: TrendRow[];
}

export interface CrewTrendsData {
  crew: TrendCrew[];
  charts: TrendChart[];
  /** True when at least one chart has at least one value. */
  hasData: boolean;
  /** True when every plotted value comes from the demo simulator. */
  allSimulated: boolean;
  /** ISO time the data was prepared. */
  generatedAt: string;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * The nominal interval implied by an indicator's piecewise `steps`
 * (value < steps[i][0] => steps[i][1]; >= last => top), in display precision.
 * Open ends are capped by the plausible input range.
 */
export function nominalBand(id: IndicatorId): { from: number; to: number } | null {
  const def = INDICATORS[id];
  const unit = 10 ** -def.decimals;
  const bounds: Array<[number, number, (typeof def.steps)[number][1]]> = [];
  let lo = def.inputRange[0];
  for (const [th, st] of def.steps) {
    bounds.push([lo, th, st]);
    lo = th;
  }
  const nominal = bounds.find(([, , st]) => st === "nominal");
  if (nominal) {
    const [from, th] = nominal;
    // Upper bound is exclusive: the largest display value strictly below it.
    const to = round(Math.ceil(round(th * 10 ** def.decimals, 6)) / 10 ** def.decimals - unit, def.decimals);
    return { from: round(Math.max(from, def.inputRange[0]), def.decimals), to };
  }
  if (def.top === "nominal") {
    return { from: round(lo, def.decimals), to: def.inputRange[1] };
  }
  return null;
}

/**
 * Round y-axis: about four intervals with a 1/2/5 x 10^k step (no finer than
 * the indicator's display precision), padded so lines never touch the frame,
 * and clamped to the plausible input range.
 */
export function niceAxis(
  min: number,
  max: number,
  decimals: number,
  range: [number, number],
): { domain: [number, number]; ticks: number[] } {
  const minStep = 10 ** -decimals;
  const span = Math.max(max - min, minStep);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(minStep, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  let lo = Math.floor(round(min / step, 9)) * step;
  let hi = Math.ceil(round(max / step, 9)) * step;
  // Keep a little air between the data/band and the frame.
  if (min - lo < step * 0.25) lo -= step;
  if (hi - max < step * 0.25) hi += step;
  lo = round(Math.max(range[0], lo), decimals);
  hi = round(Math.min(range[1], hi), decimals);
  const ticks: number[] = [];
  for (let v = Math.ceil(round(lo / step, 9)) * step; v <= hi + step / 1e6; v += step) ticks.push(round(v, decimals));
  return { domain: [lo, hi], ticks };
}

function notInFuture(r: Reading, now: number): boolean {
  const t = Date.parse(r.takenAt);
  return Number.isFinite(t) && t <= now + FUTURE_SKEW_MS;
}

/** Readings that belong in a trend line: no future stamps, no training-scenario samples. */
function usable(r: Reading, spec: TrendSpec, now: number): boolean {
  if (r.indicator !== spec.indicator || !notInFuture(r, now)) return false;
  if (r.note?.startsWith("scenario:")) return false;
  if (spec.restingOnly && r.note === "exercise") return false;
  return true;
}

/** Real (crew/device) readings win over simulated ones within a bucket. */
function preferReal(rs: Reading[]): { pool: Reading[]; real: boolean } {
  const real = rs.filter((r) => r.source !== "simulated");
  return real.length ? { pool: real, real: true } : { pool: rs, real: false };
}

function buildChart(spec: TrendSpec, crew: TrendCrew[], readings: Record<string, Reading[]>, now: number): TrendChart {
  const def = INDICATORS[spec.indicator];
  const size = spec.window === "24h" ? HOUR_MS : DAY_MS;
  const count = spec.window === "24h" ? 24 : 7;
  const last = Math.floor(now / size);
  const buckets = Array.from({ length: count }, (_, i) => last - count + 1 + i);
  const first = buckets[0];

  const rows: TrendRow[] = buckets.map((b) => ({ t: new Date(b * size).toISOString(), v: {} }));
  for (const c of crew) {
    const byBucket = new Map<number, Reading[]>();
    for (const r of readings[c.id] ?? []) {
      if (!usable(r, spec, now)) continue;
      const b = Math.floor(Date.parse(r.takenAt) / size);
      if (b < first || b > last) continue;
      const list = byBucket.get(b);
      if (list) list.push(r);
      else byBucket.set(b, [r]);
    }
    buckets.forEach((b, i) => {
      const rs = byBucket.get(b);
      const row = rows[i];
      if (!rs?.length) {
        row.v[c.id] = null;
        return;
      }
      const { pool, real } = preferReal(rs);
      const value =
        spec.window === "24h"
          ? median(pool.map((r) => r.value))
          : // Daily: the day's latest entry (readings arrive sorted, but do not rely on it).
            [...pool].sort((a, z) => a.takenAt.localeCompare(z.takenAt))[pool.length - 1].value;
      row.v[c.id] = round(value, def.decimals);
      if (real) (row.real ??= []).push(c.id);
    });
  }

  const band = nominalBand(spec.indicator);
  const values = rows.flatMap((r) => Object.values(r.v)).filter((v): v is number => v != null);
  const span = [...values, ...(band ? [band.from, band.to] : [])];
  const min = span.length ? Math.min(...span) : def.inputRange[0];
  const max = span.length ? Math.max(...span) : def.inputRange[1];
  const { domain: yDomain, ticks: yTicks } = niceAxis(min, max, def.decimals, def.inputRange);

  return {
    id: spec.id,
    title: spec.title,
    method: spec.method,
    window: spec.window,
    unit: def.unit,
    decimals: def.decimals,
    band,
    nominalText: def.ranges.nominal,
    yDomain,
    yTicks,
    rows,
  };
}

/** Build all trend charts from each crew member's readings (e.g. readingsFor(crew, 24 * 7)). */
export function buildCrewTrends(
  crew: TrendCrew[],
  readings: Record<string, Reading[]>,
  now: number = Date.now(),
): CrewTrendsData {
  const charts = TREND_SPECS.map((s) => buildChart(s, crew, readings, now));
  const hasData = charts.some((c) => c.rows.some((r) => Object.values(r.v).some((v) => v != null)));
  const allSimulated = charts.every((c) => c.rows.every((r) => !r.real?.length));
  return { crew, charts, hasData, allSimulated, generatedAt: new Date(now).toISOString() };
}
