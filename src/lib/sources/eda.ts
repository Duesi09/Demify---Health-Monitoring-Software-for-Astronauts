import "server-only";
import { config } from "../config";
import type { SourceResult } from "../types";
import { cached, fetchJson } from "./cache";

/**
 * NASA OSDR Environmental Data Application (EDA): measured radiation inside
 * the ISS during rodent-research and plant missions (area dosimetry from
 * the station's radiation instruments, not personal crew dosimeters).
 * Daily absorbed dose in mGy/day, split into galactic cosmic rays (GCR) and
 * trapped protons from the South Atlantic Anomaly (SAA).
 *
 *   GET {biodata}/eda/api/missions/                      -> [{name,title,description,link}]
 *   GET {biodata}/eda/api/missions/{name}/radiation_data/ -> [{time,gcr,saa,total,milestones}]
 *
 * These are historical, static data sets (2014-2021), so they are cached for
 * a week and bundled as one offline snapshot.
 */

const WEEK = 7 * 24 * 3600;
const SRC = "NASA OSDR Environmental Data App (ISS dosimetry)";

/** Missions with published dose series, spread over the solar cycle (2014-2020). */
export const REFERENCE_MISSIONS = ["RR-1", "RR-9", "RR-6", "RR-8", "RR-12", "RR-17", "RR-19", "RR-23"] as const;

export interface DosePoint {
  /** ISO date (UTC day) */
  t: string;
  /** mGy/day */
  gcr: number | null;
  saa: number | null;
  total: number | null;
  milestone: string | null;
}

export interface MissionDose {
  name: string;
  title: string;
  link: string | null;
  start: string;
  end: string;
  days: number;
  /** Mean absorbed dose rate, mGy/day */
  meanTotal: number;
  meanGcr: number;
  meanSaa: number;
  points: DosePoint[];
}

export interface IssDoseReference {
  unit: "mGy/day";
  /** Mean of the per-mission means, mGy/day (absorbed dose, not dose equivalent). */
  meanTotal: number;
  meanGcr: number;
  meanSaa: number;
  /** Lowest and highest per-mission mean. */
  min: number;
  max: number;
  /** Per-mission summaries with their daily series, oldest first. */
  missions: MissionDose[];
  /** Most recent mission, convenient for a single sparkline. */
  latest: MissionDose;
}

interface RawMission {
  name: string;
  title: string;
  link?: string;
}
interface RawDose {
  time: string;
  gcr: number | null;
  saa: number | null;
  total: number | null;
  milestones: string | null;
}

const base = () => `${config.osdrBiodataUrl}/eda/api/missions`;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function summarise(meta: RawMission | undefined, name: string, raw: RawDose[]): MissionDose | null {
  const points: DosePoint[] = raw
    .filter((p) => typeof p.time === "string")
    .map((p) => ({
      t: p.time.slice(0, 10),
      gcr: n(p.gcr),
      saa: n(p.saa),
      total: n(p.total),
      milestone: p.milestones ? p.milestones.replace(/_/g, " ") : null,
    }))
    .sort((a, b) => a.t.localeCompare(b.t));
  const totals = points.map((p) => p.total).filter((v): v is number => v != null);
  if (!totals.length) return null;
  return {
    name,
    title: meta?.title ?? name,
    link: meta?.link ?? null,
    start: points[0].t,
    end: points[points.length - 1].t,
    days: points.length,
    meanTotal: r4(mean(totals)),
    meanGcr: r4(mean(points.map((p) => p.gcr).filter((v): v is number => v != null))),
    meanSaa: r4(mean(points.map((p) => p.saa).filter((v): v is number => v != null))),
    points,
  };
}

async function loadReference(): Promise<IssDoseReference> {
  // All-or-nothing: these are static historical series and a complete copy
  // always exists (seed snapshot), so a partial or degraded refresh (missing
  // missions, or titles/links lost because the mission list failed) must not
  // replace it. Throwing makes cached() keep serving the complete copy.
  const [list, ...settled] = await Promise.allSettled([
    fetchJson<RawMission[]>(`${base()}/`),
    ...REFERENCE_MISSIONS.map((m) => fetchJson<RawDose[]>(`${base()}/${encodeURIComponent(m)}/radiation_data/`)),
  ]);
  if (list.status !== "fulfilled" || !Array.isArray(list.value)) {
    const reason = list.status === "rejected" ? `: ${list.reason instanceof Error ? list.reason.message : String(list.reason)}` : "";
    throw new Error(`EDA mission list unavailable${reason}`);
  }
  const meta = new Map((list.value as RawMission[]).map((m) => [m.name, m]));
  const missions: MissionDose[] = [];
  const missing: string[] = [];
  settled.forEach((r, i) => {
    const name = REFERENCE_MISSIONS[i];
    const m =
      r.status === "fulfilled" && Array.isArray(r.value)
        ? summarise(meta.get(name), name, r.value as RawDose[])
        : null;
    if (m) missions.push(m);
    else missing.push(name);
  });
  if (missing.length) {
    throw new Error(
      `EDA returned dose data for only ${missions.length} of ${REFERENCE_MISSIONS.length} missions (missing ${missing.join(", ")})`,
    );
  }
  missions.sort((a, b) => a.start.localeCompare(b.start));
  const means = missions.map((m) => m.meanTotal);
  return {
    unit: "mGy/day",
    meanTotal: r4(mean(means)),
    meanGcr: r4(mean(missions.map((m) => m.meanGcr))),
    meanSaa: r4(mean(missions.map((m) => m.meanSaa))),
    min: Math.min(...means),
    max: Math.max(...means),
    missions,
    latest: missions[missions.length - 1],
  };
}

/**
 * Measured ISS absorbed dose rate across eight rodent-research missions
 * (2014-2020). Use `meanTotal` (≈0.32 mGy/day) as a real-data reference next
 * to model estimates; note it is absorbed dose (mGy), not dose equivalent (mSv).
 */
export function getIssDoseReference(): Promise<SourceResult<IssDoseReference>> {
  return cached("eda-iss-dose", SRC, loadReference, WEEK);
}

/** One reference mission's daily series (from the same cached data set). */
export async function getMissionDose(name: string): Promise<SourceResult<MissionDose> | null> {
  const ref = await getIssDoseReference();
  const m = ref.data.missions.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return m ? { ...ref, data: m } : null;
}
