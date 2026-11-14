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
 * written to the database once it is back, with its original switch time
 * (the newer change wins). Nothing stored = up. DEMIFY_OFFLINE=true forces
 * the link down whatever the switch says (hard air-gap).
 *
 * Reads are cheap enough for every page render: the answer is cached for
 * CACHE_MS (process-wide), the file is read synchronously, and a database
 * read is raced against LOAD_DEADLINE_MS with the file mirror as the answer
 * when the database is slower. Nothing here throws into a page.
 */

interface StoredLink {
  up: boolean;
  changedAt: string;
  changedBy?: string;
}

type Backend = GroundLinkState["backend"];
interface Loaded {
  link: StoredLink;
  backend: Backend;
}

const DEFAULT_LINK: StoredLink = { up: true, changedAt: new Date(0).toISOString() };
/** How long getGroundLink() / isGroundLinkUp() reuse their answer. */
const CACHE_MS = 2_000;
/**
 * Longest a caller waits for the database read of the switch. Past it the
 * file mirror (the last known position) answers and the read finishes in the
 * background, so a slow or frozen database never holds up a page render.
 */
const LOAD_DEADLINE_MS = 500;
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
  /** Last answer, per backend (DATABASE_URL + file); reused for CACHE_MS. */
  cache: ({ key: string; at: number } & Loaded) | null;
  /** Database read in progress (single-flight, shared by all callers). */
  inflight: { key: string; promise: Promise<Loaded> } | null;
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

/** changedAt: keep the original switch time (write-back after an outage; only a newer change overwrites). */
async function writeLinkRow(up: boolean, changedBy?: string, changedAt?: string): Promise<StoredLink> {
  const [db, link] = await onboardDb();
  const pool = db.getPool();
  await db.ensureSchema(pool);
  return link.writeGroundLinkRow(pool, up, changedBy, changedAt);
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

function toState(link: StoredLink, backend: Backend): GroundLinkState {
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

const fromFile = (): Loaded => ({ link: readLinkFile() ?? DEFAULT_LINK, backend: "file" });

async function loadLink(): Promise<Loaded> {
  const url = databaseUrl();
  if (databaseUsable(url)) {
    try {
      let link = await readLinkRow();
      const file = readLinkFile();
      if (file && Date.parse(file.changedAt) > Date.parse(link.changedAt)) {
        // Switched while the database was unreachable: that newer change wins,
        // with its original switch time.
        link = await writeLinkRow(file.up, file.changedBy, file.changedAt);
      }
      if (!file || !sameLink(file, link)) await mirror(link);
      return { link, backend: "database" };
    } catch (err) {
      markDatabaseDown(url, err);
    }
  }
  return fromFile();
}

const cacheKey = () => `${databaseUrl() ?? ""}|${linkFile()}`;

/**
 * The switch as fast as it can be known: the cached answer (< CACHE_MS old),
 * else the file (synchronous, tiny) when the file is the backend, else the
 * database read, single-flight and raced against LOAD_DEADLINE_MS (the file
 * mirror answers when the database is slower). Only the database path
 * returns a promise, and that promise never rejects.
 */
function current(): Loaded | Promise<Loaded> {
  const sh = shared();
  const key = cacheKey();
  const now = Date.now();
  const { cache } = sh;
  if (cache && cache.key === key && now - cache.at < CACHE_MS && now >= cache.at) return cache;
  if (!databaseUsable(databaseUrl())) {
    const loaded = fromFile();
    sh.cache = { key, at: now, ...loaded };
    return loaded;
  }
  const started = sh.version;
  if (!sh.inflight || sh.inflight.key !== key) {
    const promise: Promise<Loaded> = loadLink()
      .catch(fromFile)
      .then((loaded) => {
        if (sh.version === started) sh.cache = { key, at: Date.now(), ...loaded };
        return loaded;
      })
      .finally(() => {
        if (sh.inflight?.promise === promise) sh.inflight = null;
      });
    sh.inflight = { key, promise };
  }
  const pending = sh.inflight.promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Loaded>((resolve) => {
    timer = setTimeout(() => {
      // The database is slow: answer with the last known position and keep
      // it for CACHE_MS; the read still updates the cache when it finishes.
      const loaded = fromFile();
      if (sh.version === started) sh.cache = { key, at: Date.now(), ...loaded };
      resolve(loaded);
    }, LOAD_DEADLINE_MS);
    timer.unref?.();
  });
  return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Current ground link state (GET /api/ground-link, page renders). Never
 * throws or rejects; unknown = up. Answered from the cache (< 2 s old)
 * without any I/O; otherwise from the file, or from the database within
 * LOAD_DEADLINE_MS (the file mirror answers when the database is slower).
 * `switchedUp` is the switch position, `up` also honours DEMIFY_OFFLINE.
 */
export async function getGroundLink(): Promise<GroundLinkState> {
  try {
    const { link, backend } = await current();
    return toState(link, backend);
  } catch {
    return toState(DEFAULT_LINK, "file");
  }
}

/**
 * The last known ground link state, synchronously and without waiting for
 * the database: the cached answer of any age, else the file mirror, else up.
 * Never throws. For callers that must not wait at all (health fallback).
 */
export function lastKnownGroundLink(): GroundLinkState {
  try {
    const { cache } = shared();
    if (cache && cache.key === cacheKey()) return toState(cache.link, cache.backend);
    const { link, backend } = fromFile();
    return toState(link, backend);
  } catch {
    return toState(DEFAULT_LINK, "file");
  }
}

/**
 * Moves the switch (POST /api/ground-link). Throws only when the position
 * cannot be stored anywhere (no database and the file cannot be written).
 */
export async function setGroundLink(up: boolean, changedBy?: string): Promise<GroundLinkState> {
  const by = changedBy?.trim().slice(0, 64) || undefined;
  const url = databaseUrl();
  let stored: Loaded | null = null;
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
  const sh = shared();
  sh.version++;
  sh.inflight = null;
  sh.cache = { key: cacheKey(), at: Date.now(), ...stored };
  return toState(stored.link, stored.backend);
}

/**
 * Effective ground link, answered synchronously whenever possible: false
 * right away under DEMIFY_OFFLINE, the cached answer for CACHE_MS, and a
 * synchronous file read when the file is the backend. Only a database read
 * returns a promise (settled within LOAD_DEADLINE_MS). Never throws or
 * rejects; unknown = up.
 */
export function groundLinkUpNow(): boolean | Promise<boolean> {
  try {
    if (isForcedOffline()) return false;
    const answer = current();
    if (!(answer instanceof Promise)) return answer.link.up;
    return answer.then(
      ({ link }) => link.up && !isForcedOffline(),
      () => true,
    );
  } catch {
    return true;
  }
}

/** Effective ground link (switch up and not forced offline), cached ~2 s. Never rejects; unknown = up. */
export async function isGroundLinkUp(): Promise<boolean> {
  return groundLinkUpNow();
}
