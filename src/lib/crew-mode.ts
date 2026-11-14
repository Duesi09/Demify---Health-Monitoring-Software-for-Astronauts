import { config } from "./config";
import type { CrewMember } from "./types";

/**
 * Crew members that never get SIMULATED telemetry: their monitor, trends and
 * assessment show only what a sensor or gateway posts (for example the phone
 * camera pulse demo), and "--" / no signal otherwise. Keyed by id so it works
 * with both stores (the PostgreSQL crew table has no column for it).
 * A training drill still drives their monitor, as for everyone else.
 */
export const SENSOR_ONLY_CREW_IDS: ReadonlySet<string> = new Set(["test"]);

export function isSensorOnly(crew: Pick<CrewMember, "id">): boolean {
  return SENSOR_ONLY_CREW_IDS.has(crew.id);
}

/**
 * Sensor values count as current for this long on a sensor-only monitor.
 * The phone pulse demo posts about once per second while it sees a pulse, so
 * a few seconds of silence mean "no pulse detected" and the monitor goes back
 * to no signal quickly instead of holding the last value for two minutes.
 */
export const SENSOR_ONLY_FRESH_MS = 8_000;

/** True when the demo telemetry generator should fill in values for this crew member. */
export function simulatesTelemetry(crew: Pick<CrewMember, "id">): boolean {
  return config.simulateTelemetry && !isSensorOnly(crew);
}
