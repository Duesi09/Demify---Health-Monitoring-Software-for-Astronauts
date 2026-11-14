// @ts-check
/**
 * PostgreSQL access shared by the app and the scripts: one pool per process,
 * schema migrations under an advisory lock (several containers may start at
 * once), and a lock helper so only one library sync runs at a time.
 */
import pg from "pg";
import { onboardConfig } from "./config.mjs";
import { MIGRATIONS } from "./migrations.mjs";

/** Advisory lock keys (arbitrary, fixed). */
export const LOCK_MIGRATE = 7_311_001;
export const LOCK_SYNC = 7_311_002;

/** @type {{ __demifyPg?: { url: string; pool: import("pg").Pool; schema?: Promise<string[]> } }} */
const g = /** @type {any} */ (globalThis);

/** @param {Record<string, string | undefined>} [env] */
export function databaseUrl(env = process.env) {
  return onboardConfig(env).databaseUrl;
}

/** Process-wide pool (kept on globalThis so Next.js module copies share it). */
export function getPool() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (g.__demifyPg && g.__demifyPg.url === url) return g.__demifyPg.pool;
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    application_name: "demify",
  });
  // An idle client that loses its connection (database restart) emits
  // 'error' on the pool; without a listener that would crash the process.
  pool.on("error", (err) => {
    console.warn(`[demify] PostgreSQL connection lost: ${err.message}`);
  });
  g.__demifyPg = { url, pool };
  return pool;
}

/**
 * Applies pending migrations (once per process; retried after a failure).
 * Resolves to the ids applied by this call.
 * @param {import("pg").Pool} [pool]
 * @returns {Promise<string[]>}
 */
export function ensureSchema(pool = getPool()) {
  const state = g.__demifyPg;
  if (state && state.pool === pool && state.schema) return state.schema;
  const run = migrate(pool);
  if (state && state.pool === pool) {
    state.schema = run;
    run.catch(() => {
      if (state.schema === run) state.schema = undefined;
    });
  }
  return run;
}

/** @param {import("pg").Pool} pool */
async function migrate(pool) {
  const client = await pool.connect();
  /** @type {string[]} */
  const applied = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_MIGRATE]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query("SELECT id FROM schema_migrations");
    const done = new Set(rows.map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        applied.push(m.id);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
    if (applied.length) console.log(`[demify] database migrations applied: ${applied.join(", ")}`);
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_MIGRATE]).catch(() => {});
    client.release();
  }
}

/**
 * Runs fn while holding a session advisory lock on one connection.
 * Resolves to null (without calling fn) when another process holds the lock.
 * @template T
 * @param {import("pg").Pool} pool
 * @param {number} key
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @returns {Promise<T | null>}
 */
export async function withAdvisoryLock(pool, key, fn) {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [key]);
    locked = rows[0]?.ok === true;
    if (!locked) return null;
    return await fn(client);
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [key]).catch(() => {});
    client.release();
  }
}

/**
 * true when the database answers SELECT 1 within timeoutMs.
 * @param {import("pg").Pool} [pool]
 * @param {number} [timeoutMs]
 */
export async function pingDatabase(pool, timeoutMs = 2000) {
  try {
    const p = pool ?? getPool();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const ok = await Promise.race([p.query("SELECT 1").then(() => true, () => false), timeout]);
    clearTimeout(timer);
    return ok === true;
  } catch {
    return false;
  }
}

/** Closes the shared pool (scripts call this before exiting). */
export async function closePool() {
  const state = g.__demifyPg;
  g.__demifyPg = undefined;
  if (state) await state.pool.end().catch(() => {});
}
