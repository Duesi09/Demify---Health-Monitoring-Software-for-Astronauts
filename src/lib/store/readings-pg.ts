import "server-only";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { ensureSchema, getPool } from "@onboard/db.mjs";
import * as json from "./readings-json";
import type { JsonDbShape, ReadingFilter } from "./readings-json";
import { cleanDeep, cleanText } from "./text";
import type { CrewMember, IndicatorId, Reading, ReadingSource } from "../types";

/**
 * PostgreSQL crew readings store, used by readings.ts when DATABASE_URL is
 * set. Same contract and filter semantics as the JSON store.
 *
 * Start-up (first database operation of the process): apply migrations, then
 * import <dataDir>/demify-db.json once (crew + readings, ON CONFLICT DO
 * NOTHING; the file is then renamed to demify-db.json.imported-<timestamp>),
 * then seed the default crew if the crew table is still empty.
 *
 * Resilience: while the database is unreachable, writes are spooled into
 * the JSON store (same reading ids) and reads return the last-known copy of
 * the readings plus the spooled ones, so pages keep the crew history. The
 * last-known copy is process-wide (globalThis): loaded at start-up (the
 * retention window) and kept current by every successful read and write.
 * The next successful database operation replays the spool through the same
 * import path and renames the file, so nothing is lost or duplicated. After a
 * connection failure the database is left alone for RETRY_AFTER_MS, so pages
 * do not wait for a connection timeout on every request. Database errors
 * never reach pages; each kind of log line is printed at most once a minute.
 *
 * Text hygiene: PostgreSQL text and jsonb cannot hold NUL characters, and
 * jsonb rejects unpaired UTF-16 surrogates. Every string is cleaned before
 * an insert or import (NUL removed, unpaired surrogates replaced by U+FFFD),
 * so such a reading is stored instead of blocking the database. An import
 * inserts in savepoint-protected batches; a batch that still fails with a
 * data or integrity error (SQLSTATE class 22/23) is split down to single
 * rows, the rows the database rejects are written to
 * demify-db.json.rejected-<timestamp> with the reason, and the rest is
 * imported, so one bad row never blocks the replay.
 *
 * Retention (DEMIFY_RETENTION_DAYS / DEMIFY_MAX_READINGS, same defaults and
 * eviction order as the JSON store: past the window first, then the oldest
 * sensor readings, then the oldest manual check-ins) runs on insert, at most
 * every RETENTION_EVERY_MS.
 */

const RETENTION_EVERY_MS = 10 * 60_000;
/** After a connection failure, use the JSON store this long before trying the database again. */
const RETRY_AFTER_MS = 15_000;
const LOG_EVERY_MS = 60_000;
/** getCrew runs once per posted reading; the crew list changes only on import/seed. */
const CREW_CACHE_MS = 5_000;
const IMPORT_BATCH = 2_000;
/** Advisory lock for the retention pass (onboard/db.mjs uses 7_311_001/002). */
const LOCK_RETENTION = 7_311_003;

interface State {
  ready: Promise<void> | null;
  /** Skip the database until this time (after a connection failure). */
  downUntil: number;
  degraded: boolean;
  /** The JSON file may hold readings not yet in the database. */
  spoolPending: boolean;
  draining: Promise<void> | null;
  lastRetention: number;
  retention: Promise<void> | null;
  crew: { at: number; list: CrewMember[] } | null;
  /** Last crew list the database returned (no expiry): used during an outage. */
  lastCrew: CrewMember[] | null;
  /** Last-known copy of the stored readings by id (retention window): used during an outage. */
  lastKnown: Map<string, Reading>;
  /** Last retention-window trim of lastKnown. */
  lastKnownTrim: number;
  /** Last console.warn per kind of message. */
  lastLog: Map<string, number>;
}

const shared = globalThis as typeof globalThis & {
  __demifyReadingsPg?: { url: string; pool: Pool | null; state: State };
};

/**
 * Process-wide state, kept on globalThis because Next.js bundles this module
 * once for route handlers and once for pages, and both copies must share one
 * start-up, one spool flag, one retry window and one log limiter. It lives as
 * long as the shared pool: closePool() or a new DATABASE_URL starts afresh.
 */
function current(): State {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  let pool: Pool | null = null;
  try {
    pool = getPool();
  } catch {
    /* unusable DATABASE_URL: withDb reports it and the JSON store is used */
  }
  const held = shared.__demifyReadingsPg;
  if (held && held.url === url && held.pool === pool) return held.state;
  const state: State = {
    ready: null,
    downUntil: 0,
    degraded: false,
    spoolPending: true,
    draining: null,
    lastRetention: 0,
    retention: null,
    crew: null,
    lastCrew: null,
    lastKnown: new Map(),
    lastKnownTrim: 0,
    lastLog: new Map(),
  };
  shared.__demifyReadingsPg = { url, pool, state };
  return state;
}

/* ------------------------------------------------------------------------- */
/* Logging and error handling                                                 */
/* ------------------------------------------------------------------------- */

/** console.warn at most once a minute per kind of message. */
function logLimited(s: State, kind: string, message: string): void {
  const now = Date.now();
  const last = s.lastLog.get(kind);
  if (last !== undefined && now - last < LOG_EVERY_MS && now >= last) return;
  s.lastLog.set(kind, now);
  console.warn(`[demify] ${message}`);
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return err.message || (typeof code === "string" ? code : err.name);
  }
  return String(err);
}

/**
 * SQLSTATE classes that mean "this statement or this data is wrong", not
 * "the database is gone": data exception, integrity violation, syntax or
 * access rule, feature not supported, transaction rollback, PL/pgSQL.
 * Everything else (socket errors, connection exceptions, shutdown, too many
 * connections, timeouts) counts as unreachable.
 */
function isDataError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(22|23|42|0A|40|P0)[0-9A-Z]{3}$/.test(code);
}

/** Data exception or integrity violation: this row is wrong, the database is fine. */
function isRowError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(22|23)[0-9A-Z]{3}$/.test(code);
}

class DatabaseUnavailable extends Error {}

/* ------------------------------------------------------------------------- */
/* Last-known copy (reads during an outage)                                   */
/* ------------------------------------------------------------------------- */

/** How often the last-known copy drops readings past the retention window. */
const LAST_KNOWN_TRIM_MS = 60_000;

/** Adds readings the database holds to the last-known copy, within the retention limits. */
function remember(s: State, readings: Reading[], forceTrim = false): void {
  for (const r of readings) s.lastKnown.set(r.id, r);
  const { maxReadings } = json.retentionLimits();
  const now = Date.now();
  if (forceTrim || s.lastKnown.size > maxReadings || now - s.lastKnownTrim >= LAST_KNOWN_TRIM_MS || now < s.lastKnownTrim) {
    s.lastKnownTrim = now;
    const kept = json.evict([...s.lastKnown.values()], now);
    if (kept.length !== s.lastKnown.size) s.lastKnown = new Map(kept.map((r) => [r.id, r]));
  }
}

/**
 * Runs op against the database after start-up and any pending spool replay.
 * Throws (after logging) when the database cannot be used; callers then use
 * the JSON store.
 */
async function withDb<T>(what: string, op: (pool: Pool) => Promise<T>): Promise<T> {
  const s = current();
  if (Date.now() < s.downUntil) throw new DatabaseUnavailable("waiting before the next database attempt");
  // A failure before op runs (migrations, import, spool replay) always waits
  // RETRY_AFTER_MS, so a broken start-up is not retried on every request.
  let started = false;
  try {
    const pool = getPool();
    await ready(pool, s);
    // Wait for a replay another request started, so no read misses spooled readings.
    if (s.spoolPending) await drain(pool, s);
    else if (s.draining) await s.draining;
    started = true;
    const out = await op(pool);
    if (s.degraded) {
      s.degraded = false;
      logLimited(s, "recovered", "PostgreSQL is reachable again; crew readings are stored in the database.");
    }
    return out;
  } catch (err) {
    if (started && isDataError(err)) {
      logLimited(s, "data", `PostgreSQL could not ${what} (${describe(err)}); the JSON file store was used instead.`);
    } else {
      s.downUntil = Date.now() + RETRY_AFTER_MS;
      s.degraded = true;
      const why = isDataError(err) ? "PostgreSQL start-up failed" : "PostgreSQL is unreachable";
      logLimited(
        s,
        "down",
        `${why} (${describe(err)}). Until it is back, new crew readings are spooled to the JSON file ` +
          `store and pages show the last-known history plus the spooled readings; the spool is copied ` +
          `into the database then.`,
      );
    }
    throw err;
  }
}

/* ------------------------------------------------------------------------- */
/* Start-up: schema, one-time import / spool replay, crew seed                */
/* ------------------------------------------------------------------------- */

function ready(pool: Pool, s: State): Promise<void> {
  if (!s.ready) {
    const run = init(pool, s);
    s.ready = run;
    run.catch(() => {
      if (s.ready === run) s.ready = null; // retried by the next operation
    });
  }
  return s.ready;
}

async function init(pool: Pool, s: State): Promise<void> {
  await ensureSchema(pool);
  // Import before seeding, so a JSON database with its own crew list is not
  // mixed with the default crew.
  await drain(pool, s);
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM crew");
  if ((rows[0]?.n ?? 0) === 0) {
    const added = await insertCrew(pool, json.DEFAULT_CREW);
    s.crew = null;
    console.log(`[demify] PostgreSQL crew table was empty: added the ${added} default crew members.`);
  }
  await loadLastKnown(pool, s);
}

/**
 * Fills the last-known copy with the retention window (newest first, capped
 * at DEMIFY_MAX_READINGS) and the crew list, so an outage right after
 * start-up still shows the crew history. A failure is logged, not fatal: the
 * copy then fills from later reads and writes.
 */
async function loadLastKnown(pool: Pool, s: State): Promise<void> {
  try {
    const { retentionDays, maxReadings } = json.retentionLimits();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const { rows } = await pool.query<DbReading>(
      `SELECT id::text AS id, crew_id, indicator, value, unit, taken_at, source, note FROM readings
       WHERE taken_at >= $1 ORDER BY taken_at DESC, created_at DESC, id DESC LIMIT $2`,
      [cutoff, maxReadings],
    );
    remember(s, rows.map(fromRow), true);
    s.lastCrew = await selectCrew(pool);
  } catch (err) {
    logLimited(s, "last-known", `Could not load the crew history for outages (${describe(err)}); it fills from later reads.`);
  }
}

/** Imports demify-db.json (first start or spooled readings) and renames it. Single-flight. */
function drain(pool: Pool, s: State): Promise<void> {
  if (!s.draining) {
    // Cleared before the file is read: a reading spooled after this point
    // sets the flag again once it is on disk.
    s.spoolPending = false;
    const run: Promise<void> = json
      .drainJsonStore((db) => importJsonDb(pool, s, db))
      .then(
        (done) => {
          if (!done) return;
          s.crew = null;
          const r = done.result;
          console.log(
            `[demify] Imported ${done.file} into PostgreSQL: ${r.inserted} readings added, ` +
              `${r.alreadyPresent} already there, ${r.skipped} skipped (invalid or unknown crew member), ` +
              `${r.rejected} rejected by the database, ` +
              `${r.crewAdded} crew members added. The file was renamed to ${path.basename(done.renamedTo)}.` +
              (r.rejectedFile ? ` Rows not imported were saved to ${path.basename(r.rejectedFile)}.` : ""),
          );
        },
        (err: unknown) => {
          s.spoolPending = true;
          throw err;
        },
      )
      .finally(() => {
        if (s.draining === run) s.draining = null;
      });
    s.draining = run;
  }
  return s.draining;
}

interface ImportResult {
  crewAdded: number;
  inserted: number;
  alreadyPresent: number;
  /** Invalid rows and readings of an unknown crew member. */
  skipped: number;
  /** Rows the database refused (SQLSTATE class 22/23). */
  rejected: number;
  /** Where the skipped and refused rows were saved (null: none, or the file could not be written). */
  rejectedFile: string | null;
}

/** Row shape for jsonb_to_recordset inserts. */
interface ReadingRow {
  id: string;
  crew_id: string;
  indicator: string;
  value: number;
  unit: string;
  taken_at: string;
  source: string;
  note: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The readings.id column is a uuid: legacy ids map to a stable UUID (same id, same UUID). */
function toUuid(id: string): string {
  if (UUID_RE.test(id)) return id.toLowerCase();
  const h = createHash("sha256").update(`demify-reading:${id}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Years 0001..9999: what both Date#toISOString and PostgreSQL parse back. */
const MIN_TIME = -62_135_596_800_000;
const MAX_TIME = 253_402_300_799_999;

function isoTime(value: string): string | null {
  const t = Date.parse(value);
  return Number.isFinite(t) && t >= MIN_TIME && t <= MAX_TIME ? new Date(t).toISOString() : null;
}

/** A reading from the JSON file, checked field by field (legacy or hand-edited files). */
function importRow(r: unknown): ReadingRow | null {
  if (typeof r !== "object" || r === null) return null;
  const x = r as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && cleanText(v) !== "" ? cleanText(v) : null);
  const crewId = str(x.crewId);
  const indicator = str(x.indicator);
  const source = str(x.source);
  const takenAt = typeof x.takenAt === "string" ? isoTime(x.takenAt) : null;
  if (!crewId || !indicator || !source || !takenAt) return null;
  if (typeof x.value !== "number" || !Number.isFinite(x.value) || typeof x.unit !== "string") return null;
  const id = str(x.id) ?? `content:${JSON.stringify(r)}`;
  return {
    id: toUuid(id),
    crew_id: crewId,
    indicator,
    value: x.value,
    unit: cleanText(x.unit),
    taken_at: takenAt,
    source,
    note: typeof x.note === "string" ? cleanText(x.note) : null,
  };
}

function importCrew(c: unknown): CrewMember | null {
  if (typeof c !== "object" || c === null) return null;
  const x = c as Record<string, unknown>;
  const id = typeof x.id === "string" ? cleanText(x.id) : "";
  if (id === "") return null;
  const baseline =
    typeof x.baseline === "object" && x.baseline !== null && !Array.isArray(x.baseline)
      ? (cleanDeep(x.baseline) as CrewMember["baseline"])
      : {};
  return {
    id,
    name: typeof x.name === "string" ? cleanText(x.name) : id,
    role: typeof x.role === "string" ? cleanText(x.role) : "",
    baseline,
  };
}

interface Rejected {
  crew: unknown[];
  readings: unknown[];
  reasons: { kind: "crew" | "reading"; id: string | null; reason: string }[];
}

const idOf = (v: unknown): string | null => {
  const id = (v as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
};

/**
 * Runs insert(batch) under a savepoint. A batch the database rejects with a
 * data or integrity error (class 22/23) is rolled back to the savepoint and
 * split in halves, down to single rows; each single row that still fails is
 * handed to reject(). Any other error is thrown (the import is retried later).
 * Resolves to the number of rows inserted.
 */
async function insertIsolated<T>(
  client: PoolClient,
  batch: T[],
  insert: (rows: T[]) => Promise<number>,
  reject: (row: T, err: unknown) => void,
): Promise<number> {
  if (!batch.length) return 0;
  await client.query("SAVEPOINT demify_import");
  try {
    const n = await insert(batch);
    await client.query("RELEASE SAVEPOINT demify_import");
    return n;
  } catch (err) {
    if (!isRowError(err)) throw err;
    await client.query("ROLLBACK TO SAVEPOINT demify_import");
    await client.query("RELEASE SAVEPOINT demify_import");
    if (batch.length === 1) {
      reject(batch[0], err);
      return 0;
    }
    const mid = Math.ceil(batch.length / 2);
    return (
      (await insertIsolated(client, batch.slice(0, mid), insert, reject)) +
      (await insertIsolated(client, batch.slice(mid), insert, reject))
    );
  }
}

async function importJsonDb(pool: Pool, s: State, db: JsonDbShape): Promise<ImportResult> {
  const rejected: Rejected = { crew: [], readings: [], reasons: [] };
  const crew: { member: CrewMember; original: unknown }[] = [];
  for (const c of db.crew) {
    const member = importCrew(c);
    if (member) crew.push({ member, original: c });
    else {
      rejected.crew.push(c);
      rejected.reasons.push({ kind: "crew", id: idOf(c), reason: "invalid crew member" });
    }
  }
  const client = await pool.connect();
  let failed: Error | undefined;
  let result: ImportResult;
  const imported: ReadingRow[] = [];
  try {
    await client.query("BEGIN");
    const crewAdded = await insertIsolated(
      client,
      crew,
      (rows) => insertCrew(client, rows.map((r) => r.member)),
      (row, err) => {
        rejected.crew.push(row.original);
        rejected.reasons.push({ kind: "crew", id: row.member.id, reason: `rejected by the database (${describe(err)})` });
      },
    );
    const { rows } = await client.query<{ id: string }>("SELECT id FROM crew");
    const known = new Set(rows.map((r) => r.id));
    const valid: { row: ReadingRow; original: unknown }[] = [];
    let skipped = 0;
    for (const r of db.readings) {
      const row = importRow(r);
      if (row && known.has(row.crew_id)) {
        valid.push({ row, original: r });
        continue;
      }
      skipped++;
      rejected.readings.push(r);
      rejected.reasons.push({
        kind: "reading",
        id: idOf(r),
        reason: row ? `unknown crew member ${JSON.stringify(row.crew_id)}` : "invalid reading",
      });
    }
    let inserted = 0;
    let refused = 0;
    const refusedIds = new Set<string>();
    for (let i = 0; i < valid.length; i += IMPORT_BATCH) {
      inserted += await insertIsolated(
        client,
        valid.slice(i, i + IMPORT_BATCH),
        (batch) => insertRows(client, batch.map((v) => v.row)),
        (v, err) => {
          refused++;
          refusedIds.add(v.row.id);
          rejected.readings.push(v.original);
          rejected.reasons.push({ kind: "reading", id: idOf(v.original), reason: `rejected by the database (${describe(err)})` });
        },
      );
    }
    await client.query("COMMIT");
    for (const v of valid) if (!refusedIds.has(v.row.id)) imported.push(v.row);
    result = {
      crewAdded,
      inserted,
      alreadyPresent: valid.length - refused - inserted,
      skipped,
      rejected: refused,
      rejectedFile: null,
    };
  } catch (err) {
    failed = err instanceof Error ? err : new Error(String(err));
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    // A failed connection must not go back into the pool.
    client.release(failed);
  }
  remember(s, imported.map(rowToReading));
  if (rejected.crew.length || rejected.readings.length) {
    try {
      result.rejectedFile = await json.writeRejectedRows(rejected);
    } catch (err) {
      // The rows are still in the renamed file; the import is not repeated for this.
      logLimited(s, "rejected-file", `Could not save the rows PostgreSQL did not take (${describe(err)}); they remain in the imported file.`);
    }
  }
  return result;
}

/* ------------------------------------------------------------------------- */
/* SQL                                                                        */
/* ------------------------------------------------------------------------- */

type Queryable = Pool | PoolClient;

async function insertCrew(db: Queryable, crew: CrewMember[]): Promise<number> {
  const res = await db.query(
    `INSERT INTO crew (id, name, role, baseline)
     SELECT id, name, role, coalesce(baseline, '{}'::jsonb)
     FROM jsonb_to_recordset($1::jsonb) AS t(id text, name text, role text, baseline jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(crew)],
  );
  return res.rowCount ?? 0;
}

/** Inserts readings, skipping ids already stored. Resolves to the number inserted. */
async function insertRows(db: Queryable, rows: ReadingRow[]): Promise<number> {
  if (!rows.length) return 0;
  const res = await db.query(
    `INSERT INTO readings (id, crew_id, indicator, value, unit, taken_at, source, note)
     SELECT id, crew_id, indicator, value, unit, taken_at, source, note
     FROM jsonb_to_recordset($1::jsonb) AS t(
       id uuid, crew_id text, indicator text, value double precision, unit text,
       taken_at timestamptz, source text, note text)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(rows)],
  );
  return res.rowCount ?? 0;
}

function toRow(r: Reading): ReadingRow {
  return {
    id: r.id,
    crew_id: cleanText(r.crewId),
    indicator: cleanText(r.indicator),
    value: r.value,
    unit: cleanText(r.unit),
    // Normalised to UTC; an unparseable value is passed on and rejected by
    // PostgreSQL (the reading then goes to the JSON spool, not lost).
    taken_at: isoTime(r.takenAt) ?? r.takenAt,
    source: cleanText(r.source),
    note: r.note != null ? cleanText(r.note) : null,
  };
}

/** A row as the database returns it (fromRow without the round trip). */
function rowToReading(r: ReadingRow): Reading {
  return {
    id: r.id,
    crewId: r.crew_id,
    indicator: r.indicator as IndicatorId,
    value: r.value,
    unit: r.unit,
    takenAt: isoTime(r.taken_at) ?? r.taken_at,
    source: r.source as ReadingSource,
    ...(r.note != null ? { note: r.note } : {}),
  };
}

interface DbReading {
  id: string;
  crew_id: string;
  indicator: string;
  value: number;
  unit: string;
  taken_at: Date;
  source: string;
  note: string | null;
}

function fromRow(r: DbReading): Reading {
  return {
    id: r.id,
    crewId: r.crew_id,
    indicator: r.indicator as IndicatorId,
    value: Number(r.value),
    unit: r.unit,
    takenAt: new Date(r.taken_at).toISOString(),
    source: r.source as ReadingSource,
    ...(r.note != null ? { note: r.note } : {}),
  };
}

/**
 * The JSON store applies `limit` as Array#slice(-limit) on the ascending
 * list; this reproduces it: positive = newest N, negative = drop the oldest
 * N, 0/NaN/fractions below 1/+Infinity = everything, -Infinity = nothing.
 */
function limitPlan(limit: number | undefined): { newest?: number; skip?: number; none?: true } {
  if (!limit || limit === Infinity) return {};
  if (limit === -Infinity) return { none: true };
  const n = Math.trunc(Math.abs(limit));
  if (n === 0) return {};
  return limit > 0 ? { newest: n } : { skip: n };
}

async function selectReadings(pool: Pool, filter?: ReadingFilter): Promise<Reading[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter?.crewId) {
    params.push(cleanText(filter.crewId));
    where.push(`crew_id = $${params.length}`);
  }
  if (filter?.indicator) {
    params.push(cleanText(filter.indicator));
    where.push(`indicator = $${params.length}`);
  }
  if (filter?.since) {
    const since = isoTime(filter.since);
    if (!since) return [];
    params.push(since);
    where.push(`taken_at >= $${params.length}`);
  }
  const plan = limitPlan(filter?.limit);
  if (plan.none) return [];
  let sql =
    "SELECT id::text AS id, crew_id, indicator, value, unit, taken_at, source, note FROM readings" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "");
  if (plan.newest) {
    params.push(plan.newest);
    sql += ` ORDER BY taken_at DESC, created_at DESC, id DESC LIMIT $${params.length}`;
  } else {
    sql += " ORDER BY taken_at, created_at, id";
    if (plan.skip) {
      params.push(plan.skip);
      sql += ` OFFSET $${params.length}`;
    }
  }
  const { rows } = await pool.query<DbReading>(sql, params);
  const out = rows.map(fromRow);
  return plan.newest ? out.reverse() : out;
}

async function selectCrew(pool: Pool): Promise<CrewMember[]> {
  const { rows } = await pool.query<CrewMember>("SELECT id, name, role, baseline FROM crew");
  // No order column: the default crew keep their usual order, others follow by id.
  const rank = (id: string) => {
    const i = json.DEFAULT_CREW.findIndex((c) => c.id === id);
    return i === -1 ? json.DEFAULT_CREW.length : i;
  };
  return rows
    .map((r) => ({ id: r.id, name: r.name, role: r.role, baseline: r.baseline ?? {} }))
    .sort((a, b) => rank(a.id) - rank(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Retention pass, same order as the JSON store's evict(). Resolves to the number of readings removed. */
async function runRetention(pool: Pool): Promise<number> {
  const { retentionDays, maxReadings } = json.retentionLimits();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const client = await pool.connect();
  let failed: Error | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_RETENTION]);
    let removed = (await client.query("DELETE FROM readings WHERE taken_at < $1", [cutoff])).rowCount ?? 0;
    const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM readings");
    let excess = (rows[0]?.n ?? 0) - maxReadings;
    // Oldest sensor readings first, then manual check-ins, then any other (legacy) source.
    for (const source of ["sensor", "manual", null] as const) {
      if (excess <= 0) break;
      const res = await client.query(
        `DELETE FROM readings WHERE id IN (
           SELECT id FROM readings
           WHERE ${source ? "source = $2" : "source NOT IN ('sensor', 'manual')"}
           ORDER BY taken_at, created_at, id
           LIMIT $1)`,
        source ? [excess, source] : [excess],
      );
      removed += res.rowCount ?? 0;
      excess -= res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return removed;
  } catch (err) {
    failed = err instanceof Error ? err : new Error(String(err));
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release(failed);
  }
}

/** Runs retention if the last pass is RETENTION_EVERY_MS old. Never throws. */
async function maybeRunRetention(pool: Pool, s: State): Promise<void> {
  const now = Date.now();
  if (s.retention || (now - s.lastRetention < RETENTION_EVERY_MS && now >= s.lastRetention)) return;
  s.lastRetention = now;
  const run = runRetention(pool)
    .then((removed) => {
      if (removed) remember(s, [], true);
    })
    .catch((err: unknown) => {
      s.lastRetention = 0; // try again on the next insert
      logLimited(s, "retention", `PostgreSQL retention pass failed (${describe(err)}); it is retried on the next insert.`);
    })
    .finally(() => {
      if (s.retention === run) s.retention = null;
    });
  s.retention = run;
  await run;
}

/* ------------------------------------------------------------------------- */
/* Store API (same contract as readings-json.ts)                              */
/* ------------------------------------------------------------------------- */

export async function listCrew(): Promise<CrewMember[]> {
  const s = current();
  const now = Date.now();
  if (s.crew && now - s.crew.at < CREW_CACHE_MS && now >= s.crew.at) return s.crew.list;
  try {
    const list = await withDb("read the crew", selectCrew);
    s.crew = { at: Date.now(), list };
    s.lastCrew = list;
    return list;
  } catch {
    // Outage: the crew the database last returned, else the JSON store's.
    return current().lastCrew ?? json.listCrew();
  }
}

export async function getCrew(id: string): Promise<CrewMember | undefined> {
  return (await listCrew()).find((c) => c.id === id);
}

export async function listReadings(filter?: ReadingFilter): Promise<Reading[]> {
  try {
    const s = current();
    const out = await withDb("read readings", (pool) => selectReadings(pool, filter));
    remember(s, out);
    return out;
  } catch {
    // Outage: the last-known copy plus the readings spooled since (same ids
    // win from the spool), filtered exactly like the JSON store.
    const { lastKnown } = current();
    if (!lastKnown.size) return json.listReadings(filter);
    const spooled = await json.listReadings();
    const spooledIds = new Set(spooled.map((r) => r.id));
    // Narrowed by crew and indicator first: the copy can hold the whole retention window.
    const wanted = (r: Reading) =>
      (!filter?.crewId || r.crewId === filter.crewId) && (!filter?.indicator || r.indicator === filter.indicator);
    const merged = spooled.filter(wanted);
    for (const r of lastKnown.values()) if (wanted(r) && !spooledIds.has(r.id)) merged.push(r);
    return json.filterReadings(merged, filter);
  }
}

export async function addReadings(input: Omit<Reading, "id">[]): Promise<Reading[]> {
  const created: Reading[] = input.map((r) => ({ ...r, id: randomUUID() }));
  if (!created.length) return created;
  const s = current();
  let pool: Pool | null = null;
  const rows = created.map(toRow);
  try {
    pool = await withDb("store readings", async (p) => {
      await insertRows(p, rows);
      return p;
    });
  } catch {
    // Spool with the same ids: the replay skips any that did reach the database.
    await json.appendReadings(created);
    current().spoolPending = true;
    return created;
  }
  remember(s, rows.map(rowToReading));
  await maybeRunRetention(pool, s);
  return created;
}
