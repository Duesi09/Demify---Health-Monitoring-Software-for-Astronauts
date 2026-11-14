/**
 * API shapes of the onboard server features (ground link, library, onboard
 * assistant). Shared by the route handlers and the UI; plain JSON only.
 */
import type { LibraryCategory, MedKitItem, RetrievalTier } from "@onboard/library.mjs";

export type { LibraryCategory, MedKitItem, RetrievalTier };

/** GET/POST /api/ground-link */
export interface GroundLinkState {
  /** Effective state: false when switched off OR forced off by DEMIFY_OFFLINE. */
  up: boolean;
  /** The switch position (what the crew/operator last set). */
  switchedUp: boolean;
  /** DEMIFY_OFFLINE=true: hard air-gap, the switch cannot bring the link up. */
  forcedOffline: boolean;
  changedAt: string;
  changedBy?: string;
  /** Where the switch is stored. */
  backend: "database" | "file";
}

export interface SyncRunSummary {
  id?: number;
  kind: "library" | "snapshots";
  trigger: string;
  status: "running" | "ok" | "skipped" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  detail?: Record<string, unknown>;
}

/** How fresh the data behind an answer is. Shown with every answer. */
export interface Freshness {
  /** Last successful library sync (DB) or the bundled library date (no DB); null = never synced. */
  librarySyncedAt: string | null;
  /** "last synced 14 hours ago" / "bundled with this release (2026-11-14)" / "never synced". */
  libraryAgeText: string;
  /** Older than DEMIFY_SYNC_MAX_AGE_HOURS (default 24 h). */
  stale: boolean;
  /** Newest crew reading or live sample used as context (null = none). */
  crewDataAt: string | null;
  groundLinkUp: boolean;
}

export interface Citation {
  /** The [n] marker used in the answer text. */
  n: number;
  docId: string;
  title: string;
  heading: string;
  category: LibraryCategory;
  source: string;
  url?: string;
  license: string;
  reviewed?: string;
  /** Document version (SHA-256 prefix shown in the UI). */
  version: string;
  /** Chunk checksum, verified before the chunk was used. */
  sha256: string;
  excerpt: string;
  score: number;
  syncedAt?: string;
}

/** POST /api/assistant  body: { question: string; crewId?: string } */
export interface AssistantAnswer {
  /**
   * answered      - model answer with citations
   * passages-only - no model (offline / not configured) or its answer failed a safety check: the matching library passages are shown instead
   * no-answer     - the library has no good answer; the assistant says so instead of guessing
   * blocked       - the question asks for something the prototype never answers (e.g. medicine doses)
   */
  status: "answered" | "passages-only" | "no-answer" | "blocked";
  /** Answer text with [n] citation markers; null unless status is "answered". */
  answer: string | null;
  /** Plain-language reason for passages-only / no-answer / blocked. */
  reason?: string;
  citations: Citation[];
  /** Crew data used as context ([C] in the answer), if a crew member was selected. */
  crewContext?: { crewId: string; crewName: string; summary: string; takenAt: string | null; source: string };
  freshness: Freshness;
  mode: {
    retrieval: RetrievalTier;
    /** Model id that wrote the answer, null when none was used. */
    model: string | null;
    groundLink: "up" | "down";
    /** Why a better retrieval tier or the model was not used. */
    fallbackReason?: string;
  };
  /** Chunks dropped because their checksum did not match. */
  integrityFailures: number;
  askedAt: string;
  /** Always shown: the assistant advises, the crew and flight surgeons decide. */
  notice: string;
}

/** GET /api/onboard/status */
export interface OnboardStatus {
  database: "connected" | "unreachable" | "not-configured";
  model: {
    state: "ready" | "missing-models" | "unreachable" | "not-configured";
    url: string | null;
    llm: string;
    embed: string;
    available: string[];
  };
  groundLink: GroundLinkState;
  library: {
    source: "database" | "bundled";
    documents: number;
    chunks: number;
    pendingEmbeddings: number;
    freshness: Pick<Freshness, "librarySyncedAt" | "libraryAgeText" | "stale">;
    lastSync: SyncRunSummary | null;
  };
  syncIntervalHours: number;
}

/** GET /api/library */
export interface LibraryListing {
  source: "database" | "bundled";
  documents: {
    id: string;
    title: string;
    category: LibraryCategory;
    source: string;
    url?: string;
    license: string;
    reviewed?: string;
    updated?: string;
    version: string;
    syncedAt?: string;
    chunks: number;
  }[];
  inventory: MedKitItem[];
  syncRuns: SyncRunSummary[];
  freshness: Pick<Freshness, "librarySyncedAt" | "libraryAgeText" | "stale">;
}
