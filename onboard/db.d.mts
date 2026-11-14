import type { Pool, PoolClient } from "pg";

export const LOCK_MIGRATE: number;
export const LOCK_SYNC: number;
/** Client-side limit per query (pg query_timeout), 10 s. */
export const QUERY_TIMEOUT_MS: number;
/** DATABASE_URL (trimmed) or undefined when PostgreSQL is not configured. onboardConfig() is recomputed only when DATABASE_URL or a DEMIFY_* value changes. */
export function databaseUrl(env?: Record<string, string | undefined>): string | undefined;
/** Process-wide pool (query_timeout 10 s, TCP keep-alive, pool errors logged at most once a minute). Throws when DATABASE_URL is unset. */
export function getPool(): Pool;
/** Applies pending migrations once per process (advisory-locked). Resolves to the ids applied by this call. */
export function ensureSchema(pool?: Pool): Promise<string[]>;
/** Runs fn while holding a session advisory lock; resolves to null when another process holds it. */
export function withAdvisoryLock<T>(pool: Pool, key: number, fn: (client: PoolClient) => Promise<T>): Promise<T | null>;
/** true when SELECT 1 answers within timeoutMs (default 2000). Never throws. */
export function pingDatabase(pool?: Pool, timeoutMs?: number): Promise<boolean>;
export function closePool(): Promise<void>;
