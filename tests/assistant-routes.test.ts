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
  for (const k of ["__demifyGroundLink", "__demifyLibrarySource", "__demifyModelReady", "__demifyChatsInFlight", "__demifyScenarios"]) delete g[k];
}

/** Starts scripts/dev/fake-model-server.mjs on a free port; resolves to its /v1 URL and a stop function. */
async function fakeModel(env: Record<string, string> = {}): Promise<{ url: string; stop: () => void }> {
  const fake = spawn(process.execPath, [path.join(ROOT, "scripts/dev/fake-model-server.mjs"), "--port", "0"], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    fake.stdout!.on("data", (d: Buffer) => {
      out += d.toString();
      const m = out.match(/listening on (\S+\/v1)/);
      if (m) resolve(m[1]);
    });
    fake.on("exit", () => reject(new Error(out)));
  });
  return { url, stop: () => fake.kill("SIGTERM") };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-assistant-routes-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMIFY_MODEL_URL", "");
  vi.stubEnv("DEMIFY_OFFLINE", "");
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  vi.stubEnv("DEMIFY_SIMULATE", "false");
  vi.stubEnv("DEMIFY_TRUST_PROXY", "");
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
    // A chunked body (no Content-Length) is read only up to the limit.
    const chunked = new Request(`http://${HOST}/api/assistant`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json" },
      body: new ReadableStream({
        pull(c) {
          c.enqueue(new TextEncoder().encode("x".repeat(1024)));
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await POST(chunked)).status).toBe(413);
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

  it("refuses a body whose Content-Length is too large before reading it (checker C1 finding 12)", async () => {
    const { POST } = await assistantRoute();
    let pulled = 0;
    const req = new Request(`http://${HOST}/api/assistant`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json", "content-length": "100000" },
      body: new ReadableStream({
        pull(c) {
          pulled++;
          c.enqueue(new TextEncoder().encode("x".repeat(1024)));
        },
      }),
      duplex: "half",
    } as RequestInit);
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Body too large" });
    expect(pulled).toBeLessThanOrEqual(1); // the stream may prefetch one chunk; the route reads none
  });

  it("allows 12 questions a minute, then answers 429 with Retry-After; a made-up X-Forwarded-For does not help (checker C1 finding 9)", async () => {
    const { POST } = await assistantRoute();
    for (let i = 0; i < 12; i++) expect((await POST(ask({ question: "hi" }))).status).toBe(400);
    const limited = await POST(ask({ question: VF }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    // Without DEMIFY_TRUST_PROXY the header is the client's own word: still limited.
    expect((await POST(ask({ question: VF }, { "x-forwarded-for": "10.0.0.7" }))).status).toBe(429);
    expect((await POST(ask({ question: VF }, { "x-real-ip": "10.0.0.8" }))).status).toBe(429);
  });

  it("behind a trusted proxy (DEMIFY_TRUST_PROXY=true) counts per client: the address the proxy appended", async () => {
    vi.stubEnv("DEMIFY_TRUST_PROXY", "true");
    const { POST } = await assistantRoute();
    const { clientKey } = await import("@/lib/assistant/rate-limit");
    expect(clientKey(ask({ question: VF }, { "x-forwarded-for": "6.6.6.6, 10.0.0.7" }))).toBe("10.0.0.7");
    expect(clientKey(ask({ question: VF }, { "x-real-ip": "10.0.0.9" }))).toBe("10.0.0.9");
    expect(clientKey(ask({ question: VF }))).toBe("direct");
    expect(clientKey(ask({ question: VF }, { "x-forwarded-for": "10.0.0.7" }), false)).toBe("direct");
    for (let i = 0; i < 12; i++) expect((await POST(ask({ question: "hi" }, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).status).toBe(400);
    expect((await POST(ask({ question: VF }, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).status).toBe(429);
    // A different leftmost (client-written) entry is the same client.
    expect((await POST(ask({ question: VF }, { "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).status).toBe(429);
    // Another client has its own budget.
    expect((await POST(ask({ question: VF }, { "x-forwarded-for": "1.2.3.4, 10.0.0.2" }))).status).toBe(200);
  });

  it("answers 503 while the model already answers two questions", async () => {
    const fake = await fakeModel({ FAKE_DELAY_MS: "1200" });
    try {
      vi.stubEnv("DEMIFY_MODEL_URL", fake.url);
      vi.stubEnv("DEMIFY_ASSISTANT_MIN_SCORE", "0.25");
      const { POST } = await assistantRoute();
      const results = await Promise.all([0, 1, 2].map(() => POST(ask({ question: VF }))));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 503]);
      const busy = results.find((r) => r.status === 503)!;
      expect(await busy.json()).toEqual({ error: "Assistant busy, try again in a moment." });
      expect(busy.headers.get("retry-after")).toBe("5");
      const answered = (await results.find((r) => r.status === 200)!.json()) as AssistantAnswer;
      expect(answered.status).toBe("answered");
    } finally {
      fake.stop();
    }
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

describe("POST /api/assistant with a model server and no database (lead decision 5)", () => {
  const EXAMPLES: [string, string[]][] = [
    [VF, ["alarm-response"]],
    ["Blood pressure is 185/115. When do we contact the flight surgeon?", ["vital-sign-ranges", "alarm-response", "escalation-and-signal-delay"]],
    ["A solar storm is starting. What is the radiation shelter procedure?", ["space-radiation"]],
    ["Where is the pulse oximeter in the medical kit?", ["med-kit-inventory"]],
    ["What is the commander's resting heart rate baseline?", ["crew-baselines"]],
    ["The ground link is down. How do we handle a medical event during the blackout?", ["ground-link-blackout"]],
  ];

  it("the model writes the answers from the bundled keyword hits; no-answer and blocked stay as they are", async () => {
    const fake = await fakeModel();
    try {
      vi.stubEnv("DEMIFY_MODEL_URL", fake.url);
      const { POST } = await assistantRoute();
      for (const [question, docs] of EXAMPLES) {
        const a = (await (await POST(ask({ question }))).json()) as AssistantAnswer;
        expect(a.status, question).toBe("answered");
        expect(a.mode).toMatchObject({ retrieval: "bundled", model: "gpt-oss:20b" });
        expect(a.answer).toMatch(/According to the library, .+ \[1\]\.$/);
        expect(a.citations.map((c) => c.n)).toEqual([1]);
        expect(docs).toContain(a.citations[0].docId);
        expect(a.citations[0].text.length).toBeGreaterThan(0);
      }
      const kidney = (await (await POST(ask({ question: "What is the best treatment for a kidney stone?" }))).json()) as AssistantAnswer;
      expect(kidney.status).toBe("no-answer");
      const dose = (await (await POST(ask({ question: "How many milligrams can I give him?" }))).json()) as AssistantAnswer;
      expect(dose.status).toBe("blocked");
    } finally {
      fake.stop();
    }
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
    const fake = await fakeModel({ FAKE_MODELS: "gpt-oss:20b" });
    try {
      vi.stubEnv("DEMIFY_MODEL_URL", fake.url);
      const { GET } = await statusRoute();
      const s = (await (await GET()).json()) as OnboardStatus;
      expect(s.model).toEqual({ state: "missing-models", url: fake.url, llm: "gpt-oss:20b", embed: "nomic-embed-text", available: ["gpt-oss:20b"] });
    } finally {
      fake.stop();
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
