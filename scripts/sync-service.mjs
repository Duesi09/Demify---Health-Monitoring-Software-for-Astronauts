#!/usr/bin/env node
// @ts-check
/**
 * Demify sync service: the long-running scheduler of the sync container
 * (same image as the app). It keeps the onboard library and the data
 * snapshots up to date while the ground link is up.
 *
 * Every DEMIFY_SYNC_TICK_SECONDS (default 60):
 *  - touches the heartbeat file DEMIFY_SYNC_HEARTBEAT (default
 *    /tmp/demify-sync-heartbeat) for the container healthcheck;
 *  - applies the schema, retrying with backoff while PostgreSQL is down;
 *  - once, after start: an empty library is seeded from the release copy
 *    DEMIFY_SEED_LIBRARY_DIR (default ./library), even with the ground link
 *    down (trigger "startup");
 *  - reads the ground link (DEMIFY_OFFLINE=true keeps it down). While it is up:
 *      - syncs the library from DEMIFY_GROUND_LIBRARY_DIR when the last sync
 *        from the ground is older than DEMIFY_SYNC_INTERVAL_HOURS (default 6)
 *        or never happened (trigger "schedule"; a startup seed does not count);
 *      - every DEMIFY_SNAPSHOT_REFRESH_MINUTES (default 30) GETs the app's data
 *        endpoints at DEMIFY_APP_URL, so the app refreshes its snapshot
 *        copies, and records a sync_runs row (kind "snapshots");
 *  - embeds chunks still waiting for embeddings as soon as the model server
 *    answers (local work, no ground link needed).
 *
 * SIGTERM / SIGINT: finishes the current step, closes the pool, exits 0.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { onboardConfig } from "../onboard/config.mjs";
import { closePool, ensureSchema, getPool, LOCK_SYNC, withAdvisoryLock } from "../onboard/db.mjs";
import { readGroundLinkRow } from "../onboard/ground-link.mjs";
import { embedPending, syncLibrary } from "../onboard/library.mjs";

/**
 * @param {string} name
 * @param {number} fallback
 * @param {number} min
 */
function numEnv(name, fallback, min) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= min) return n;
  log(`ignoring invalid ${name}=${JSON.stringify(raw)}; using ${fallback}`);
  return fallback;
}

/** @param {string} msg */
function log(msg) {
  console.log(`[demify-sync] ${msg}`);
}

/** @param {unknown} err */
function message(err) {
  if (err instanceof Error) {
    const cause = /** @type {{ cause?: unknown }} */ (err).cause;
    return cause instanceof Error && cause.message !== err.message ? `${err.message} (${cause.message})` : err.message;
  }
  return String(err);
}

const cfg = onboardConfig();
const TICK_MS = numEnv("DEMIFY_SYNC_TICK_SECONDS", 60, 5) * 1000;
const SNAPSHOT_MS = numEnv("DEMIFY_SNAPSHOT_REFRESH_MINUTES", 30, 1) * 60_000;
const LIBRARY_MS = cfg.syncIntervalHours * 3_600_000;
/** After a failed scheduled sync, wait this long before the next attempt. */
const RETRY_AFTER_FAILURE_MS = Math.min(LIBRARY_MS, 10 * 60_000);
const HEARTBEAT = process.env.DEMIFY_SYNC_HEARTBEAT?.trim() || "/tmp/demify-sync-heartbeat";
const SEED_DIR = path.resolve(process.env.DEMIFY_SEED_LIBRARY_DIR?.trim() || path.join(process.cwd(), "library"));
const FETCH_TIMEOUT_MS = 30_000;

/**
 * The app's data endpoints (src/app/api/**) whose sources keep snapshot
 * copies: a GET makes the app fetch live data and refresh its snapshot.
 */
const SNAPSHOT_ENDPOINTS = [
  "/api/space-weather",
  "/api/osdr/eda",
  "/api/osdr/mission",
  "/api/osdr/inspiration4?summary=1",
  "/api/osdr/search",
];

/* ------------------------------------------------------------------------- */
/* Shutdown and sleeping                                                      */
/* ------------------------------------------------------------------------- */

let stopping = false;
/** @type {(() => void) | null} */
let wake = null;

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => {
    if (stopping) return resolve(undefined);
    const done = () => {
      clearTimeout(timer);
      wake = null;
      resolve(undefined);
    };
    const timer = setTimeout(done, Math.max(0, ms));
    wake = done;
  });
}

for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT"])) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: finishing the current step, then exiting`);
    wake?.();
  });
}

/* ------------------------------------------------------------------------- */
/* Steps                                                                      */
/* ------------------------------------------------------------------------- */

let heartbeatWarned = false;
async function heartbeat() {
  try {
    await fs.writeFile(HEARTBEAT, `${new Date().toISOString()}\n`);
    heartbeatWarned = false;
  } catch (err) {
    if (!heartbeatWarned) log(`cannot write the heartbeat file ${HEARTBEAT}: ${message(err)}`);
    heartbeatWarned = true;
  }
}

/**
 * Last successful library sync from the ground (startup seeds excluded).
 * @param {import("pg").Pool} pool
 */
async function lastGroundSync(pool) {
  const { rows } = await pool.query(
    "SELECT max(finished_at) AS at FROM sync_runs WHERE kind = 'library' AND status = 'ok' AND trigger <> 'startup'",
  );
  return rows[0]?.at ? new Date(rows[0].at).getTime() : null;
}

/** @param {import("pg").Pool} pool */
async function lastSnapshotRun(pool) {
  const { rows } = await pool.query("SELECT max(started_at) AS at FROM sync_runs WHERE kind = 'snapshots'");
  return rows[0]?.at ? new Date(rows[0].at).getTime() : 0;
}

/** @param {import("../onboard/library.mjs").SyncResult} r */
function syncSummary(r) {
  const parts = [
    `${r.docsAdded} added`,
    `${r.docsUpdated} updated`,
    `${r.docsRemoved} removed`,
    `${r.docsUnchanged} unchanged`,
    `${r.inventoryItems} kit items`,
    `${r.chunksEmbedded} embedded`,
    `${r.chunksPendingEmbedding} pending`,
  ];
  return `${r.status}${r.status === "ok" ? `: ${parts.join(", ")}` : ""}${r.reason ? ` (${r.reason})` : ""}`;
}

/**
 * Seeds an empty library from the release copy. Returns false when it must be retried.
 * @param {import("pg").Pool} pool
 * @param {boolean} up
 */
async function seedIfEmpty(pool, up) {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM library_documents");
  if (Number(rows[0]?.n ?? 0) > 0) return true;
  const r = await syncLibrary(pool, { ...cfg, groundLibraryDir: SEED_DIR }, { trigger: "startup", groundLinkUp: up, force: true });
  log(`library empty: seeded from the release copy ${SEED_DIR}: ${syncSummary(r)}`);
  return true;
}

/**
 * @param {unknown} body
 * @returns {{ freshness?: string; fetchedAt?: string; error?: string }}
 */
function provenanceOf(body) {
  const b = /** @type {Record<string, any> | null} */ (body && typeof body === "object" ? body : null);
  const p = b?.provenance ?? b;
  if (Array.isArray(p)) {
    const items = p.filter((x) => x && typeof x === "object");
    const freshness = [...new Set(items.map((x) => x.freshness).filter(Boolean))].join(",");
    const times = items.map((x) => x.fetchedAt).filter((t) => typeof t === "string").sort();
    const error = items.map((x) => x.error).find(Boolean);
    return { ...(freshness ? { freshness } : {}), ...(times.length ? { fetchedAt: times[0] } : {}), ...(error ? { error: String(error) } : {}) };
  }
  if (!p || typeof p !== "object") return {};
  return {
    ...(typeof p.freshness === "string" ? { freshness: p.freshness } : {}),
    ...(typeof p.fetchedAt === "string" ? { fetchedAt: p.fetchedAt } : {}),
    ...(p.error ? { error: String(p.error) } : {}),
  };
}

/**
 * GETs the app's data endpoints and records a sync_runs row (kind
 * "snapshots"). Returns false when the app could not be reached at all (no
 * row is recorded then; the next tick tries again).
 * @param {import("pg").Pool} pool
 */
async function warmSnapshots(pool) {
  const startedAt = new Date().toISOString();
  const results = await Promise.all(
    SNAPSHOT_ENDPOINTS.map(async (endpoint) => {
      const t0 = Date.now();
      try {
        const res = await fetch(`${cfg.appUrl}${endpoint}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { Accept: "application/json", "User-Agent": "demify-sync" },
        });
        /** @type {unknown} */
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        const prov = provenanceOf(body);
        // live = fetched now, cache = fetched recently by the app; snapshot = the live fetch failed.
        const refreshed = res.ok && !!prov.freshness && !/snapshot/.test(prov.freshness);
        return { endpoint, httpStatus: res.status, ok: res.ok, refreshed, ...prov, ms: Date.now() - t0 };
      } catch (err) {
        // httpStatus 0: no HTTP answer at all (connection refused, timeout).
        return { endpoint, httpStatus: 0, ok: false, refreshed: false, error: message(err), ms: Date.now() - t0 };
      }
    }),
  );
  if (results.every((r) => r.httpStatus === 0)) {
    log(`snapshots: app not reachable at ${cfg.appUrl} (${results[0]?.error ?? "no answer"}); retrying next tick`);
    return false;
  }
  const refreshed = results.filter((r) => r.refreshed).length;
  const status = refreshed > 0 ? "ok" : "failed";
  const detail = {
    refreshed,
    total: results.length,
    ...(refreshed > 0 && refreshed < results.length ? { partial: true } : {}),
    endpoints: results,
  };
  await pool.query(
    "INSERT INTO sync_runs (kind, trigger, status, started_at, finished_at, detail) VALUES ('snapshots', 'schedule', $1, $2, now(), $3)",
    [status, startedAt, JSON.stringify(detail)],
  );
  const failed = results.filter((r) => !r.refreshed).map((r) => `${r.endpoint} ${r.httpStatus || "error"}${r.freshness ? ` ${r.freshness}` : ""}`);
  log(`snapshots: ${status}, ${refreshed}/${results.length} refreshed${failed.length ? `; not refreshed: ${failed.join(", ")}` : ""}`);
  return true;
}

let lastEmbedNote = "";
/**
 * Embeds chunks still waiting for embeddings when the model server answers.
 * Logs only when something happened or the situation changed.
 * @param {import("pg").Pool} pool
 */
async function embedWaiting(pool) {
  if (!cfg.modelUrl || !cfg.vectorSearch) return;
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM library_chunks WHERE embedding IS NULL OR embed_model IS DISTINCT FROM $1",
    [cfg.embedModel],
  );
  const pending = Number(rows[0]?.n ?? 0);
  if (!pending) {
    lastEmbedNote = "";
    return;
  }
  /** @type {string | undefined} */
  let note;
  /** @type {import("../onboard/model.mjs").ModelStatus} */
  let status;
  try {
    status = await (await import("../onboard/model.mjs")).modelStatus(cfg, 2000);
  } catch (err) {
    status = { reachable: false, available: [], llmReady: false, embedReady: false, error: `model client failed: ${message(err)}` };
  }
  if (!status.reachable) {
    note = `embeddings: ${pending} chunks waiting; model server not reachable${status.error ? ` (${status.error})` : ""}`;
  } else {
    const done = await withAdvisoryLock(pool, LOCK_SYNC, async () => {
      let total = 0;
      for (let round = 0; round < Math.ceil(pending / 256) + 1 && !stopping; round++) {
        const n = await embedPending(pool, cfg, 256);
        total += n;
        if (n === 0) break;
      }
      return total;
    }).catch((err) => {
      note = `embeddings: ${pending} chunks waiting; embedding failed: ${message(err)}`;
      return 0;
    });
    if (done === null) return; // a library sync is running and embeds itself
    if (done > 0) {
      log(`embeddings: ${done} chunks embedded with ${cfg.embedModel}`);
      lastEmbedNote = "";
      return;
    }
    note ??= `embeddings: ${pending} chunks waiting; the model server embedded none`;
  }
  if (note !== lastEmbedNote) log(note);
  lastEmbedNote = note;
}

/* ------------------------------------------------------------------------- */
/* Main loop                                                                  */
/* ------------------------------------------------------------------------- */

async function main() {
  if (!cfg.databaseUrl) {
    log("DATABASE_URL is not set: the sync service needs PostgreSQL. Exiting.");
    return 2;
  }
  log(
    `started: tick ${TICK_MS / 1000} s, library sync every ${cfg.syncIntervalHours} h from ${cfg.groundLibraryDir}, ` +
      `snapshots every ${SNAPSHOT_MS / 60_000} min from ${cfg.appUrl}, seed ${SEED_DIR}, heartbeat ${HEARTBEAT}` +
      `${cfg.modelUrl ? `, embeddings ${cfg.embedModel} at ${cfg.modelUrl}` : ", no embedding model"}${cfg.offline ? ", DEMIFY_OFFLINE=true" : ""}`,
  );
  const pool = getPool();
  let schemaReady = false;
  let seeded = false;
  let backoffMs = 2000;
  let lastSnapshots = 0;
  let nextLibraryTry = 0;
  /** @type {boolean | null} */
  let lastUp = null;

  while (!stopping) {
    const tickStart = Date.now();
    await heartbeat();

    if (!schemaReady) {
      try {
        await ensureSchema(pool);
        schemaReady = true;
        backoffMs = 2000;
        lastSnapshots = await lastSnapshotRun(pool);
        log("database ready");
      } catch (err) {
        log(`database not ready (${message(err)}); retrying in ${Math.round(backoffMs / 1000)} s`);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, TICK_MS);
        continue;
      }
    }

    try {
      const row = await readGroundLinkRow(pool);
      const up = row.up && !cfg.offline;
      if (up !== lastUp) {
        log(`ground link ${up ? "up" : cfg.offline ? "down (DEMIFY_OFFLINE=true)" : "down (blackout)"}`);
        lastUp = up;
      }

      if (!seeded && !stopping) seeded = await seedIfEmpty(pool, up);

      if (up && !stopping && Date.now() >= nextLibraryTry) {
        const last = await lastGroundSync(pool);
        if (last === null || Date.now() - last >= LIBRARY_MS) {
          const r = await syncLibrary(pool, cfg, { trigger: "schedule", groundLinkUp: true });
          log(`library sync (${last === null ? "never synced from the ground" : "interval due"}): ${syncSummary(r)}`);
          if (r.status === "failed") nextLibraryTry = Date.now() + RETRY_AFTER_FAILURE_MS;
        }
      }

      if (up && !stopping && Date.now() - lastSnapshots >= SNAPSHOT_MS) {
        if (await warmSnapshots(pool)) lastSnapshots = Date.now();
      }

      if (!stopping) await embedWaiting(pool);
    } catch (err) {
      // Most often the database went away; the pool reconnects on the next query.
      log(`step failed: ${message(err)}`);
    }

    await sleep(TICK_MS - (Date.now() - tickStart));
  }
  return 0;
}

let exitCode = 0;
try {
  exitCode = await main();
} catch (err) {
  log(`fatal: ${message(err)}`);
  exitCode = 1;
} finally {
  await closePool();
}
log(`stopped (exit ${exitCode})`);
process.exit(exitCode);
