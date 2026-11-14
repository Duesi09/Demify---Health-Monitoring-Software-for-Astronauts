import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { CrewMember, IndicatorId, Reading } from "../types";

/**
 * Tiny JSON-file repository for crew readings (<dataDir>/demify-db.json).
 * Deliberately dependency-free (no native SQLite build in the container).
 * This is the store whenever DATABASE_URL is unset (the default); with
 * PostgreSQL configured, readings-pg.ts uses it as the fallback and spool
 * while the database is unreachable, and drains it into the database (see
 * drainJsonStore). The facade in readings.ts picks the backend.
 */

export interface JsonDbShape {
  crew: CrewMember[];
  readings: Reading[];
}
type DbShape = JsonDbShape;

/** Hard cap on stored readings (override with DEMIFY_MAX_READINGS). */
const DEFAULT_MAX_READINGS = 50_000;
/** Readings older than this are pruned on write (override with DEMIFY_RETENTION_DAYS). */
// Longer than the longest mission profile (Mars transit, 900 days) so a
// dosimeter total or pre-flight history is never pruned mid-mission.
const DEFAULT_RETENTION_DAYS = 1100;

function positiveIntEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Retention settings shared with the PostgreSQL store (read on every call). */
export function retentionLimits(): { retentionDays: number; maxReadings: number } {
  return {
    retentionDays: positiveIntEnv("DEMIFY_RETENTION_DAYS", DEFAULT_RETENTION_DAYS),
    maxReadings: positiveIntEnv("DEMIFY_MAX_READINGS", DEFAULT_MAX_READINGS),
  };
}

export const DEFAULT_CREW: CrewMember[] = [
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

interface FileState {
  // One shared load promise: concurrent first callers must all get the same
  // DbShape object, otherwise a slower read could replace a newer in-memory DB.
  loading: Promise<DbShape> | null;
  // Serialise writes so concurrent requests can't clobber each other.
  writeChain: Promise<void>;
}

const shared = globalThis as typeof globalThis & { __demifyJsonStore?: Map<string, FileState> };

/**
 * In-memory copy and write queue of one database file, kept on globalThis:
 * Next.js bundles server modules once for route handlers and once for pages,
 * and both copies must share one cache and one queue, or a write through one
 * copy could persist its stale data over a write made through the other.
 */
function fileState(file = dbFile()): FileState {
  const all = (shared.__demifyJsonStore ??= new Map());
  let state = all.get(file);
  if (!state) {
    state = { loading: null, writeChain: Promise.resolve() };
    all.set(file, state);
  }
  return state;
}

function isDbShape(v: unknown): v is DbShape {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as DbShape).crew) &&
    Array.isArray((v as DbShape).readings)
  );
}

async function readAndParse(): Promise<DbShape> {
  const file = dbFile();
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    // Only a missing file means "fresh install". Anything else (EACCES, EIO…)
    // must not be papered over with an empty DB that the next write persists.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { crew: DEFAULT_CREW, readings: [] };
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    parsed = err;
  }
  if (isDbShape(parsed)) return parsed;

  // Corrupt or truncated file: keep it for manual recovery instead of letting
  // the next persist() overwrite it, then start with an empty DB.
  const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.rename(file, aside);
  console.error(
    `[demify] ERROR: ${file} is not a valid Demify database ` +
      `(${parsed instanceof Error ? parsed.message : "unexpected shape"}). ` +
      `It was moved to ${aside} and an EMPTY database was started. ` +
      `Restore crew history from that file manually.`,
  );
  return { crew: DEFAULT_CREW, readings: [] };
}

function load(): Promise<DbShape> {
  const state = fileState();
  if (!state.loading) {
    const loading = readAndParse();
    state.loading = loading;
    // Let a later call retry after a transient failure (e.g. EACCES).
    loading.catch(() => {
      if (state.loading === loading) state.loading = null;
    });
  }
  return state.loading;
}

async function persist(db: DbShape) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const file = dbFile();
  const tmp = file + ".tmp";
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(JSON.stringify(db));
    // Make the data durable before the rename publishes it, so a power loss
    // can't leave a renamed-but-empty database.
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, file);
  // Persist the rename itself. Directories can't be opened/fsynced on every
  // platform (e.g. Windows), so this step is best effort.
  try {
    const dir = await fs.open(config.dataDir, "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch {
    /* best effort */
  }
}

/**
 * Drops readings past the retention window, then, if the store is still over
 * the cap, the oldest sensor readings before the oldest manual check-ins.
 * Eviction is by takenAt, never by insertion order, so a burst of writes can't
 * push out recent crew history. Also used by the PostgreSQL store for its
 * last-known in-memory copy.
 */
export function evict(readings: Reading[], now = Date.now()): Reading[] {
  const { retentionDays, maxReadings: max } = retentionLimits();
  const cutoff = now - retentionDays * 86_400_000;
  let out = readings.filter((r) => !(Date.parse(r.takenAt) < cutoff));
  let excess = out.length - max;
  if (excess <= 0) return out;

  const byAge = (a: Reading, b: Reading) =>
    (Date.parse(a.takenAt) || 0) - (Date.parse(b.takenAt) || 0);
  const drop = new Set<Reading>();
  for (const source of ["sensor", "manual"] as const) {
    if (excess <= 0) break;
    const oldest = out.filter((r) => r.source === source).sort(byAge).slice(0, excess);
    for (const r of oldest) drop.add(r);
    excess -= oldest.length;
  }
  // Any other source value (legacy data) goes last.
  if (excess > 0) {
    const rest = out.filter((r) => !drop.has(r)).sort(byAge).slice(0, excess);
    for (const r of rest) drop.add(r);
  }
  out = out.filter((r) => !drop.has(r));
  return out;
}

export async function listCrew(): Promise<CrewMember[]> {
  return (await load()).crew;
}

export async function getCrew(id: string): Promise<CrewMember | undefined> {
  return (await load()).crew.find((c) => c.id === id);
}

/** Filter of listReadings (same semantics in the JSON and PostgreSQL stores). */
export interface ReadingFilter {
  crewId?: string;
  indicator?: IndicatorId;
  since?: string;
  /** The newest N matching readings, still returned oldest first. */
  limit?: number;
}

export async function listReadings(filter?: ReadingFilter): Promise<Reading[]> {
  return filterReadings((await load()).readings, filter);
}

/**
 * listReadings' filter on any list of readings (the PostgreSQL store applies
 * it to its last-known copy plus the spool during an outage). Returns a new
 * array, oldest first; `limit` = the newest N.
 */
export function filterReadings(readings: Reading[], filter?: ReadingFilter): Reading[] {
  let out = readings;
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
  await appendReadings(created);
  return created;
}

/**
 * Stores readings that already have an id. The PostgreSQL store spools into
 * this file with its own ids, so a replay (ON CONFLICT DO NOTHING) never
 * duplicates a reading that did reach the database.
 */
export async function appendReadings(readings: Reading[]): Promise<void> {
  const state = fileState();
  const run = async () => {
    const db = await load();
    db.readings.push(...readings);
    db.readings = evict(db.readings);
    await persist(db);
  };
  state.writeChain = state.writeChain.then(run, run);
  await state.writeChain;
}

/** How many demify-db.json.imported-* files are kept (the newest). */
export const KEEP_IMPORTED_FILES = 5;

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Deletes all but the newest KEEP_IMPORTED_FILES demify-db.json.imported-*
 * files. Their readings are in the database, and every row an import did not
 * take is saved in a demify-db.json.rejected-* file, which is never pruned.
 * Best effort: never throws.
 */
export async function pruneImportedFiles(keep = KEEP_IMPORTED_FILES): Promise<string[]> {
  const file = dbFile();
  const prefix = `${path.basename(file)}.imported-`;
  try {
    const names = (await fs.readdir(path.dirname(file)))
      .filter((n) => n.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(n.slice(prefix.length)))
      .sort()
      .reverse();
    const old = names.slice(Math.max(0, keep));
    const removed: string[] = [];
    for (const name of old) {
      try {
        await fs.rm(path.join(path.dirname(file), name));
        removed.push(name);
      } catch {
        /* best effort */
      }
    }
    return removed;
  } catch {
    return [];
  }
}

/**
 * Saves rows an import did not take (invalid, unknown crew member, or
 * rejected by the database) to <dataDir>/demify-db.json.rejected-<timestamp>,
 * in the same shape as the database file plus the reason per row, for manual
 * recovery. Resolves to the file path.
 */
export async function writeRejectedRows(rows: {
  crew: unknown[];
  readings: unknown[];
  reasons: { kind: "crew" | "reading"; id: string | null; reason: string }[];
}): Promise<string> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const target = `${dbFile()}.rejected-${stamp()}`;
  const tmp = `${target}.tmp`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(JSON.stringify(rows, null, 1));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, target);
  return target;
}

/**
 * Hands the JSON database file to `importer` (the PostgreSQL import), then
 * renames it to demify-db.json.imported-<timestamp> so it is imported only
 * once (keeping the newest KEEP_IMPORTED_FILES such files), and forgets the
 * in-memory copy. Runs in the write queue, so a reading
 * spooled while the import runs is either in the imported file or in a new
 * file, never lost. Resolves to null when there is no file to import (a
 * corrupt file is moved aside as on any load). If `importer` throws, the file
 * stays where it is.
 */
export async function drainJsonStore<T>(
  importer: (db: JsonDbShape) => Promise<T>,
): Promise<{ file: string; renamedTo: string; result: T } | null> {
  const file = dbFile();
  const state = fileState(file);
  const run = async () => {
    const exists = () =>
      fs.access(file).then(
        () => true,
        (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") return false;
          throw err;
        },
      );
    if (!(await exists())) {
      state.loading = null;
      return null;
    }
    // Read the file itself, not the in-memory copy: the file is what gets renamed.
    const db = await readAndParse();
    if (!(await exists())) {
      state.loading = null; // it was corrupt and has been moved aside
      return null;
    }
    const result = await importer(db);
    const renamedTo = `${file}.imported-${stamp()}`;
    await fs.rename(file, renamedTo);
    state.loading = null;
    await pruneImportedFiles();
    return { file, renamedTo, result };
  };
  const done = state.writeChain.then(run, run);
  state.writeChain = done.then(
    () => {},
    () => {},
  );
  return done;
}
