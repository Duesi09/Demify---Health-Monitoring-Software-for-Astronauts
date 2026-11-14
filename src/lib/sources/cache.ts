import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";
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
 */

interface Entry {
  value: unknown;
  fetchedAt: number;
}

const memory = new Map<string, Entry>();

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
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
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

async function writeSnapshot(key: string, data: unknown) {
  try {
    await fs.mkdir(config.snapshotDir, { recursive: true });
    const tmp = snapshotPath(key) + ".tmp";
    await fs.writeFile(
      tmp,
      JSON.stringify({ fetchedAt: new Date().toISOString(), data }),
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
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.fetchedAt < ttlSeconds * 1000) {
    return {
      data: hit.value as T,
      source,
      freshness: "cache",
      fetchedAt: new Date(hit.fetchedAt).toISOString(),
    };
  }

  let error: string | undefined;
  if (!config.offline) {
    try {
      const value = await loader();
      memory.set(key, { value, fetchedAt: now });
      void writeSnapshot(key, value);
      return {
        data: value,
        source,
        freshness: "live",
        fetchedAt: new Date(now).toISOString(),
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    error = "offline mode";
  }

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
