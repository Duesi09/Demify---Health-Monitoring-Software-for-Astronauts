// @ts-check
/**
 * Settings of the onboard server stack (PostgreSQL library, local model
 * server, ground-link sync). Plain JavaScript on purpose: the Next.js app
 * imports it (via @onboard/config.mjs) and so do the standalone Node scripts
 * in scripts/ (ingestion, sync service), which run in the same Docker image
 * without a TypeScript toolchain.
 *
 * Every value comes from an environment variable. With none of them set,
 * Demify runs exactly as before: JSON-file store, no assistant model, the
 * library read from the bundled files.
 */
import path from "node:path";

/** @param {Record<string, string | undefined>} env @param {string} name */
function str(env, name) {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {number} fallback
 * @param {number} min
 */
function num(env, name, fallback, min) {
  const raw = str(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= min) return n;
  console.warn(`[demify] Ignoring invalid ${name}=${JSON.stringify(raw)}; using ${fallback}.`);
  return fallback;
}

/** Embedding width of the library_chunks.embedding column (migration 001). */
export const SCHEMA_EMBED_DIM = 768;

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {import("./config.d.mts").OnboardConfig}
 */
export function onboardConfig(env = process.env) {
  const modelUrl = str(env, "DEMIFY_MODEL_URL")?.replace(/\/+$/, "");
  const embedDim = num(env, "DEMIFY_EMBED_DIM", SCHEMA_EMBED_DIM, 1);
  if (embedDim !== SCHEMA_EMBED_DIM) {
    console.warn(
      `[demify] DEMIFY_EMBED_DIM=${embedDim} does not match the database column (${SCHEMA_EMBED_DIM}); ` +
        "vector search is disabled until a migration changes the column.",
    );
  }
  return {
    databaseUrl: str(env, "DATABASE_URL"),
    modelUrl,
    llmModel: str(env, "DEMIFY_LLM_MODEL") ?? "gpt-oss:20b",
    embedModel: str(env, "DEMIFY_EMBED_MODEL") ?? "nomic-embed-text",
    embedDim,
    vectorSearch: embedDim === SCHEMA_EMBED_DIM,
    llmTimeoutMs: num(env, "DEMIFY_LLM_TIMEOUT_MS", 90_000, 1000),
    embedTimeoutMs: num(env, "DEMIFY_EMBED_TIMEOUT_MS", 20_000, 1000),
    groundLibraryDir:
      str(env, "DEMIFY_GROUND_LIBRARY_DIR") ?? path.join(process.cwd(), "library"),
    syncIntervalHours: num(env, "DEMIFY_SYNC_INTERVAL_HOURS", 6, 0.05),
    syncMaxAgeHours: num(env, "DEMIFY_SYNC_MAX_AGE_HOURS", 24, 1),
    appUrl: (str(env, "DEMIFY_APP_URL") ?? "http://127.0.0.1:3000").replace(/\/+$/, ""),
    minScore: num(env, "DEMIFY_ASSISTANT_MIN_SCORE", 0.5, 0),
    topK: Math.floor(num(env, "DEMIFY_ASSISTANT_TOP_K", 5, 1)),
    offline: str(env, "DEMIFY_OFFLINE")?.toLowerCase() === "true",
    dataDir: str(env, "DEMIFY_DATA_DIR") ?? path.join(process.cwd(), "data"),
    adminToken: str(env, "DEMIFY_ADMIN_TOKEN"),
  };
}
