import "server-only";
import { config, currentMission } from "../config";
import type { MissionProfile, SourceResult, Status } from "../types";
import { cached, fetchJson } from "./cache";

/**
 * NOAA Space Weather Prediction Center (SWPC) live feeds.
 * Real-time GOES proton flux is the operational trigger for crew radiation
 * shelter decisions (solar particle events), so this is our live radiation
 * environment source. Docs: https://www.swpc.noaa.gov/products
 */

interface RawProton {
  time_tag: string;
  satellite: number;
  flux: number;
  energy: string;
}
interface RawXray {
  time_tag: string;
  flux: number;
  energy: string;
}
interface RawKp {
  time_tag: string;
  Kp: number;
}
type RawScales = Record<
  string,
  {
    DateStamp: string;
    TimeStamp: string;
    R: { Scale: string | null; Text: string | null; MinorProb: string | null; MajorProb: string | null };
    S: { Scale: string | null; Text: string | null; Prob: string | null };
    G: { Scale: string | null; Text: string | null };
  }
>;

export interface ProtonPoint {
  t: string;
  /** particle flux units (pfu = particles cm^-2 s^-1 sr^-1) */
  p10: number | null;
  p100: number | null;
}

export interface SpaceWeather {
  protons: ProtonPoint[];
  current: { p10: number | null; p100: number | null; t: string | null };
  /** NOAA solar radiation storm level S0..S5 derived from >=10 MeV flux */
  sLevel: number;
  xray: { t: string; flux: number }[];
  flareClass: string | null;
  kp: { t: string; kp: number }[];
  forecast: { date: string; sProb: number | null; rMinorProb: number | null; rMajorProb: number | null }[];
}

const S_THRESHOLDS = [10, 100, 1_000, 10_000, 100_000]; // pfu at >=10 MeV

export function sLevelFromFlux(p10: number | null): number {
  if (p10 == null) return 0;
  let level = 0;
  S_THRESHOLDS.forEach((t, i) => {
    if (p10 >= t) level = i + 1;
  });
  return level;
}

/** GOES 0.1–0.8 nm flux (W/m²) -> flare class like "M2.3". */
export function flareClass(flux: number | null): string | null {
  if (flux == null || flux <= 0) return null;
  const classes: [string, number][] = [
    ["X", 1e-4],
    ["M", 1e-5],
    ["C", 1e-6],
    ["B", 1e-7],
    ["A", 1e-8],
  ];
  for (const [c, base] of classes) {
    if (flux >= base) return `${c}${(flux / base).toFixed(1)}`;
  }
  return "A0.0";
}

function downsample<T extends { t: string }>(points: T[], everyMinutes: number): T[] {
  const out: T[] = [];
  let lastBucket = -1;
  for (const p of points) {
    const bucket = Math.floor(Date.parse(p.t) / (everyMinutes * 60_000));
    if (bucket !== lastBucket) {
      out.push(p);
      lastBucket = bucket;
    }
  }
  if (points.length && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

async function loadProtons(): Promise<ProtonPoint[]> {
  const raw = await fetchJson<RawProton[]>(
    `${config.swpcBaseUrl}/json/goes/primary/integral-protons-3-day.json`,
  );
  const byTime = new Map<string, ProtonPoint>();
  for (const r of raw) {
    if (r.energy !== ">=10 MeV" && r.energy !== ">=100 MeV") continue;
    const p = byTime.get(r.time_tag) ?? { t: r.time_tag, p10: null, p100: null };
    if (r.energy === ">=10 MeV") p.p10 = r.flux;
    else p.p100 = r.flux;
    byTime.set(r.time_tag, p);
  }
  const sorted = [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
  return downsample(sorted, 30);
}

async function loadXray(): Promise<{ t: string; flux: number }[]> {
  const raw = await fetchJson<RawXray[]>(
    `${config.swpcBaseUrl}/json/goes/primary/xrays-1-day.json`,
  );
  const pts = raw
    .filter((r) => r.energy === "0.1-0.8nm" && r.flux > 0)
    .map((r) => ({ t: r.time_tag, flux: r.flux }));
  return downsample(pts, 15);
}

async function loadKp(): Promise<{ t: string; kp: number }[]> {
  const raw = await fetchJson<RawKp[]>(
    `${config.swpcBaseUrl}/products/noaa-planetary-k-index.json`,
  );
  return raw.map((r) => ({ t: r.time_tag.endsWith("Z") ? r.time_tag : `${r.time_tag}Z`, kp: r.Kp }));
}

async function loadScales(): Promise<SpaceWeather["forecast"]> {
  const raw = await fetchJson<RawScales>(`${config.swpcBaseUrl}/products/noaa-scales.json`);
  const num = (s: string | null) => (s == null ? null : Number(s));
  return Object.entries(raw)
    .filter(([k]) => Number(k) >= 1)
    .map(([, v]) => ({
      date: v.DateStamp,
      sProb: num(v.S.Prob),
      rMinorProb: num(v.R.MinorProb),
      rMajorProb: num(v.R.MajorProb),
    }));
}

const SRC = "NOAA SWPC (GOES primary)";

export async function getSpaceWeather(): Promise<SourceResult<SpaceWeather>> {
  const [protons, xray, kp, forecast] = await Promise.all([
    cached("swpc-protons-3d", SRC, loadProtons),
    cached("swpc-xrays-1d", SRC, loadXray).catch(() => null),
    cached("swpc-kp", SRC, loadKp).catch(() => null),
    cached("swpc-scales", SRC, loadScales).catch(() => null),
  ]);

  const last = [...protons.data].reverse().find((p) => p.p10 != null) ?? null;
  const lastX = xray?.data.at(-1) ?? null;
  return {
    data: {
      protons: protons.data,
      current: { p10: last?.p10 ?? null, p100: last?.p100 ?? null, t: last?.t ?? null },
      sLevel: sLevelFromFlux(last?.p10 ?? null),
      xray: xray?.data ?? [],
      flareClass: flareClass(lastX?.flux ?? null),
      kp: kp?.data ?? [],
      forecast: forecast?.data ?? [],
    },
    source: SRC,
    freshness: protons.freshness,
    fetchedAt: protons.fetchedAt,
    error: protons.error,
  };
}

/**
 * Indicative crew dose-rate estimate (mSv/day) = mission GCR baseline +
 * solar-particle contribution scaled from >=10 MeV flux.
 *
 * HEURISTIC, NOT A DOSIMETER: real crews read personal/area dosimeters
 * (e.g. ISS TEPC, Orion HERA, CSA's Bio-Monitor). We scale 0.01 mSv/day per
 * pfu behind typical habitat shielding in deep space, and ~5 % of that in
 * LEO where Earth's magnetic field deflects most solar protons.
 */
export function estimateDoseRate(
  p10: number | null,
  mission: MissionProfile = currentMission(),
): { rate: number; sepContribution: number; status: Status } {
  const shieldFactor = mission.id === "iss" ? 0.05 : 1;
  const excess = Math.max(0, (p10 ?? 0) - 1); // ~1 pfu is quiet background
  const sepContribution = excess * 0.01 * shieldFactor;
  const rate = mission.baselineDoseRate + sepContribution;
  const s = sLevelFromFlux(p10);
  const status: Status = s >= 3 ? "critical" : s >= 1 ? "caution" : "nominal";
  return { rate, sepContribution, status };
}
