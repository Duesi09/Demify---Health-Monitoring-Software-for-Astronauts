import "server-only";
import path from "node:path";
import type { Pool } from "pg";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import { ensureSchema, getPool } from "@onboard/db.mjs";
import {
  chunkDoc,
  crewBaselineDoc,
  inventoryDoc,
  librarySyncInfo,
  readLibraryDir,
  searchBundled,
  searchLibrary,
  syncLibrary,
  type LibraryDoc,
  type MedKitItem,
  type SearchResult,
  type SyncResult,
} from "@onboard/library.mjs";
import { listCrew } from "../store/readings";
import type { LibraryListing, OnboardStatus, SyncRunSummary } from "../onboard/types";
import { bundledFreshness, releaseCopyFreshness, stationFreshness, type LibraryFreshness } from "./freshness";
import { foldWord, stemSet, stemWord } from "./safety";

/**
 * The one place that decides where the onboard library comes from:
 *
 * - database: DATABASE_URL is set, PostgreSQL answers and holds at least one
 *   document (the sync service fills it from the ground library);
 * - bundled: the files shipped with this release (<cwd>/library), read
 *   directly. Used without a database (the laptop setup), and as the
 *   fallback when the database is configured but unreachable or still empty
 *   (with a fallbackReason; its freshness then reads "release copy bundled
 *   with the app (…)", never like the station's synced library).
 *
 * Listing, counts, pending embeddings, freshness, last sync and search all
 * go through here, so the library page, the status endpoint and the
 * assistant always agree on the source.
 */

export type DatabaseState = OnboardStatus["database"];

export interface ResolvedLibrary {
  source: "database" | "bundled";
  database: DatabaseState;
  /** Set whenever the database is connected (also when the bundled library is used because it is empty). */
  pool: Pool | null;
  /** Why the bundled library is used although a database is configured. */
  fallbackReason?: string;
}

export interface BundledLibrary {
  /** Documents of the release plus the generated inventory and crew-baseline documents. */
  docs: LibraryDoc[];
  inventory: MedKitItem[];
  /** Newest document date (YYYY-MM-DD), null when nothing could be read. */
  date: string | null;
  error?: string;
}

export interface LibrarySearch extends SearchResult {
  /** The source the hits came from (a database failure during the search falls back to bundled). */
  source: "database" | "bundled";
}

/** After a database failure, use the bundled library this long before trying again. */
const RETRY_AFTER_MS = 15_000;
/** How long the bundled files are reused before they are read again. */
const BUNDLED_TTL_MS = 30_000;
/** Automatic syncs (stale library, ground link up) start at most this often. */
const AUTO_SYNC_EVERY_MS = 10 * 60_000;
const PING_TIMEOUT_MS = 2000;
/** The question embedding gets this long before search falls back to full text. */
const QUERY_EMBED_TIMEOUT_MS = 3000;
const LOG_EVERY_MS = 60_000;
const SYNC_RUNS_LISTED = 20;

const CATEGORY_ORDER = ["protocol", "reference", "baseline", "inventory", "drug-reference"];

interface Shared {
  dbDown: { url: string; until: number; error: string } | null;
  bundled: { dir: string; at: number; value: Promise<BundledLibrary> } | null;
  autoSyncAt: number;
  lastLog: Map<string, number>;
}

const holder = globalThis as typeof globalThis & { __demifyLibrarySource?: Shared };

/** Kept on globalThis: Next.js bundles this module once for route handlers and once for pages. */
function shared(): Shared {
  holder.__demifyLibrarySource ??= { dbDown: null, bundled: null, autoSyncAt: 0, lastLog: new Map() };
  return holder.__demifyLibrarySource;
}

/** Test helper: forget cached state (database outage, bundled files, auto-sync throttle). */
export function resetLibrarySourceState(): void {
  delete holder.__demifyLibrarySource;
}

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
/* Database                                                                   */
/* ------------------------------------------------------------------------- */

/** Remembers a database failure so the next requests use the bundled library at once. */
export function markDatabaseDown(cfg: OnboardConfig, err: unknown): void {
  if (!cfg.databaseUrl) return;
  const error = describe(err);
  shared().dbDown = { url: cfg.databaseUrl, until: Date.now() + RETRY_AFTER_MS, error };
  logLimited(`db-down:${cfg.databaseUrl}`, `PostgreSQL is unreachable for the onboard library (${error}); using the bundled library.`);
}

/**
 * SELECT 1 within timeoutMs. Rejects with the driver's error ("connect
 * ECONNREFUSED …") or "no answer within 2 s" when the server stays silent.
 */
async function ping(pool: Pool, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const query = pool.query("SELECT 1");
  query.catch(() => {}); // a late failure after the time limit is not unhandled
  try {
    await Promise.race([
      query,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs / 1000} s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Connected pool, or why there is none. Never throws. */
export async function connectDatabase(
  cfg: OnboardConfig = onboardConfig(),
): Promise<{ state: "connected"; pool: Pool } | { state: "unreachable"; error: string } | { state: "not-configured" }> {
  if (!cfg.databaseUrl) return { state: "not-configured" };
  const down = shared().dbDown;
  if (down && down.url === cfg.databaseUrl && Date.now() < down.until) return { state: "unreachable", error: down.error };
  try {
    const pool = getPool();
    await ping(pool, PING_TIMEOUT_MS);
    await ensureSchema(pool);
    shared().dbDown = null;
    return { state: "connected", pool };
  } catch (err) {
    markDatabaseDown(cfg, err);
    return { state: "unreachable", error: describe(err) };
  }
}

/** Decides database vs bundled. Never throws. */
export async function resolveLibrary(cfg: OnboardConfig = onboardConfig()): Promise<ResolvedLibrary> {
  const db = await connectDatabase(cfg);
  if (db.state === "not-configured") return { source: "bundled", database: "not-configured", pool: null };
  if (db.state === "unreachable") {
    return {
      source: "bundled",
      database: "unreachable",
      pool: null,
      fallbackReason: `database unreachable (${db.error}); using the release copy bundled with the app`,
    };
  }
  try {
    const { rows } = await db.pool.query("SELECT count(*)::int AS n FROM library_documents");
    if (Number(rows[0]?.n ?? 0) > 0) return { source: "database", database: "connected", pool: db.pool };
    return {
      source: "bundled",
      database: "connected",
      pool: db.pool,
      fallbackReason: "the onboard database library is empty (not synced yet); using the release copy bundled with the app",
    };
  } catch (err) {
    markDatabaseDown(cfg, err);
    return {
      source: "bundled",
      database: "unreachable",
      pool: null,
      fallbackReason: `database unreachable (${describe(err)}); using the release copy bundled with the app`,
    };
  }
}

/* ------------------------------------------------------------------------- */
/* Bundled library                                                            */
/* ------------------------------------------------------------------------- */

/** The library shipped with this release (copied next to the standalone server in the Docker image). */
export function bundledLibraryDir(): string {
  return path.join(process.cwd(), "library");
}

async function loadBundled(dir: string): Promise<BundledLibrary> {
  let docs: LibraryDoc[] = [];
  let inventory: MedKitItem[] = [];
  try {
    ({ docs, inventory } = await readLibraryDir(dir));
  } catch (err) {
    logLimited(`bundled:${dir}`, `Could not read the bundled library in ${dir} (${describe(err)}).`);
    return { docs: [], inventory: [], date: null, error: describe(err) };
  }
  const date = docs.map((d) => d.updated ?? "").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1) ?? null;
  const generated: LibraryDoc[] = [];
  if (inventory.length) generated.push(inventoryDoc(inventory, date ?? ""));
  try {
    const crew = await listCrew();
    if (crew.length) {
      generated.push(
        crewBaselineDoc(
          crew.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            baseline: Object.fromEntries(
              Object.entries(c.baseline).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])),
            ),
          })),
          date ?? "",
        ),
      );
    }
  } catch (err) {
    logLimited("bundled-crew", `Could not read the crew for the bundled crew-baseline document (${describe(err)}).`);
  }
  return { docs: [...docs, ...generated], inventory, date };
}

/** The bundled library, cached for BUNDLED_TTL_MS. Never throws. */
export function bundledLibrary(): Promise<BundledLibrary> {
  const dir = bundledLibraryDir();
  const sh = shared();
  const now = Date.now();
  if (sh.bundled && sh.bundled.dir === dir && now - sh.bundled.at < BUNDLED_TTL_MS && now >= sh.bundled.at) return sh.bundled.value;
  const value = loadBundled(dir);
  sh.bundled = { dir, at: now, value };
  return value;
}

/* ------------------------------------------------------------------------- */
/* Freshness                                                                  */
/* ------------------------------------------------------------------------- */

/** Why the release copy answers although a database is configured (null without a database). */
function releaseCopyWhy(lib: Pick<ResolvedLibrary, "database">): string | null {
  if (lib.database === "not-configured") return null;
  return lib.database === "connected" ? "onboard library empty, not synced yet" : "database unreachable";
}

/** Freshness of the bundled files: the release date without a database, else "release copy bundled with the app (…)". */
async function bundledFreshnessFor(lib: Pick<ResolvedLibrary, "database">, why = releaseCopyWhy(lib)): Promise<LibraryFreshness> {
  if (why) return releaseCopyFreshness(why);
  return bundledFreshness((await bundledLibrary()).date);
}

/** Freshness of the library the source serves. Never throws. */
export async function libraryFreshness(
  source: "database" | "bundled",
  lib: ResolvedLibrary,
  cfg: OnboardConfig = onboardConfig(),
): Promise<LibraryFreshness> {
  if (source === "database" && lib.pool) {
    try {
      return stationFreshness(await librarySyncInfo(lib.pool), cfg.syncMaxAgeHours);
    } catch (err) {
      markDatabaseDown(cfg, err);
      return releaseCopyFreshness("database unreachable");
    }
  }
  // A database search that failed falls back to the release copy: the database is the reason.
  return bundledFreshnessFor(lib, source === "bundled" && lib.source === "database" ? "database unreachable" : undefined);
}

/* ------------------------------------------------------------------------- */
/* Search                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Retrieval: searchLibrary (vector, else full-text) when the database
 * library is used, else keyword search over the bundled files. A database
 * failure during the search falls back to the bundled library. minScore is
 * not applied here (see relevance.ts). Never throws.
 */
export async function searchOnboardLibrary(
  question: string,
  lib: ResolvedLibrary,
  cfg: OnboardConfig = onboardConfig(),
  opts: { skipVector?: boolean } = {},
): Promise<LibrarySearch> {
  let fallbackReason = lib.fallbackReason;
  if (lib.source === "database" && lib.pool) {
    try {
      const result = await searchLibrary(lib.pool, cfg, question, cfg.topK, {
        skipVector: !!opts.skipVector,
        embedTimeoutMs: QUERY_EMBED_TIMEOUT_MS,
      });
      return { ...result, source: "database" };
    } catch (err) {
      markDatabaseDown(cfg, err);
      fallbackReason = `database search failed (${describe(err)}); using the release copy bundled with the app`;
    }
  }
  const bundled = await bundledLibrary();
  const result = searchBundled(bundled.docs, question, cfg.topK);
  const reasons = [fallbackReason, bundled.error ? `the bundled library could not be read (${bundled.error})` : undefined, result.fallbackReason];
  const reason = reasons.filter(Boolean).join("; ");
  return { ...result, source: "bundled", ...(reason ? { fallbackReason: reason } : {}) };
}

/* ------------------------------------------------------------------------- */
/* Library vocabulary (grounding check)                                       */
/* ------------------------------------------------------------------------- */

const bundledStems = new WeakMap<BundledLibrary, Set<string>>();

/**
 * Which of these words (folded, lower case) the library contains anywhere:
 * the database library (PostgreSQL full-text, English stemming) or the
 * bundled files. A failed lookup counts as "not contained" (the answer is
 * then withheld, never shown on a guess). Never throws.
 */
export async function libraryKnownWords(
  words: string[],
  source: "database" | "bundled",
  lib: ResolvedLibrary,
  cfg: OnboardConfig = onboardConfig(),
): Promise<Set<string>> {
  const known = new Set<string>();
  if (!words.length) return known;
  if (source === "database" && lib.pool) {
    try {
      const { rows } = await lib.pool.query(
        `SELECT w FROM unnest($1::text[]) AS w
          WHERE numnode(plainto_tsquery('english', w)) > 0
            AND (EXISTS (SELECT 1 FROM library_chunks c WHERE c.tsv @@ plainto_tsquery('english', w))
                 OR EXISTS (SELECT 1 FROM library_documents d WHERE to_tsvector('english', d.title) @@ plainto_tsquery('english', w)))`,
        [words],
      );
      for (const r of rows) known.add(String(r.w));
    } catch (err) {
      markDatabaseDown(cfg, err);
    }
    return known;
  }
  const bundled = await bundledLibrary();
  let stems = bundledStems.get(bundled);
  if (!stems) {
    stems = stemSet(bundled.docs.map((d) => `${d.title}\n${d.body}`));
    bundledStems.set(bundled, stems);
  }
  for (const w of words) if (stems.has(stemWord(foldWord(w)))) known.add(w);
  return known;
}

/* ------------------------------------------------------------------------- */
/* Listing and status                                                         */
/* ------------------------------------------------------------------------- */

const iso = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

function toRun(r: Record<string, unknown>): SyncRunSummary {
  const kind = r.kind === "snapshots" ? "snapshots" : "library";
  const status = ["running", "ok", "skipped", "failed"].includes(String(r.status))
    ? (String(r.status) as SyncRunSummary["status"])
    : "failed";
  const detail = r.detail && typeof r.detail === "object" ? (r.detail as Record<string, unknown>) : undefined;
  return {
    id: Number(r.id),
    kind,
    trigger: String(r.trigger),
    status,
    startedAt: iso(r.started_at) ?? new Date(0).toISOString(),
    finishedAt: iso(r.finished_at) ?? null,
    ...(detail ? { detail } : {}),
  };
}

const byCategoryThenTitle = (a: { category: string; title: string }, b: { category: string; title: string }) =>
  (CATEGORY_ORDER.indexOf(a.category) + 1 || 99) - (CATEGORY_ORDER.indexOf(b.category) + 1 || 99) || a.title.localeCompare(b.title);

async function databaseListing(pool: Pool, cfg: OnboardConfig): Promise<LibraryListing> {
  const [docs, items, runs, syncInfo] = await Promise.all([
    pool.query(
      `SELECT d.id, d.title, d.category, d.source, d.url, d.license, d.reviewed, d.updated, d.body_sha256, d.synced_at,
              count(c.id)::int AS chunks
         FROM library_documents d LEFT JOIN library_chunks c ON c.doc_id = d.id
        GROUP BY d.id`,
    ),
    pool.query(
      `SELECT id, name, category, location, quantity, unit, to_char(expires_on, 'YYYY-MM-DD') AS expires_on, notes
         FROM med_kit_items ORDER BY lower(category), lower(name), id`,
    ),
    pool.query(
      `SELECT id, kind, trigger, status, started_at, finished_at, detail FROM sync_runs ORDER BY started_at DESC, id DESC LIMIT $1`,
      [SYNC_RUNS_LISTED],
    ),
    librarySyncInfo(pool),
  ]);
  const documents: LibraryListing["documents"] = docs.rows
    .map((r) => ({
      id: String(r.id),
      title: String(r.title),
      category: r.category,
      source: String(r.source),
      ...(r.url ? { url: String(r.url) } : {}),
      license: String(r.license),
      ...(r.reviewed ? { reviewed: String(r.reviewed) } : {}),
      ...(r.updated ? { updated: String(r.updated) } : {}),
      version: String(r.body_sha256),
      ...(iso(r.synced_at) ? { syncedAt: iso(r.synced_at) } : {}),
      chunks: Number(r.chunks),
    }))
    .sort(byCategoryThenTitle);
  const inventory: MedKitItem[] = items.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    ...(r.location ? { location: String(r.location) } : {}),
    ...(r.quantity != null ? { quantity: Number(r.quantity) } : {}),
    ...(r.unit ? { unit: String(r.unit) } : {}),
    ...(r.expires_on ? { expiresOn: String(r.expires_on) } : {}),
    ...(r.notes ? { notes: String(r.notes) } : {}),
  }));
  return {
    source: "database",
    documents,
    inventory,
    syncRuns: runs.rows.map(toRun),
    freshness: stationFreshness(syncInfo, cfg.syncMaxAgeHours),
  };
}

async function bundledListing(lib: Pick<ResolvedLibrary, "database">): Promise<LibraryListing> {
  const bundled = await bundledLibrary();
  const documents: LibraryListing["documents"] = bundled.docs
    .map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      source: d.source,
      ...(d.url ? { url: d.url } : {}),
      license: d.license,
      ...(d.reviewed ? { reviewed: d.reviewed } : {}),
      ...(d.updated ? { updated: d.updated } : {}),
      version: d.version,
      chunks: chunkDoc(d).length,
    }))
    .sort(byCategoryThenTitle);
  return { source: "bundled", documents, inventory: bundled.inventory, syncRuns: [], freshness: await bundledFreshnessFor(lib) };
}

/** GET /api/library. Never throws. */
export async function libraryListing(cfg: OnboardConfig = onboardConfig()): Promise<LibraryListing> {
  const lib = await resolveLibrary(cfg);
  if (lib.source === "database" && lib.pool) {
    try {
      return await databaseListing(lib.pool, cfg);
    } catch (err) {
      markDatabaseDown(cfg, err);
      return bundledListing({ database: "unreachable" });
    }
  }
  return bundledListing(lib);
}

/** The library part of GET /api/onboard/status. Never throws. */
export async function libraryStatus(
  cfg: OnboardConfig = onboardConfig(),
): Promise<{ database: DatabaseState; library: OnboardStatus["library"]; fallbackReason?: string }> {
  const lib = await resolveLibrary(cfg);
  if (lib.pool) {
    try {
      const [counts, last, syncInfo] = await Promise.all([
        lib.pool.query(
          `SELECT (SELECT count(*)::int FROM library_documents) AS documents,
                  (SELECT count(*)::int FROM library_chunks) AS chunks,
                  (SELECT count(*)::int FROM library_chunks WHERE embedding IS NULL OR embed_model IS DISTINCT FROM $1) AS pending`,
          [cfg.embedModel],
        ),
        lib.pool.query(
          `SELECT id, kind, trigger, status, started_at, finished_at, detail FROM sync_runs
            WHERE kind = 'library' ORDER BY started_at DESC, id DESC LIMIT 1`,
        ),
        librarySyncInfo(lib.pool),
      ]);
      const lastSync = last.rows[0] ? toRun(last.rows[0]) : null;
      if (lib.source === "database") {
        const c = counts.rows[0] ?? {};
        return {
          database: "connected",
          library: {
            source: "database",
            documents: Number(c.documents ?? 0),
            chunks: Number(c.chunks ?? 0),
            pendingEmbeddings: Number(c.pending ?? 0),
            freshness: stationFreshness(syncInfo, cfg.syncMaxAgeHours),
            lastSync,
          },
        };
      }
      // Connected but empty: the bundled library answers; show its counts and the last (failed or skipped) sync.
      return { database: "connected", library: { ...(await bundledStatus(lib)), lastSync }, fallbackReason: lib.fallbackReason };
    } catch (err) {
      markDatabaseDown(cfg, err);
      return {
        database: "unreachable",
        library: await bundledStatus({ database: "unreachable" }),
        fallbackReason: `database unreachable (${describe(err)})`,
      };
    }
  }
  return { database: lib.database, library: await bundledStatus(lib), ...(lib.fallbackReason ? { fallbackReason: lib.fallbackReason } : {}) };
}

async function bundledStatus(lib: Pick<ResolvedLibrary, "database">): Promise<OnboardStatus["library"]> {
  const bundled = await bundledLibrary();
  return {
    source: "bundled",
    documents: bundled.docs.length,
    chunks: bundled.docs.reduce((n, d) => n + chunkDoc(d).length, 0),
    pendingEmbeddings: 0,
    freshness: await bundledFreshnessFor(lib),
    lastSync: null,
  };
}

/* ------------------------------------------------------------------------- */
/* Sync                                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Starts a library sync in the background (trigger "auto") when the ground
 * link is up, the database works and the library is stale; at most once
 * every AUTO_SYNC_EVERY_MS. Returns whether one was started. Never throws.
 */
export function maybeAutoSync(
  lib: ResolvedLibrary,
  opts: { groundLinkUp: boolean; stale: boolean },
  cfg: OnboardConfig = onboardConfig(),
): boolean {
  if (!opts.groundLinkUp || !opts.stale || !lib.pool || lib.database !== "connected") return false;
  const sh = shared();
  const now = Date.now();
  if (now - sh.autoSyncAt < AUTO_SYNC_EVERY_MS && now >= sh.autoSyncAt) return false;
  sh.autoSyncAt = now;
  const pool = lib.pool;
  void ensureCrewStore().then(() => syncLibrary(pool, cfg, { trigger: "auto", groundLinkUp: true })).then(
    (r) => {
      if (r.status === "failed") logLimited("auto-sync", `Automatic library sync failed: ${r.reason ?? "unknown reason"}`);
    },
    (err) => logLimited("auto-sync", `Automatic library sync could not run (${describe(err)}).`),
  );
  return true;
}

export type ManualSync =
  | { ok: true; library: SyncResult }
  | { ok: false; status: 409 | 503; reason: string };

export const SYNC_LINK_DOWN_REASON = "Ground link is down (blackout): nothing to sync from";
export const SYNC_NO_DATABASE_REASON =
  "No database is set up on this machine: the library is read from the files bundled with this release, so there is nothing to sync.";

/**
 * Initialises the crew store before a library sync: the readings store adds
 * the default crew on its first use, and syncLibrary builds the
 * crew-baselines document from the crew table (empty on a fresh database).
 * Never throws: a sync without crew rows still syncs the rest.
 */
export async function ensureCrewStore(): Promise<void> {
  try {
    await listCrew();
  } catch (err) {
    logLimited("sync-crew", `Could not read the crew before the library sync (${describe(err)}); crew baselines may be missing.`);
  }
}

/** POST /api/sync ("Sync now"). The caller checks the ground link first. */
export async function syncNow(cfg: OnboardConfig = onboardConfig()): Promise<ManualSync> {
  const db = await connectDatabase(cfg);
  if (db.state === "not-configured") return { ok: false, status: 409, reason: SYNC_NO_DATABASE_REASON };
  if (db.state === "unreachable") return { ok: false, status: 503, reason: `The database is unreachable (${db.error}); try again when it is back.` };
  try {
    await ensureCrewStore();
    const library = await syncLibrary(db.pool, cfg, { trigger: "manual", groundLinkUp: true });
    return { ok: true, library };
  } catch (err) {
    markDatabaseDown(cfg, err);
    return { ok: false, status: 503, reason: `The database is unreachable (${describe(err)}); try again when it is back.` };
  }
}
