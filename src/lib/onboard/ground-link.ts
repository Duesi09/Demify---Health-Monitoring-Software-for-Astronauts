import "server-only";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { GroundLinkState } from "./types";

/**
 * The simulated ground link switch (blackout demo). Up: live NOAA/OSDR data
 * and library syncs from the ground. Down: local library and the last
 * snapshots only.
 *
 * Stored in PostgreSQL (table ground_link, shared with the sync service)
 * when DATABASE_URL is set and the database answers, otherwise in
 * <dataDir>/ground-link.json (atomic write). With a database, the file is
 * kept as a mirror of the last known position: it is what the app uses while
 * the database is unreachable, and a switch made during such an outage is
 * written to the database once it is back (the newer change wins).
 * Nothing stored = up. DEMIFY_OFFLINE=true forces the link down whatever the
 * switch says (hard air-gap).
 */

interface StoredLink {
  up: boolean;
  changedAt: string;
  changedBy?: string;
}

const DEFAULT_LINK: StoredLink = { up: true, changedAt: new Date(0).toISOString() };
/** How long isGroundLinkUp() reuses its answer. */
const CACHE_MS = 2_000;
/** After a database failure, use the file this long before trying the database again. */
const RETRY_AFTER_MS = 15_000;
const LOG_EVERY_MS = 60_000;

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const databaseUrl = () => env("DATABASE_URL");
const linkFile = () => path.join(env("DEMIFY_DATA_DIR") ?? path.join(process.cwd(), "data"), "ground-link.json");

/** DEMIFY_OFFLINE=true: hard air-gap, the switch can never bring the link up. */
export function isForcedOffline(): boolean {
  return env("DEMIFY_OFFLINE")?.toLowerCase() === "true";
}

interface Shared {
  /** Last effective answer of groundLinkUpNow, per backend (DATABASE_URL + file). */
  cache: { key: string; up: boolean; at: number } | null;
  inflight: { key: string; promise: Promise<boolean> } | null;
  /** Bumped by setGroundLink so a read that started earlier cannot overwrite the new answer. */
  version: number;
  /** Database left alone until `until` after a failure. */
  dbDown: { url: string; until: number } | null;
  lastLog: Map<string, number>;
}

const holder = globalThis as typeof globalThis & { __demifyGroundLink?: Shared };

/**
 * Kept on globalThis: Next.js bundles this module once for route handlers and
 * once for pages, and a switch moved through the API must reach the pages'
 * copy at once, not when its cache expires.
 */
function shared(): Shared {
  holder.__demifyGroundLink ??= { cache: null, inflight: null, version: 0, dbDown: null, lastLog: new Map() };
  return holder.__demifyGroundLink;
}

/** console.warn at most once a minute per kind of message (the kind includes the file or URL). */
function logLimited(kind: string, message: string): void {
  const { lastLog } = shared();
  const now = Date.now();
  const last = lastLog.get(kind);
  if (last !== undefined && now - last < LOG_EVERY_MS && now >= last) return;
  lastLog.set(kind, now);
  console.warn(`[demify] ${message}`);
}

const describe = (err: unknown) => (err instanceof Error ? err.message || err.name : String(err));

/* ------------------------------------------------------------------------- */
/* File backend                                                               */
/* ------------------------------------------------------------------------- */

function isStoredLink(v: unknown): v is StoredLink {
  const x = v as StoredLink | null;
  return (
    typeof x === "object" &&
    x !== null &&
    typeof x.up === "boolean" &&
    typeof x.changedAt === "string" &&
    (x.changedBy === undefined || typeof x.changedBy === "string")
  );
}

/**
 * Synchronous on purpose: the file is tiny and read at most every CACHE_MS,
 * and a synchronous answer lets the source cache decide without an extra
 * await (see groundLinkUpNow). Never throws; null = nothing usable stored.
 */
function readLinkFile(): StoredLink | null {
  const file = linkFile();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logLimited(`file-read:${file}`, `Could not read ${file} (${describe(err)}); treating the ground link as up.`);
    }
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredLink(parsed)) {
      return { up: parsed.up, changedAt: parsed.changedAt, ...(parsed.changedBy ? { changedBy: parsed.changedBy } : {}) };
    }
  } catch {
    /* reported below */
  }
  logLimited(`file-invalid:${file}`, `${file} is not a valid ground link file; treating the ground link as up.`);
  return null;
}

async function writeLinkFile(link: StoredLink): Promise<void> {
  const file = linkFile();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}-${randomUUID()}.tmp`;
  try {
    const fh = await fs.open(tmp, "w");
    try {
      await fh.writeFile(JSON.stringify(link));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  try {
    const d = await fs.open(dir, "r");
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  } catch {
    /* best effort (not every platform can fsync a directory) */
  }
}

/* ------------------------------------------------------------------------- */
/* Database backend                                                           */
/* ------------------------------------------------------------------------- */

// Loaded only when a database is configured, so the default setup never
// loads the PostgreSQL driver.
let dbModules: Promise<[typeof import("@onboard/db.mjs"), typeof import("@onboard/ground-link.mjs")]> | null = null;
function onboardDb() {
  dbModules ??= Promise.all([import("@onboard/db.mjs"), import("@onboard/ground-link.mjs")]);
  return dbModules;
}

function databaseUsable(url: string | undefined): url is string {
  if (!url) return false;
  const { dbDown } = shared();
  return !(dbDown && dbDown.url === url && Date.now() < dbDown.until);
}

function markDatabaseDown(url: string, err: unknown): void {
  shared().dbDown = { url, until: Date.now() + RETRY_AFTER_MS };
  logLimited(
    `db-down:${url}`,
    `PostgreSQL is unreachable for the ground link switch (${describe(err)}); using ${linkFile()} until it is back.`,
  );
}

async function readLinkRow(): Promise<StoredLink> {
  const [db, link] = await onboardDb();
  const pool = db.getPool();
  await db.ensureSchema(pool);
  return link.readGroundLinkRow(pool);
}

async function writeLinkRow(up: boolean, changedBy?: string): Promise<StoredLink> {
  const [db, link] = await onboardDb();
  const pool = db.getPool();
  await db.ensureSchema(pool);
  return link.writeGroundLinkRow(pool, up, changedBy);
}

const sameLink = (a: StoredLink, b: StoredLink) =>
  a.up === b.up && a.changedAt === b.changedAt && (a.changedBy ?? "") === (b.changedBy ?? "");

/** Keeps the file mirror in step with the database. Never throws. */
async function mirror(link: StoredLink): Promise<void> {
  try {
    await writeLinkFile(link);
  } catch (err) {
    logLimited(`mirror:${linkFile()}`, `Could not update ${linkFile()} (${describe(err)}); the database still holds the switch.`);
  }
}

/* ------------------------------------------------------------------------- */
/* API                                                                        */
/* ------------------------------------------------------------------------- */

function toState(link: StoredLink, backend: GroundLinkState["backend"]): GroundLinkState {
  const forcedOffline = isForcedOffline();
  return {
    up: link.up && !forcedOffline,
    switchedUp: link.up,
    forcedOffline,
    changedAt: link.changedAt,
    ...(link.changedBy ? { changedBy: link.changedBy } : {}),
    backend,
  };
}

async function loadLink(): Promise<{ link: StoredLink; backend: GroundLinkState["backend"] }> {
  const url = databaseUrl();
  if (databaseUsable(url)) {
    try {
      let link = await readLinkRow();
      const file = readLinkFile();
      if (file && Date.parse(file.changedAt) > Date.parse(link.changedAt)) {
        // Switched while the database was unreachable: that newer change wins.
        link = await writeLinkRow(file.up, file.changedBy);
      }
      if (!file || !sameLink(file, link)) await mirror(link);
      return { link, backend: "database" };
    } catch (err) {
      markDatabaseDown(url, err);
    }
  }
  return { link: readLinkFile() ?? DEFAULT_LINK, backend: "file" };
}

/** Current ground link state (GET /api/ground-link). Never throws; unknown = up. */
export async function getGroundLink(): Promise<GroundLinkState> {
  try {
    const { link, backend } = await loadLink();
    return toState(link, backend);
  } catch {
    return toState(DEFAULT_LINK, "file");
  }
}

const cacheKey = () => `${databaseUrl() ?? ""}|${linkFile()}`;

/**
 * Moves the switch (POST /api/ground-link). Throws only when the position
 * cannot be stored anywhere (no database and the file cannot be written).
 */
export async function setGroundLink(up: boolean, changedBy?: string): Promise<GroundLinkState> {
  const by = changedBy?.trim().slice(0, 64) || undefined;
  const url = databaseUrl();
  let stored: { link: StoredLink; backend: GroundLinkState["backend"] } | null = null;
  if (databaseUsable(url)) {
    try {
      const link = await writeLinkRow(up, by);
      await mirror(link);
      stored = { link, backend: "database" };
    } catch (err) {
      markDatabaseDown(url, err);
    }
  }
  if (!stored) {
    const link: StoredLink = { up, changedAt: new Date().toISOString(), ...(by ? { changedBy: by } : {}) };
    await writeLinkFile(link);
    stored = { link, backend: "file" };
  }
  const state = toState(stored.link, stored.backend);
  const sh = shared();
  sh.version++;
  sh.inflight = null;
  sh.cache = { key: cacheKey(), up: stored.link.up, at: Date.now() };
  return state;
}

/**
 * Effective ground link, answered synchronously whenever possible: false
 * right away under DEMIFY_OFFLINE, the cached answer for CACHE_MS, and a
 * synchronous file read when the file is the backend. Only a database read
 * returns a promise. Never throws or rejects; unknown = up.
 */
export function groundLinkUpNow(): boolean | Promise<boolean> {
  try {
    if (isForcedOffline()) return false;
    const sh = shared();
    const key = cacheKey();
    const now = Date.now();
    const { cache } = sh;
    if (cache && cache.key === key && now - cache.at < CACHE_MS && now >= cache.at) return cache.up;
    if (!databaseUsable(databaseUrl())) {
      const up = (readLinkFile() ?? DEFAULT_LINK).up;
      sh.cache = { key, up, at: now };
      return up;
    }
    if (!sh.inflight || sh.inflight.key !== key) {
      const started = sh.version;
      const promise: Promise<boolean> = loadLink()
        .then(
          ({ link }) => {
            if (sh.version === started) sh.cache = { key, up: link.up, at: Date.now() };
            return link.up && !isForcedOffline();
          },
          () => true,
        )
        .finally(() => {
          if (sh.inflight?.promise === promise) sh.inflight = null;
        });
      sh.inflight = { key, promise };
    }
    return sh.inflight.promise;
  } catch {
    return true;
  }
}

/** Effective ground link (switch up and not forced offline), cached ~2 s. Never rejects; unknown = up. */
export async function isGroundLinkUp(): Promise<boolean> {
  return groundLinkUpNow();
}
