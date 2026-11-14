import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantAnswer, LibraryListing, OnboardStatus } from "@/lib/onboard/types";

/**
 * Routes of the onboard assistant in the laptop setup (no database, no
 * model unless a test starts the fake model server): POST /api/assistant
 * (guards, validation, rate limit), GET /api/library, GET
 * /api/onboard/status and POST /api/sync.
 */

const HOST = "localhost:3311";
const ROOT = path.resolve(import.meta.dirname, "..");
const VF = "The monitor shows ventricular fibrillation. What does the drill checklist say?";

let dir: string;

const assistantRoute = () => import("@/app/api/assistant/route");
const libraryRoute = () => import("@/app/api/library/route");
const statusRoute = () => import("@/app/api/onboard/status/route");
const syncRoute = () => import("@/app/api/sync/route");
const groundLink = () => import("@/lib/onboard/ground-link");

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}${url}`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ask = (body: unknown, headers: Record<string, string> = {}) => post("/api/assistant", body, headers);

function clearShared() {
  const g = globalThis as Record<string, unknown>;
  for (const k of ["__demifyGroundLink", "__demifyLibrarySource", "__demifyModelReady", "__demifyScenarios"]) delete g[k];
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-assistant-routes-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMIFY_MODEL_URL", "");
  vi.stubEnv("DEMIFY_OFFLINE", "");
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  vi.stubEnv("DEMIFY_SIMULATE", "false");
  clearShared();
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  clearShared();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("POST /api/assistant", () => {
  it("answers with library passages and citations (no model on this machine)", async () => {
    const { POST } = await assistantRoute();
    const res = await POST(ask({ question: VF }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const a = (await res.json()) as AssistantAnswer;
    expect(a.status).toBe("passages-only");
    expect(a.citations[0].docId).toBe("alarm-response");
    expect(a.mode).toMatchObject({ retrieval: "bundled", model: null, groundLink: "up" });
    expect(a.notice).toMatch(/^Advises, never decides\./);
    expect(Date.parse(a.askedAt)).not.toBeNaN();
  });

  it("rejects cross-origin, non-JSON, invalid and oversized requests", async () => {
    const { POST } = await assistantRoute();
    expect((await POST(ask({ question: VF }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(ask({ question: VF }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(ask("{oops"))).status).toBe(400);
    expect((await POST(ask({ question: "hi" }))).status).toBe(400);
    expect((await POST(ask({ question: "   hi    " }))).status).toBe(400);
    expect((await POST(ask({ question: "x".repeat(501) }))).status).toBe(400);
    expect((await POST(ask({}))).status).toBe(400);
    expect((await POST(ask({ question: "y".repeat(5000) }))).status).toBe(413);
    const unknown = await POST(ask({ question: VF, crewId: "nobody" }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Unknown crewId" });
    // Same-origin browser requests pass.
    expect((await POST(ask({ question: VF }, { origin: `http://${HOST}` }))).status).toBe(200);
  });

  it("needs no admin token", async () => {
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "stage-token-0123456789abcdef");
    const { POST } = await assistantRoute();
    expect((await POST(ask({ question: VF }))).status).toBe(200);
  });

  it("adds crew context for a selected crew member", async () => {
    vi.stubEnv("DEMIFY_OFFLINE", "true");
    vi.stubEnv("DEMIFY_SIMULATE", "true");
    const { POST } = await assistantRoute();
    const res = await POST(ask({ question: "What is the commander's resting heart rate baseline?", crewId: "cdr" }));
    expect(res.status).toBe(200);
    const a = (await res.json()) as AssistantAnswer;
    expect(a.citations[0].docId).toBe("crew-baselines");
    expect(a.crewContext).toMatchObject({ crewId: "cdr", crewName: "Commander", source: "SIMULATED" });
    expect(a.crewContext!.summary).toMatch(/Overall status from the rule engine: \w+\./);
    expect(a.crewContext!.summary).toMatch(/Latest live sample \(SIMULATED, /);
    expect(a.freshness.crewDataAt).toBe(a.crewContext!.takenAt);
    // DEMIFY_OFFLINE: the ground link is down.
    expect(a.mode.groundLink).toBe("down");
  });

  it("allows 12 questions a minute per client, then answers 429 with Retry-After", async () => {
    const { POST } = await assistantRoute();
    for (let i = 0; i < 12; i++) expect((await POST(ask({ question: "hi" }))).status).toBe(400);
    const limited = await POST(ask({ question: VF }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    // Another client has its own budget.
    expect((await POST(ask({ question: VF }, { "x-forwarded-for": "10.0.0.7, 10.0.0.1" }))).status).toBe(200);
  });

  it("starts a new budget after a minute", async () => {
    const { takeAssistantBudget, resetAssistantBudget } = await import("@/lib/assistant/rate-limit");
    resetAssistantBudget();
    const t0 = 1_000_000;
    for (let i = 0; i < 12; i++) expect(takeAssistantBudget("a", t0 + i)).toBe(0);
    expect(takeAssistantBudget("a", t0 + 30_000)).toBe(30);
    expect(takeAssistantBudget("a", t0 + 60_000)).toBe(0);
  });
});

describe("GET /api/library", () => {
  it("lists the bundled library, the inventory and its freshness", async () => {
    const { GET } = await libraryRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const l = (await res.json()) as LibraryListing;
    expect(l.source).toBe("bundled");
    const ids = l.documents.map((d) => d.id);
    for (const id of ["alarm-response", "ground-link-blackout", "space-radiation", "vital-sign-ranges", "med-kit-inventory", "crew-baselines"]) {
      expect(ids).toContain(id);
    }
    expect(l.documents.every((d) => d.chunks > 0 && /^[0-9a-f]{64}$/.test(d.version) && !d.syncedAt)).toBe(true);
    // Protocols first.
    expect(l.documents[0].category).toBe("protocol");
    expect(l.inventory.some((i) => /pulse oximeter/i.test(i.name))).toBe(true);
    expect(l.syncRuns).toEqual([]);
    expect(l.freshness.libraryAgeText).toMatch(/^bundled with this release \(\d{4}-\d{2}-\d{2}\), no sync on this machine$/);
    expect(l.freshness.stale).toBe(false);
  });
});

describe("GET /api/onboard/status", () => {
  it("reports the laptop setup: no database, no model, bundled library", async () => {
    const { GET } = await statusRoute();
    const s = (await (await GET()).json()) as OnboardStatus;
    expect(s.database).toBe("not-configured");
    expect(s.model).toEqual({ state: "not-configured", url: null, llm: "gpt-oss:20b", embed: "nomic-embed-text", available: [] });
    expect(s.groundLink).toMatchObject({ up: true, backend: "file" });
    expect(s.library).toMatchObject({ source: "bundled", pendingEmbeddings: 0, lastSync: null });
    expect(s.library.documents).toBeGreaterThanOrEqual(8);
    expect(s.library.chunks).toBeGreaterThan(s.library.documents);
    expect(s.library.freshness.libraryAgeText).toMatch(/^bundled with this release/);
    expect(s.syncIntervalHours).toBe(6);
  });

  it("reports the model server: ready, missing models, unreachable", async () => {
    const fake = spawn(process.execPath, [path.join(ROOT, "scripts/dev/fake-model-server.mjs"), "--port", "0"], {
      env: { ...process.env, FAKE_MODELS: "gpt-oss:20b" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let out = "";
        fake.stdout!.on("data", (d: Buffer) => {
          out += d.toString();
          const m = out.match(/listening on (\S+\/v1)/);
          if (m) resolve(m[1]);
        });
        fake.on("exit", () => reject(new Error(out)));
      });
      vi.stubEnv("DEMIFY_MODEL_URL", url);
      const { GET } = await statusRoute();
      const s = (await (await GET()).json()) as OnboardStatus;
      expect(s.model).toEqual({ state: "missing-models", url, llm: "gpt-oss:20b", embed: "nomic-embed-text", available: ["gpt-oss:20b"] });
    } finally {
      fake.kill("SIGTERM");
    }

    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((r) => closed.close(() => r()));
    vi.stubEnv("DEMIFY_MODEL_URL", `http://127.0.0.1:${port}/v1`);
    const { GET } = await statusRoute();
    expect(((await (await GET()).json()) as OnboardStatus).model.state).toBe("unreachable");
  });
});

describe("POST /api/sync", () => {
  it("is guarded like the other write routes", async () => {
    const { POST } = await syncRoute();
    expect((await POST(post("/api/sync", {}, { origin: "https://evil.example" }))).status).toBe(403);
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "stage-token-0123456789abcdef");
    expect((await POST(post("/api/sync", {}))).status).toBe(401);
  });

  it("answers 409 during a blackout", async () => {
    await (await groundLink()).setGroundLink(false, "test");
    const { POST } = await syncRoute();
    const res = await POST(post("/api/sync", {}));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ground link is down (blackout): nothing to sync from",
      reason: "Ground link is down (blackout): nothing to sync from",
    });
  });

  it("answers 409 without a database and 503 while it is unreachable", async () => {
    const { POST } = await syncRoute();
    const none = await POST(post("/api/sync", {}));
    expect(none.status).toBe(409);
    expect((await none.json()).reason).toMatch(/No database is set up on this machine/);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://postgres:test@127.0.0.1:1/nothing");
    vi.resetModules();
    clearShared();
    const route = await syncRoute();
    const down = await route.POST(post("/api/sync", {}));
    expect(down.status).toBe(503);
    expect((await down.json()).reason).toMatch(/The database is unreachable/);
    await (await import("@onboard/db.mjs")).closePool();
  });
});
