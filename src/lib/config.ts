import "server-only";
import path from "node:path";
import type { MissionProfile, MissionProfileId } from "./types";

/**
 * Mission profiles. Dose rates are representative quiet-sun GCR values
 * (see src/lib/health/knowledge.ts for sources). commDelaySeconds is the
 * one-way signal delay the app uses for timing; delayBasis says where each
 * number comes from, because they are not all straight-line light time.
 */
export const MISSION_PROFILES: Record<MissionProfileId, MissionProfile> = {
  iss: {
    id: "iss",
    name: "ISS (Low Earth Orbit)",
    baselineDoseRate: 0.5,
    // Light time from 400 km is only about 1.3 ms; the ISS talks to the
    // ground through TDRS relays in geostationary orbit (~36,000 km up and
    // back down) plus ground-network latency, which is what 0.5 s stands for.
    commDelaySeconds: 0.5,
    delayBasis: "relay through TDRS geostationary satellites plus network latency (illustrative)",
    gravity: 0,
    durationDays: 180,
  },
  "artemis-lunar": {
    id: "artemis-lunar",
    name: "Artemis (Lunar)",
    // Chang'e-4 lander, lunar surface: 1,369 µSv/day dose equivalent
    // (Zhang et al. 2020, Science Advances 6(39), eaaz1334), about 1.4 mSv/day.
    baselineDoseRate: 1.4,
    // 384,400 km / 299,792 km/s = 1.28 s
    commDelaySeconds: 1.3,
    delayBasis: "light time at about 384,400 km",
    gravity: 0.166,
    durationDays: 30,
  },
  "mars-transit": {
    id: "mars-transit",
    name: "Mars Transit",
    baselineDoseRate: 1.8,
    // Earth-Mars light time ranges from about 3 to 22 minutes one way; 12.5
    // minutes stands for a mid-transit distance.
    commDelaySeconds: 750,
    delayBasis: "fixed 750 s, mid-range Mars transit (illustrative)",
    gravity: 0,
    durationDays: 900,
  },
};

/**
 * Reads an environment variable, treating unset, empty and whitespace-only
 * values the same. Docker Compose passes `${VAR:-}` through as "", which must
 * mean "use the default", not "use an empty value".
 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function warn(name: string, value: string, fallback: unknown): void {
  console.warn(`[demify] Ignoring invalid ${name}=${JSON.stringify(value)}; using ${String(fallback)}.`);
}

/** Finite number >= min, else the fallback (with a warning for bad values). */
function numberEnv(name: string, fallback: number, min: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= min) return n;
  warn(name, raw, fallback);
  return fallback;
}

function missionEnv(): MissionProfileId {
  const raw = env("DEMIFY_MISSION");
  if (raw === undefined) return "iss";
  if (Object.hasOwn(MISSION_PROFILES, raw)) return raw as MissionProfileId;
  warn("DEMIFY_MISSION", raw, `iss (valid: ${Object.keys(MISSION_PROFILES).join(", ")})`);
  return "iss";
}

/** ISO date (YYYY-MM-DD, optionally with a time). Defaults to 92 days ago so the demo has history. */
function missionStartEnv(): string {
  const fallback = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
  const raw = env("DEMIFY_MISSION_START");
  if (raw === undefined) return fallback;
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
  // Round-trip the calendar date: V8 silently rolls 2026-02-30 over to March 2.
  const valid =
    date !== null &&
    Number.isFinite(Date.parse(raw)) &&
    new Date(Date.UTC(+date[1], +date[2] - 1, +date[3])).toISOString().startsWith(date.slice(1).join("-"));
  if (valid) return raw;
  warn("DEMIFY_MISSION_START", raw, `${fallback} (expected an ISO date such as 2026-09-01)`);
  return fallback;
}

/**
 * Runtime configuration. Everything is read from environment variables so a
 * single Docker image can be adapted to the target environment (ground lab,
 * ISS-like station network, air-gapped spacecraft computer).
 */
export const config = {
  /** Directory for persistent data (crew readings). Mount a volume here. */
  dataDir: env("DEMIFY_DATA_DIR") ?? path.join(process.cwd(), "data"),
  /**
   * Writable directory where refreshed snapshots of external sources are
   * stored after each successful live fetch (Docker: /data/snapshots).
   */
  snapshotDir:
    env("DEMIFY_SNAPSHOT_DIR") ?? path.join(process.cwd(), "data", "runtime", "snapshots"),
  /**
   * Read-only snapshots bundled with the release (committed in
   * data/snapshots). Used when neither live data nor a refreshed snapshot
   * exists, e.g. on first start of an air-gapped system.
   */
  snapshotSeedDir:
    env("DEMIFY_SNAPSHOT_SEED_DIR") ?? path.join(process.cwd(), "data", "snapshots"),
  /** When true, never call external APIs; serve bundled snapshots only. */
  offline: env("DEMIFY_OFFLINE")?.toLowerCase() === "true",
  /** Seconds to keep live responses in memory. */
  cacheTtlSeconds: numberEnv("DEMIFY_CACHE_TTL", 300, 0),
  /** Timeout for outbound requests in ms. */
  fetchTimeoutMs: numberEnv("DEMIFY_FETCH_TIMEOUT_MS", 8000, 1),
  /** Enables the demo telemetry generator for heart rate, BP etc. */
  simulateTelemetry: env("DEMIFY_SIMULATE")?.toLowerCase() !== "false",
  mission: missionEnv(),
  /** Mission start (ISO date). Defaults to 92 days ago so the demo has history. */
  missionStart: missionStartEnv(),
  nasaApiKey: env("NASA_API_KEY") ?? "DEMO_KEY",
  osdrBaseUrl: env("OSDR_BASE_URL") ?? "https://osdr.nasa.gov",
  osdrBiodataUrl: env("OSDR_BIODATA_URL") ?? "https://visualization.osdr.nasa.gov",
  swpcBaseUrl: env("SWPC_BASE_URL") ?? "https://services.swpc.noaa.gov",
} as const;

/** Whole days elapsed since mission start (min 0). */
export function missionDay(now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(config.missionStart)) / 86_400_000));
}

export function currentMission(): MissionProfile {
  return MISSION_PROFILES[config.mission] ?? MISSION_PROFILES.iss;
}
