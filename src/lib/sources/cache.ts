import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";
import { groundLinkUpNow } from "../onboard/ground-link";
import type { SourceResult } from "../types";

/**
 * Fetch-with-fallback for every external data source.
 *
 * Order: in-memory cache (fresh) -> live fetch -> stale memory -> bundled
 * snapshot on disk. Spacecraft have intermittent or no internet, so every
 * source MUST ship a seed snapshot in data/snapshots/<key>.json (committed,
 * read-only) and the app must keep working on it. Successful live fetches
 * write a refreshed copy to config.snapshotDir (data/runtime/snapshots
 * locally, /data/snapshots in Docker), so the station keeps the latest data
 * it saw. Promote refreshed copies to seeds with `npm run snapshots:promote`.
 *
 * A failed live fetch is remembered per key for a short backoff window
 * (min(ttl, 60 s)); during it requests skip the live fetch and go straight to
 * stale memory or the snapshot instead of waiting out the fetch timeout again
 * on every request. Concurrent callers for the same key share one in-flight
 * load.
 *
 * While the simulated ground link switch is down (src/lib/onboard/ground-link.ts)
 * there is no live fetch and no memory hit: every request is answered from
 * the snapshot (freshness "snapshot", error GROUND_LINK_DOWN), so pages show
 * SNAPSHOT <date> for the whole blackout. The last live fetch wrote that
 * snapshot; if the write failed (read-only disk), the in-memory copy of that
 * fetch is served instead, labelled the same way with its own fetch time.
 * DEMIFY_OFFLINE=true (air-gapped deployment) is not a blackout and keeps its
 * own path: no live fetch, memory or snapshot, error "offline mode".
 *
 * The memory, failure and in-flight maps are process-wide (globalThis, per
 * snapshot directory pair): Next.js bundles this module once for route
 * handlers and once for pages, and both copies must agree on what was
 * fetched and when.
 */

interface Entry {
  value: unknown;
  fetchedAt: number;
}

interface CacheState {
  memory: Map<string, Entry>;
  /** Last failed live fetch per key, for the retry backoff. */
  failures: Map<string, { at: number; error: string }>;
  /** Loads in progress per key, shared by concurrent callers. */
  inflight: Map<string, Promise<SourceResult<unknown>>>;
}

const holder = globalThis as typeof globalThis & { __demifySourceCache?: Map<string, CacheState> };

function state(): CacheState {
  const all = (holder.__demifySourceCache ??= new Map());
  const key = `${config.snapshotDir}|${config.snapshotSeedDir}`;
  let s = all.get(key);
  if (!s) {
    s = { memory: new Map(), failures: new Map(), inflight: new Map() };
    all.set(key, s);
  }
  return s;
}

/** Longest time a failed source is left alone before the next live attempt. */
const MAX_FAILURE_BACKOFF_MS = 60_000;

/** Error reported with fallback data while the ground link switch is off. */
export const GROUND_LINK_DOWN = "ground link down (simulated blackout)";

/** The source answered, but with an HTTP error status (as opposed to a network failure or timeout). */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string, url: string) {
    super(`${status} ${statusText} for ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new HttpStatusError(res.status, res.statusText, url);
  return (await res.json()) as T;
}

function snapshotPath(key: string, dir: string = config.snapshotDir) {
  return path.join(dir, `${key}.json`);
}

/** Newest of the refreshed snapshot (writable dir) and the bundled seed. */
async function readSnapshot<T>(
  key: string,
): Promise<{ data: T; fetchedAt: string } | null> {
  const dirs = [...new Set([config.snapshotDir, config.snapshotSeedDir])];
  let best: { data: T; fetchedAt: string } | null = null;
  for (const dir of dirs) {
    try {
      const raw = await fs.readFile(snapshotPath(key, dir), "utf8");
      const parsed = JSON.parse(raw) as { fetchedAt: string; data: T };
      if (!best || parsed.fetchedAt > best.fetchedAt) best = parsed;
    } catch {
      // missing or unreadable: try the next directory
    }
  }
  return best;
}

/** fetchedAt = the time of the live fetch, so the snapshot and the memory copy carry the same date. */
async function writeSnapshot(key: string, data: unknown, fetchedAt: number) {
  try {
    await fs.mkdir(config.snapshotDir, { recursive: true });
    const tmp = snapshotPath(key) + ".tmp";
    await fs.writeFile(
      tmp,
      JSON.stringify({ fetchedAt: new Date(fetchedAt).toISOString(), data }),
    );
    await fs.rename(tmp, snapshotPath(key));
  } catch {
    // Read-only filesystem is fine; snapshot refresh is best-effort.
  }
}

/**
 * @param key      stable id, also the snapshot filename (e.g. "swpc-protons-1d")
 * @param source   human readable provenance, e.g. "NOAA SWPC GOES-18"
 * @param loader   performs the live fetch + transform; must return plain JSON
 */
export async function cached<T>(
  key: string,
  source: string,
  loader: () => Promise<T>,
  ttlSeconds: number = config.cacheTtlSeconds,
): Promise<SourceResult<T>> {
  const { memory, inflight } = state();
  if (!config.offline) {
    // Usually answered synchronously (cached or file-backed); awaited only
    // when it has to ask the database, so the common path adds no extra tick.
    const link = groundLinkUpNow();
    if (!(typeof link === "boolean" ? link : await link)) return blackout<T>(key, source);
  }

  const hit = memory.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttlSeconds * 1000) {
    return {
      data: hit.value as T,
      source,
      freshness: "cache",
      fetchedAt: new Date(hit.fetchedAt).toISOString(),
    };
  }

  let pending = inflight.get(key) as Promise<SourceResult<T>> | undefined;
  if (!pending) {
    pending = load(key, source, loader, ttlSeconds).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }
  // Each caller gets its own result object (the data itself is shared, as
  // with memory hits).
  return { ...(await pending) };
}

/**
 * Ground link switch down (simulated blackout): the snapshot, never a live
 * fetch or a memory hit. The snapshot normally holds the last live fetch;
 * when that write failed, the memory copy of the fetch is newer and is
 * served instead, labelled as a snapshot of its fetch time.
 */
async function blackout<T>(key: string, source: string): Promise<SourceResult<T>> {
  const snap = await readSnapshot<T>(key);
  const hit = state().memory.get(key);
  if (hit && (!snap || !(Date.parse(snap.fetchedAt) >= hit.fetchedAt))) {
    return {
      data: hit.value as T,
      source,
      freshness: "snapshot",
      fetchedAt: new Date(hit.fetchedAt).toISOString(),
      error: GROUND_LINK_DOWN,
    };
  }
  if (snap) {
    return { data: snap.data, source, freshness: "snapshot", fetchedAt: snap.fetchedAt, error: GROUND_LINK_DOWN };
  }
  throw new Error(`No data for ${key}: ${GROUND_LINK_DOWN}`);
}

async function load<T>(
  key: string,
  source: string,
  loader: () => Promise<T>,
  ttlSeconds: number,
): Promise<SourceResult<T>> {
  const { memory, failures } = state();
  const now = Date.now();
  let error: string | undefined;
  const failed = failures.get(key);
  const backoffMs = Math.min(ttlSeconds * 1000, MAX_FAILURE_BACKOFF_MS);
  if (config.offline) {
    error = "offline mode";
  } else if (failed && now - failed.at < backoffMs) {
    // Failed moments ago: don't block this request on another timeout.
    error = failed.error;
  } else {
    try {
      const value = await loader();
      memory.set(key, { value, fetchedAt: now });
      failures.delete(key);
      void writeSnapshot(key, value, now);
      return {
        data: value,
        source,
        freshness: "live",
        fetchedAt: new Date(now).toISOString(),
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      failures.set(key, { at: Date.now(), error });
    }
  }

  const hit = memory.get(key);
  if (hit) {
    return {
      data: hit.value as T,
      source,
      freshness: "cache",
      fetchedAt: new Date(hit.fetchedAt).toISOString(),
      error,
    };
  }

  const snap = await readSnapshot<T>(key);
  if (snap) {
    return {
      data: snap.data,
      source,
      freshness: "snapshot",
      fetchedAt: snap.fetchedAt,
      error,
    };
  }

  throw new Error(`No data for ${key}: ${error ?? "unknown error"}`);
}
