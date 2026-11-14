// @ts-check
/**
 * PostgreSQL schema of the onboard server, as ordered migrations. Applied by
 * ensureSchema() in onboard/db.mjs (app start, sync service, ingestion CLI),
 * each one in its own transaction and recorded in schema_migrations.
 *
 * Never edit a migration that has shipped: add a new one.
 *
 * Integrity: the cluster is initialised with --data-checksums (see
 * docker-compose.spark.yml), so PostgreSQL verifies every data page it reads.
 * On top of that every library chunk and document stores a SHA-256 of its
 * text, which the app re-checks before it shows a chunk to the crew.
 */

/** @type {readonly { id: string; sql: string }[]} */
export const MIGRATIONS = [
  {
    id: "001_init",
    sql: `
CREATE EXTENSION IF NOT EXISTS vector;

-- Crew and their pre-flight baselines (normal relational data).
CREATE TABLE crew (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  role       text NOT NULL,
  baseline   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Health readings (check-ins, devices). Same shape as the Reading type.
CREATE TABLE readings (
  id         uuid PRIMARY KEY,
  crew_id    text NOT NULL REFERENCES crew(id),
  indicator  text NOT NULL,
  value      double precision NOT NULL,
  unit       text NOT NULL,
  taken_at   timestamptz NOT NULL,
  source     text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX readings_crew_time_idx ON readings (crew_id, taken_at);
CREATE INDEX readings_indicator_time_idx ON readings (indicator, taken_at);

-- Local medical library: one row per curated document.
CREATE TABLE library_documents (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  category    text NOT NULL,          -- protocol | reference | baseline | inventory | drug-reference
  source      text NOT NULL,          -- who wrote / where it comes from
  url         text,
  license     text NOT NULL,
  reviewed    text,                   -- review status, shown to the crew
  updated     text,                   -- document date from its front matter
  path        text,                   -- path inside the ground library
  body        text NOT NULL,
  body_sha256 text NOT NULL,          -- version id = SHA-256 of body
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- Chunks with their embedding and a full-text index (fallback when the
-- embedding model is down).
CREATE TABLE library_chunks (
  id          bigserial PRIMARY KEY,
  doc_id      text NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
  ord         integer NOT NULL,
  heading     text NOT NULL DEFAULT '',
  text        text NOT NULL,
  sha256      text NOT NULL,          -- SHA-256 of text, re-checked on read
  embedding   vector(768),            -- NULL = waiting for the embedding model
  embed_model text,
  tsv         tsvector GENERATED ALWAYS AS (
                to_tsvector('english', coalesce(heading, '') || ' ' || text)
              ) STORED,
  UNIQUE (doc_id, ord)
);
CREATE INDEX library_chunks_tsv_idx ON library_chunks USING gin (tsv);
CREATE INDEX library_chunks_embedding_idx ON library_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX library_chunks_pending_idx ON library_chunks (id) WHERE embedding IS NULL;

-- Medical kit inventory (devices and supplies; no medicines in this prototype).
CREATE TABLE med_kit_items (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  category   text NOT NULL,
  location   text,
  quantity   integer,
  unit       text,
  expires_on date,
  notes      text,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

-- Sync history: library pulls from the ground and data-snapshot refreshes.
CREATE TABLE sync_runs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,          -- library | snapshots
  trigger     text NOT NULL,          -- schedule | manual | startup | cli | auto
  status      text NOT NULL,          -- running | ok | skipped | failed
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX sync_runs_kind_time_idx ON sync_runs (kind, started_at DESC);

-- Simulated ground link (single row), shared by the app and the sync service.
CREATE TABLE ground_link (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  up         boolean NOT NULL DEFAULT true,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text
);
INSERT INTO ground_link (id) VALUES (1) ON CONFLICT DO NOTHING;
`,
  },
];
