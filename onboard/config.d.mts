/** Settings of the onboard server stack. See onboard/config.mjs and .env.spark.example. */
export interface OnboardConfig {
  /** DATABASE_URL. Unset = no PostgreSQL: JSON-file store and bundled library. */
  databaseUrl?: string;
  /** DEMIFY_MODEL_URL: OpenAI-compatible base URL incl. /v1 (Ollama: http://model:11434/v1). Unset = no model. */
  modelUrl?: string;
  /** DEMIFY_LLM_MODEL, default "gpt-oss:20b". */
  llmModel: string;
  /** DEMIFY_EMBED_MODEL, default "nomic-embed-text". */
  embedModel: string;
  /** DEMIFY_EMBED_DIM, default 768 (must match the schema). */
  embedDim: number;
  /** false when embedDim does not match the schema column; retrieval then uses full-text search. */
  vectorSearch: boolean;
  llmTimeoutMs: number;
  embedTimeoutMs: number;
  /** DEMIFY_GROUND_LIBRARY_DIR: the Earth-side library the sync pulls from (simulated by a folder). */
  groundLibraryDir: string;
  /** DEMIFY_SYNC_INTERVAL_HOURS: sync period while the ground link is up (default 6). */
  syncIntervalHours: number;
  /** DEMIFY_SYNC_MAX_AGE_HOURS: library older than this is shown as stale (default 24 = daily sync). */
  syncMaxAgeHours: number;
  /** DEMIFY_APP_URL: where the sync service reaches the app (default http://127.0.0.1:3000). */
  appUrl: string;
  /** DEMIFY_ASSISTANT_MIN_SCORE: cosine similarity below which a chunk does not count as an answer (default 0.5). */
  minScore: number;
  /** DEMIFY_ASSISTANT_TOP_K: chunks retrieved per question (default 3). */
  topK: number;
  /** DEMIFY_OFFLINE=true: hard air-gap, the ground link can never be up. */
  offline: boolean;
  dataDir: string;
  adminToken?: string;
}

export const SCHEMA_EMBED_DIM: number;
export function onboardConfig(env?: Record<string, string | undefined>): OnboardConfig;
