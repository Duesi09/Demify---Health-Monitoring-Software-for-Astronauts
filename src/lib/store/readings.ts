import "server-only";
import * as json from "./readings-json";
import type { ReadingFilter } from "./readings-json";
import type { CrewMember, Reading } from "../types";

/**
 * Crew readings repository: the one module pages and routes import.
 *
 * - DATABASE_URL unset (default, also the pitch laptop): the JSON file
 *   <dataDir>/demify-db.json, exactly as before (readings-json.ts).
 * - DATABASE_URL set (onboard server): PostgreSQL (readings-pg.ts), which
 *   falls back to the JSON file, and spools writes into it, while the
 *   database is unreachable.
 *
 * Both backends keep the same contract: listCrew / getCrew / listReadings /
 * addReadings, readings returned oldest first, `limit` = the newest N.
 */

export type { ReadingFilter };

/** Read on every call (like DEMIFY_ADMIN_TOKEN) so tests can stub it; empty counts as unset. */
function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// Loaded only when a database is configured, so the default setup never
// loads the PostgreSQL driver.
let pgStore: Promise<typeof import("./readings-pg")> | null = null;
function pg() {
  pgStore ??= import("./readings-pg");
  return pgStore;
}

export async function listCrew(): Promise<CrewMember[]> {
  return databaseConfigured() ? (await pg()).listCrew() : json.listCrew();
}

export async function getCrew(id: string): Promise<CrewMember | undefined> {
  return databaseConfigured() ? (await pg()).getCrew(id) : json.getCrew(id);
}

export async function listReadings(filter?: ReadingFilter): Promise<Reading[]> {
  return databaseConfigured() ? (await pg()).listReadings(filter) : json.listReadings(filter);
}

export async function addReadings(input: Omit<Reading, "id">[]): Promise<Reading[]> {
  return databaseConfigured() ? (await pg()).addReadings(input) : json.addReadings(input);
}
