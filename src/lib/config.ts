import "server-only";
import path from "node:path";
import type { MissionProfile, MissionProfileId } from "./types";

/**
 * Runtime configuration. Everything is read from environment variables so a
 * single Docker image can be adapted to the target environment (ground lab,
 * ISS-like station network, air-gapped spacecraft computer).
 */
export const config = {
  /** Directory for persistent data (crew readings). Mount a volume here. */
  dataDir: process.env.DEMIFY_DATA_DIR ?? path.join(process.cwd(), "data"),
  /**
   * Writable directory where refreshed snapshots of external sources are
   * stored after each successful live fetch (Docker: /data/snapshots).
   */
  snapshotDir:
    process.env.DEMIFY_SNAPSHOT_DIR ??
    path.join(process.cwd(), "data", "runtime", "snapshots"),
  /**
   * Read-only snapshots bundled with the release (committed in
   * data/snapshots). Used when neither live data nor a refreshed snapshot
   * exists, e.g. on first start of an air-gapped system.
   */
  snapshotSeedDir:
    process.env.DEMIFY_SNAPSHOT_SEED_DIR ??
    path.join(process.cwd(), "data", "snapshots"),
  /** When true, never call external APIs; serve bundled snapshots only. */
  offline: process.env.DEMIFY_OFFLINE === "true",
  /** Seconds to keep live responses in memory. */
  cacheTtlSeconds: Number(process.env.DEMIFY_CACHE_TTL ?? 300),
  /** Timeout for outbound requests in ms. */
  fetchTimeoutMs: Number(process.env.DEMIFY_FETCH_TIMEOUT_MS ?? 8000),
  /** Enables the demo telemetry generator for heart rate, BP etc. */
  simulateTelemetry: process.env.DEMIFY_SIMULATE !== "false",
  mission: (process.env.DEMIFY_MISSION ?? "iss") as MissionProfileId,
  /** Mission start (ISO date). Defaults to 92 days ago so the demo has history. */
  missionStart:
    process.env.DEMIFY_MISSION_START ??
    new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10),
  nasaApiKey: process.env.NASA_API_KEY ?? "DEMO_KEY",
  osdrBaseUrl: process.env.OSDR_BASE_URL ?? "https://osdr.nasa.gov",
  osdrBiodataUrl:
    process.env.OSDR_BIODATA_URL ?? "https://visualization.osdr.nasa.gov",
  swpcBaseUrl: process.env.SWPC_BASE_URL ?? "https://services.swpc.noaa.gov",
} as const;

/**
 * Mission profiles. Dose rates are representative quiet-sun GCR values
 * (see src/lib/health/knowledge.ts for sources).
 */
export const MISSION_PROFILES: Record<MissionProfileId, MissionProfile> = {
  iss: {
    id: "iss",
    name: "ISS (Low Earth Orbit)",
    baselineDoseRate: 0.5,
    commDelaySeconds: 0.5,
    gravity: 0,
    durationDays: 180,
  },
  "artemis-lunar": {
    id: "artemis-lunar",
    name: "Artemis (Lunar)",
    baselineDoseRate: 1.3,
    commDelaySeconds: 1.3,
    gravity: 0.166,
    durationDays: 30,
  },
  "mars-transit": {
    id: "mars-transit",
    name: "Mars Transit",
    baselineDoseRate: 1.8,
    commDelaySeconds: 750,
    gravity: 0,
    durationDays: 900,
  },
};

/** Whole days elapsed since mission start (min 0). */
export function missionDay(now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(config.missionStart)) / 86_400_000));
}

export function currentMission(): MissionProfile {
  return MISSION_PROFILES[config.mission] ?? MISSION_PROFILES.iss;
}
