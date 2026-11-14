import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, ReadingSource, Status } from "@/lib/types";

/** Shared formatting helpers for the Overview and Check-in pages (server + client safe). */

/** One-way light time as a short human string: "0.5 s", "12.5 min". */
export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

/** Value with the indicator's decimals and unit, e.g. "36.7 °C". */
export function formatValue(id: IndicatorId, value: number | null | undefined, withUnit = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const def = INDICATORS[id];
  const v = value.toFixed(def.decimals);
  return withUnit ? `${v} ${def.unit}` : v;
}

/**
 * Contiguous nominal band of an indicator, derived from its classification
 * steps. Open ends are clamped to the plausible input range.
 */
export function nominalBand(id: IndicatorId): { from: number; to: number } | null {
  const def = INDICATORS[id];
  let lower = def.inputRange[0];
  for (const [upper, status] of def.steps) {
    if (status === "nominal") return { from: lower, to: upper };
    lower = upper;
  }
  return def.top === "nominal" ? { from: lower, to: def.inputRange[1] } : null;
}

/**
 * Data label per reading source, shown wherever a value appears: SIMULATED
 * (demo generator), DEVICE (posted by a sensor or gateway), REAL for crew
 * entries. External feeds use REAL / SNAPSHOT <date> via Provenance.
 */
export const SOURCE_LABEL: Record<ReadingSource, string> = {
  manual: "REAL · crew entry",
  sensor: "DEVICE",
  simulated: "SIMULATED",
  osdr: "NASA OSDR",
  "noaa-swpc": "NOAA SWPC",
};

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

/** Sort comparator: most severe first. */
export function bySeverity<T extends { status: Status }>(a: T, b: T): number {
  return RANK[b.status] - RANK[a.status];
}

/** "2026-11-14 08:50 UTC" */
export function formatUtc(iso: string): string {
  return `${iso.replace("T", " ").slice(0, 16)} UTC`;
}
