import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { CrewMember, IndicatorId, Reading } from "../types";

/**
 * Tiny JSON-file repository for crew readings. Deliberately dependency-free
 * (no native SQLite build in the container). Swap this module for a real DB
 * adapter if the target environment provides one; the interface is the
 * contract: listReadings / addReadings / listCrew.
 */

interface DbShape {
  crew: CrewMember[];
  readings: Reading[];
}

const MAX_READINGS = 50_000;

const DEFAULT_CREW: CrewMember[] = [
  {
    id: "cdr",
    name: "Commander",
    role: "Commander",
    baseline: { heartRate: 62, systolicBP: 118, diastolicBP: 76, bodyTemp: 36.7, glucose: 92, spo2: 98 },
  },
  {
    id: "plt",
    name: "Pilot",
    role: "Pilot",
    baseline: { heartRate: 58, systolicBP: 122, diastolicBP: 78, bodyTemp: 36.6, glucose: 88, spo2: 98 },
  },
  {
    id: "ms1",
    name: "Mission Specialist 1",
    role: "Mission Specialist",
    baseline: { heartRate: 66, systolicBP: 112, diastolicBP: 72, bodyTemp: 36.8, glucose: 95, spo2: 99 },
  },
  {
    id: "ms2",
    name: "Mission Specialist 2",
    role: "Flight Engineer",
    baseline: { heartRate: 60, systolicBP: 116, diastolicBP: 74, bodyTemp: 36.7, glucose: 90, spo2: 98 },
  },
];

const dbFile = () => path.join(config.dataDir, "demify-db.json");

let cache: DbShape | null = null;
// Serialise writes so concurrent requests can't clobber each other.
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<DbShape> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(dbFile(), "utf8")) as DbShape;
  } catch {
    cache = { crew: DEFAULT_CREW, readings: [] };
  }
  return cache;
}

async function persist(db: DbShape) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = dbFile() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, dbFile());
}

export async function listCrew(): Promise<CrewMember[]> {
  return (await load()).crew;
}

export async function getCrew(id: string): Promise<CrewMember | undefined> {
  return (await load()).crew.find((c) => c.id === id);
}

export async function listReadings(filter?: {
  crewId?: string;
  indicator?: IndicatorId;
  since?: string;
  limit?: number;
}): Promise<Reading[]> {
  const db = await load();
  let out = db.readings;
  if (filter?.crewId) out = out.filter((r) => r.crewId === filter.crewId);
  if (filter?.indicator) out = out.filter((r) => r.indicator === filter.indicator);
  if (filter?.since) out = out.filter((r) => r.takenAt >= filter.since!);
  out = [...out].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (filter?.limit) out = out.slice(-filter.limit);
  return out;
}

export async function addReadings(
  input: Omit<Reading, "id">[],
): Promise<Reading[]> {
  const created = input.map((r) => ({ ...r, id: randomUUID() }));
  const run = async () => {
    const db = await load();
    db.readings.push(...created);
    if (db.readings.length > MAX_READINGS) {
      db.readings.splice(0, db.readings.length - MAX_READINGS);
    }
    await persist(db);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
  return created;
}
