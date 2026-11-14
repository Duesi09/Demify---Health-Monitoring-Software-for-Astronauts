import type { Freshness } from "../onboard/types";

/**
 * How fresh the onboard library is, in words the crew reads with every
 * answer: "last synced 14 hours ago", "bundled with this release
 * (2026-11-14), no sync on this machine", "never synced". Pure functions.
 */

export type LibraryFreshness = Pick<Freshness, "librarySyncedAt" | "libraryAgeText" | "stale">;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** "just now" / "5 minutes ago" / "14 hours ago" / "3 days ago". A time in the future reads "just now". */
export function agoText(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "at an unknown time";
  const age = now - t;
  if (age < MINUTE_MS) return "just now";
  if (age < HOUR_MS) return plural(Math.floor(age / MINUTE_MS), "minute");
  if (age < 2 * DAY_MS) return plural(Math.floor(age / HOUR_MS), "hour");
  return plural(Math.floor(age / DAY_MS), "day");
}

/** "last synced 14 hours ago" / "last synced just now" / "never synced". */
export function ageText(syncedAt: string | null, now = Date.now()): string {
  return syncedAt ? `last synced ${agoText(syncedAt, now)}` : "never synced";
}

/** "bundled with this release (2026-11-14), no sync on this machine". */
export function bundledAgeText(date: string | null): string {
  const day = date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  return `bundled with this release${day ? ` (${day})` : ""}, no sync on this machine`;
}

/** Older than maxAgeHours, or never synced. */
export function isStale(syncedAt: string | null, maxAgeHours: number, now = Date.now()): boolean {
  if (!syncedAt) return true;
  const t = Date.parse(syncedAt);
  return !Number.isFinite(t) || now - t > maxAgeHours * HOUR_MS;
}

/**
 * Database library: the last successful sync decides (stale after
 * DEMIFY_SYNC_MAX_AGE_HOURS, never synced = stale).
 */
export function databaseFreshness(syncedAt: string | null, maxAgeHours: number, now = Date.now()): LibraryFreshness {
  return { librarySyncedAt: syncedAt, libraryAgeText: ageText(syncedAt, now), stale: isStale(syncedAt, maxAgeHours, now) };
}

/**
 * Bundled library (no database on this machine): dated by the newest
 * document in the release. Not stale: nothing on this machine syncs, and the
 * text says where the library comes from. No readable library at all reads
 * "never synced" and is stale.
 */
export function bundledFreshness(date: string | null): LibraryFreshness {
  if (!date) return { librarySyncedAt: null, libraryAgeText: "never synced", stale: true };
  const t = Date.parse(date);
  return {
    librarySyncedAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
    libraryAgeText: bundledAgeText(date),
    stale: false,
  };
}
