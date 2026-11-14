/**
 * The local medical library: curated Markdown documents (library/**.md with
 * front matter) plus the medical-kit inventory (library/inventory/*.json),
 * chunked, checksummed, embedded and stored in PostgreSQL. The same module
 * reads the bundled files directly when there is no database (laptop mode).
 */
import type { Pool } from "pg";
import type { OnboardConfig } from "./config.mjs";

export type LibraryCategory = "protocol" | "reference" | "baseline" | "inventory" | "drug-reference";

export interface LibraryDoc {
  id: string;
  title: string;
  category: LibraryCategory;
  /** Who wrote it / where it comes from (shown with every citation). */
  source: string;
  url?: string;
  license: string;
  /** Review status shown to the crew, e.g. "Project text, not clinically reviewed". */
  reviewed?: string;
  /** Document date (YYYY-MM-DD) from the front matter. */
  updated?: string;
  /** Path relative to the library root. */
  path: string;
  /** Markdown body without front matter. */
  body: string;
  /** SHA-256 (hex) of body = version id. */
  version: string;
}

export interface LibraryChunk {
  docId: string;
  ord: number;
  /** Nearest Markdown heading path, e.g. "Alarm response › Ventricular fibrillation". */
  heading: string;
  text: string;
  /** SHA-256 (hex) of text. */
  sha256: string;
}

export interface MedKitItem {
  id: string;
  name: string;
  category: string;
  location?: string;
  quantity?: number;
  unit?: string;
  /** YYYY-MM-DD */
  expiresOn?: string;
  notes?: string;
}

export type RetrievalTier = "vector" | "fulltext" | "bundled";

export interface LibraryHit {
  docId: string;
  title: string;
  category: LibraryCategory;
  source: string;
  url?: string;
  license: string;
  reviewed?: string;
  version: string;
  heading: string;
  text: string;
  sha256: string;
  /** Vector: cosine similarity 0..1. Full-text: ts_rank_cd. Bundled: keyword score. Higher = better. */
  score: number;
  tier: RetrievalTier;
  /** When this document version reached the onboard library (DB tiers only). */
  syncedAt?: string;
  /** false when sha256(text) no longer matches the stored checksum (the hit must not be shown). */
  integrityOk: boolean;
}

export interface SearchResult {
  tier: RetrievalTier;
  hits: LibraryHit[];
  /** Hits dropped because their checksum did not match. */
  integrityFailures: number;
  /** Why a better tier was not used, e.g. "embedding model unreachable". */
  fallbackReason?: string;
}

export interface SyncResult {
  kind: "library";
  status: "ok" | "skipped" | "failed";
  trigger: "schedule" | "manual" | "startup" | "cli" | "auto";
  reason?: string;
  docsAdded: number;
  docsUpdated: number;
  docsRemoved: number;
  docsUnchanged: number;
  inventoryItems: number;
  chunksEmbedded: number;
  chunksPendingEmbedding: number;
  startedAt: string;
  finishedAt: string;
}

/** Parses one Markdown file with YAML-style front matter (id, title, category, source, url, license, reviewed, updated). Throws on missing id/title/category/source/license. */
export function parseDoc(relPath: string, raw: string): LibraryDoc;
/** Splits a document at headings into chunks of at most maxChars (default 1200) with overlap (default 150), never mid-word. */
export function chunkDoc(doc: LibraryDoc, opts?: { maxChars?: number; overlap?: number }): LibraryChunk[];
export function sha256(text: string): string;
/** Reads every *.md document and inventory/*.json under dir (sorted, deterministic). */
export function readLibraryDir(dir: string): Promise<{ docs: LibraryDoc[]; inventory: MedKitItem[] }>;
/** Markdown document generated from crew baselines (category "baseline"), so baselines are citable. */
export function crewBaselineDoc(crew: { id: string; name: string; role: string; baseline: Record<string, number> }[], updated: string): LibraryDoc;
/** Markdown document generated from the inventory (category "inventory"). */
export function inventoryDoc(items: MedKitItem[], updated: string): LibraryDoc;

/**
 * Pulls the ground library into PostgreSQL: upserts changed documents (by
 * version), deletes removed ones, re-chunks changed ones, replaces the
 * inventory, regenerates the crew-baseline document from the crew table,
 * then embeds pending chunks when the model is reachable (otherwise they stay
 * pending and full-text search covers them). Holds LOCK_SYNC; returns status
 * "skipped" when another sync runs or the ground link is down (unless
 * opts.force for the first local ingest). Records a sync_runs row.
 */
export function syncLibrary(
  pool: Pool,
  cfg: OnboardConfig,
  opts: { trigger: SyncResult["trigger"]; groundLinkUp: boolean; force?: boolean },
): Promise<SyncResult>;

/** Embeds up to limit (default 256) chunks whose embedding is NULL. Returns how many were embedded. */
export function embedPending(pool: Pool, cfg: OnboardConfig, limit?: number): Promise<number>;

/**
 * Retrieval with fallbacks: vector (pgvector cosine, needs DB + embedding
 * model) -> full-text (PostgreSQL) -> never "bundled" here. Re-checks every
 * hit's SHA-256. Throws only when the database itself is unreachable.
 */
export function searchLibrary(pool: Pool, cfg: OnboardConfig, query: string, k?: number): Promise<SearchResult>;

/** Keyword search over bundled documents (no database). Deterministic BM25-style score. */
export function searchBundled(docs: LibraryDoc[], query: string, k?: number): SearchResult;

/** Latest successful library sync (finished_at), or null. */
export function lastLibrarySync(pool: Pool): Promise<string | null>;
