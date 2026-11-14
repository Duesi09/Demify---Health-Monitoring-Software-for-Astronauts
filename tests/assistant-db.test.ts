import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg, { type Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantAnswer, LibraryListing, OnboardStatus } from "@/lib/onboard/types";

/**
 * The onboard assistant end to end on the onboard-server stack: PostgreSQL
 * + pgvector (DEMIFY_TEST_DATABASE_URL), the real library module, and the
 * fake model server (scripts/dev/fake-model-server.mjs, a test tool, not a
 * model). Run with:
 *
 *   DEMIFY_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/demify_b3 npx vitest run tests/assistant-db.test.ts
 */

const TEST_DB = process.env.DEMIFY_TEST_DATABASE_URL;
/** Own schema (search_path), so this file can reset it freely. */
const SCHEMA = "demify_assistant_test";
const DB_URL = TEST_DB
  ? `${TEST_DB}${TEST_DB.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${SCHEMA},public`)}`
  : "";
const ROOT = path.resolve(import.meta.dirname, "..");
const HOST = "localhost:3311";

const CREW = [
  { id: "cdr", name: "Commander", role: "Commander", baseline: { heartRate: 62, systolicBP: 118, diastolicBP: 76, bodyTemp: 36.7, glucose: 92, spo2: 98 } },
  { id: "plt", name: "Pilot", role: "Pilot", baseline: { heartRate: 58, systolicBP: 122, diastolicBP: 78, bodyTemp: 36.6, glucose: 88, spo2: 98 } },
  { id: "ms1", name: "Mission Specialist 1", role: "Mission Specialist", baseline: { heartRate: 66, systolicBP: 112, diastolicBP: 72, bodyTemp: 36.8, glucose: 95, spo2: 99 } },
  { id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", baseline: { heartRate: 60, systolicBP: 116, diastolicBP: 74, bodyTemp: 36.7, glucose: 90, spo2: 98 } },
];

const EXAMPLES: [question: string, docId: string][] = [
  ["The monitor shows ventricular fibrillation. What does the drill checklist say?", "alarm-response"],
  ["Blood pressure is 185/115. When do we contact the flight surgeon?", "vital-sign-ranges"],
  ["A solar storm is starting. What is the radiation shelter procedure?", "space-radiation"],
  ["Where is the pulse oximeter in the medical kit?", "med-kit-inventory"],
  ["What is the commander's resting heart rate baseline?", "crew-baselines"],
  ["The ground link is down. How do we handle a medical event during the blackout?", "ground-link-blackout"],
];
const ALSO_OK: Record<string, string[]> = { "vital-sign-ranges": ["alarm-response"] };
const NO_ANSWER_QUESTION = "What is the best treatment for a kidney stone?";

const answer = () => import("@/lib/assistant/answer");
const source = () => import("@/lib/assistant/library-source");
const db = () => import("@onboard/db.mjs");

function clearShared() {
  const g = globalThis as Record<string, unknown>;
  for (const k of ["__demifyGroundLink", "__demifyLibrarySource", "__demifyModelReady"]) delete g[k];
}

async function startFake(): Promise<{ url: string; child: ChildProcess }> {
  const child = spawn(process.execPath, [path.join(ROOT, "scripts/dev/fake-model-server.mjs"), "--port", "0"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout!.on("data", (d: Buffer) => {
      out += d.toString();
      const m = out.match(/listening on (\S+\/v1)/);
      if (m) resolve(m[1]);
    });
    child.on("exit", () => reject(new Error(out)));
  });
  return { url, child };
}

async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 30_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 100));
  }
}

const post = (url: string, body: unknown = {}) =>
  new Request(`http://${HOST}${url}`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe.skipIf(!TEST_DB)("onboard assistant on PostgreSQL with the fake model server", () => {
  let pool: Pool;
  let fake: { url: string; child: ChildProcess };
  let dataDir: string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: TEST_DB });
    await admin.connect();
    try {
      await admin.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public").catch(() => {});
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    } finally {
      await admin.end();
    }
    fake = await startFake();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-assistant-db-"));
    vi.stubEnv("DATABASE_URL", DB_URL);
    vi.stubEnv("DEMIFY_MODEL_URL", fake.url);
    // The fake's hash embeddings are less similar than a real model's (see its header).
    vi.stubEnv("DEMIFY_ASSISTANT_MIN_SCORE", "0.25");
    vi.stubEnv("DEMIFY_DATA_DIR", dataDir);
    vi.stubEnv("DEMIFY_GROUND_LIBRARY_DIR", path.join(ROOT, "library"));
    vi.stubEnv("DEMIFY_SIMULATE", "false");
    vi.stubEnv("DEMIFY_OFFLINE", "");
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
    clearShared();
    const { closePool, ensureSchema, getPool } = await db();
    await closePool();
    pool = getPool();
    await ensureSchema(pool);
    await pool.query(
      "INSERT INTO crew (id, name, role, baseline) SELECT x.id, x.name, x.role, x.baseline FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, role text, baseline jsonb)",
      [JSON.stringify(CREW)],
    );
  });

  afterAll(async () => {
    clearShared();
    await (await db()).closePool();
    await pool?.end().catch(() => {});
    fake?.child.kill("SIGTERM");
    vi.unstubAllEnvs();
    if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    (await answer()).resetAssistantState();
  });

  it("answers from the bundled library while the database library is empty, and syncs it in the background", async () => {
    const before = (await (await import("@/app/api/onboard/status/route")).GET().then((r) => r.json())) as OnboardStatus;
    expect(before.database).toBe("connected");
    expect(before.model.state).toBe("ready");
    expect(before.library).toMatchObject({ source: "bundled", lastSync: null });

    const a = await (await answer()).askAssistant({ question: EXAMPLES[3][0] });
    expect(a.status).toBe("answered");
    expect(a.mode.retrieval).toBe("bundled");
    expect(a.mode.fallbackReason).toMatch(/database library is empty/);
    expect(a.citations[0].docId).toBe("med-kit-inventory");

    const run = await waitFor(async () => {
      const { rows } = await pool.query("SELECT status, detail FROM sync_runs WHERE trigger = 'auto' AND status <> 'running' ORDER BY id DESC LIMIT 1");
      return rows[0];
    });
    expect(run.status).toBe("ok");
    expect(run.detail.chunksPendingEmbedding).toBe(0);
  });

  it("Sync now: POST /api/sync runs a manual sync", async () => {
    const { POST } = await import("@/app/api/sync/route");
    const res = await POST(post("/api/sync"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { library: { status: string; trigger: string; docsAdded: number; docsUnchanged: number } };
    expect(body.library).toMatchObject({ status: "ok", trigger: "manual", docsAdded: 0 });
    expect(body.library.docsUnchanged).toBeGreaterThanOrEqual(9);
  });

  it("lists the database library with sync runs and freshness", async () => {
    const { GET } = await import("@/app/api/library/route");
    const l = (await (await GET()).json()) as LibraryListing;
    expect(l.source).toBe("database");
    const ids = l.documents.map((d) => d.id);
    for (const id of ["alarm-response", "vital-sign-ranges", "space-radiation", "med-kit-inventory", "crew-baselines", "ground-link-blackout"]) {
      expect(ids).toContain(id);
    }
    expect(l.documents.every((d) => d.chunks > 0 && !!d.syncedAt)).toBe(true);
    expect(l.inventory.some((i) => /pulse oximeter/i.test(i.name))).toBe(true);
    expect(l.syncRuns.map((r) => r.trigger)).toEqual(expect.arrayContaining(["auto", "manual"]));
    expect(l.freshness).toMatchObject({ libraryAgeText: "last synced just now", stale: false });
  });

  it("reports the onboard status", async () => {
    const { GET } = await import("@/app/api/onboard/status/route");
    const s = (await (await GET()).json()) as OnboardStatus;
    expect(s.database).toBe("connected");
    expect(s.model).toMatchObject({ state: "ready", url: fake.url, available: ["gpt-oss:20b", "nomic-embed-text"] });
    expect(s.groundLink).toMatchObject({ up: true, backend: "database" });
    expect(s.library).toMatchObject({ source: "database", pendingEmbeddings: 0 });
    expect(s.library.documents).toBeGreaterThanOrEqual(9);
    expect(s.library.lastSync).toMatchObject({ kind: "library", trigger: "manual", status: "ok" });
    expect(s.library.freshness.libraryAgeText).toBe("last synced just now");
  });

  it.each(EXAMPLES)("answers %j with a citation from %s (vector search + model)", async (question, docId) => {
    const a = (await (await answer()).askAssistant({ question })) as AssistantAnswer;
    expect(a.status).toBe("answered");
    expect(a.mode).toMatchObject({ retrieval: "vector", model: "gpt-oss:20b", groundLink: "up" });
    expect(a.answer).toMatch(/According to the library, .+ \[1\]\.$/);
    expect(a.citations.map((c) => c.n)).toEqual([1]);
    expect([docId, ...(ALSO_OK[docId] ?? [])]).toContain(a.citations[0].docId);
    expect(a.citations[0].syncedAt).toBeTruthy();
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced just now", stale: false });
    expect(a.integrityFailures).toBe(0);
  });

  it("says the library has no good answer to the kidney stone question", async () => {
    const a = await (await answer()).askAssistant({ question: NO_ANSWER_QUESTION });
    expect(a).toMatchObject({ status: "no-answer", citations: [] });
    expect(a.mode.retrieval).toBe("vector");
  });

  it("without the model: full-text search and passages only, still no guess for the kidney stone", async () => {
    const { onboardConfig } = await import("@onboard/config.mjs");
    const cfg = onboardConfig({ ...process.env, DEMIFY_MODEL_URL: "http://127.0.0.1:1/v1" });
    const { askAssistant } = await answer();
    const a = await askAssistant({ question: EXAMPLES[0][0] }, cfg);
    expect(a.status).toBe("passages-only");
    expect(a.mode.retrieval).toBe("fulltext");
    expect(a.mode.fallbackReason).toMatch(/embedding model unreachable/);
    expect(a.citations[0].docId).toBe("alarm-response");
    const none = await askAssistant({ question: NO_ANSWER_QUESTION }, cfg);
    expect(none.status).toBe("no-answer");
  });

  it("never cites a chunk whose checksum no longer matches; the next sync repairs it", async () => {
    await pool.query("UPDATE library_chunks SET text = text || ' (tampered)' WHERE doc_id = 'alarm-response'");
    const { askAssistant } = await answer();
    const a = await askAssistant({ question: EXAMPLES[0][0] });
    expect(a.integrityFailures).toBeGreaterThan(0);
    expect(a.citations.some((c) => c.docId === "alarm-response")).toBe(false);

    const { syncNow } = await source();
    const out = await syncNow();
    expect(out.ok).toBe(true);
    const again = await askAssistant({ question: EXAMPLES[0][0] });
    expect(again.integrityFailures).toBe(0);
    expect(again.citations[0].docId).toBe("alarm-response");
  });

  it("blackout: no sync from the ground, answers say to wait for contact", async () => {
    const { setGroundLink } = await import("@/lib/onboard/ground-link");
    await setGroundLink(false, "test");
    try {
      const { POST } = await import("@/app/api/sync/route");
      const res = await POST(post("/api/sync"));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("Ground link is down (blackout): nothing to sync from");
      const a = await (await answer()).askAssistant({ question: NO_ANSWER_QUESTION });
      expect(a.reason).toBe("The onboard library has no good answer to this. Ask the flight surgeon when contact returns.");
      expect(a.freshness.groundLinkUp).toBe(false);
    } finally {
      await setGroundLink(true, "test");
    }
  });

  it("stale library with the ground link up: an automatic sync starts", async () => {
    await pool.query("UPDATE sync_runs SET finished_at = now() - interval '30 hours', started_at = now() - interval '30 hours'");
    (await source()).resetLibrarySourceState();
    const a = await (await answer()).askAssistant({ question: EXAMPLES[2][0] });
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 30 hours ago", stale: true });
    const run = await waitFor(async () => {
      const { rows } = await pool.query(
        "SELECT status FROM sync_runs WHERE trigger = 'auto' AND status <> 'running' AND started_at > now() - interval '1 minute' LIMIT 1",
      );
      return rows[0];
    });
    expect(run.status).toBe("ok");
  });

  it("falls back to the bundled library when the database is unreachable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { onboardConfig } = await import("@onboard/config.mjs");
    const cfg = onboardConfig({ ...process.env, DATABASE_URL: "postgres://postgres:test@127.0.0.1:1/nothing" });
    const { resolveLibrary } = await source();
    vi.stubEnv("DATABASE_URL", cfg.databaseUrl!);
    try {
      const lib = await resolveLibrary(cfg);
      expect(lib).toMatchObject({ source: "bundled", database: "unreachable", pool: null });
      expect(lib.fallbackReason).toMatch(/^database unreachable/);
    } finally {
      // getPool() made a pool for the unreachable URL; close it and go back to the test database.
      await (await db()).closePool();
      vi.stubEnv("DATABASE_URL", DB_URL);
      warn.mockRestore();
    }
  });
});
