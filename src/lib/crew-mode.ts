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

/** True when the demo telemetry generator should fill in values for this crew member. */
export function simulatesTelemetry(crew: Pick<CrewMember, "id">): boolean {
  return config.simulateTelemetry && !isSensorOnly(crew);
}
