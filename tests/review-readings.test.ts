import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reading } from "@/lib/types";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-readings-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DEMIFY_SIMULATE", "false");
  // A token exported in the shell (docs/OPERATIONS.md) must not turn these into 401s.
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

const store = () => import("@/lib/store/readings");
const route = () => import("@/app/api/readings/route");
const dbPath = () => path.join(dir, "demify-db.json");

function reading(over: Partial<Omit<Reading, "id">> = {}): Omit<Reading, "id"> {
  return {
    crewId: "cdr",
    indicator: "heartRate",
    value: 64,
    unit: "bpm",
    takenAt: new Date().toISOString(),
    source: "sensor",
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3311/api/readings", {
    method: "POST",
    headers: { host: "localhost:3311", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { crewId: "cdr", indicator: "heartRate", value: 64, unit: "bpm", source: "sensor" };

describe("readings store", () => {
  it("shares one load between concurrent first callers (#29)", async () => {
    await fs.writeFile(dbPath(), JSON.stringify({ crew: [{ id: "cdr", name: "C", role: "C", baseline: {} }], readings: [] }));
    const s = await store();
    const [, added] = await Promise.all([s.listCrew(), s.addReadings([reading()]), s.listReadings(), s.getCrew("cdr")]);
    await s.listCrew();
    expect(await s.listReadings()).toHaveLength(1);
    await s.addReadings([reading({ value: 70 })]);
    const onDisk = JSON.parse(await fs.readFile(dbPath(), "utf8"));
    expect(onDisk.readings.map((r: Reading) => r.id)).toContain(added[0].id);
    expect(onDisk.readings).toHaveLength(2);
  });

  it("moves a corrupt DB aside instead of overwriting it (#32)", async () => {
    await fs.writeFile(dbPath(), '{"crew":[{"id":"cdr"');
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await store();
    expect(await s.listReadings()).toEqual([]);
    expect(err).toHaveBeenCalled();
    const files = await fs.readdir(dir);
    const aside = files.find((f) => f.startsWith("demify-db.json.corrupt-"));
    expect(aside).toBeDefined();
    expect(await fs.readFile(path.join(dir, aside!), "utf8")).toBe('{"crew":[{"id":"cdr"');
    await s.addReadings([reading()]);
    expect(JSON.parse(await fs.readFile(dbPath(), "utf8")).readings).toHaveLength(1);
  });

  it("treats a missing file as an empty DB with default crew", async () => {
    const s = await store();
    expect((await s.listCrew()).map((c) => c.id)).toContain("cdr");
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("evicts by takenAt retention, not insertion order (#15/#31)", async () => {
    vi.stubEnv("DEMIFY_RETENTION_DAYS", "10");
    const s = await store();
    const old = new Date(Date.now() - 11 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 86_400_000).toISOString();
    await s.addReadings([reading({ takenAt: recent, source: "manual" })]);
    await s.addReadings([reading({ takenAt: old })]);
    const all = await s.listReadings();
    expect(all).toHaveLength(1);
    expect(all[0].takenAt).toBe(recent);
  });

  it("over the cap, drops oldest sensor readings before manual check-ins", async () => {
    vi.stubEnv("DEMIFY_MAX_READINGS", "3");
    const s = await store();
    const t = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    await s.addReadings([
      reading({ takenAt: t(10), source: "manual", value: 1 }),
      reading({ takenAt: t(9), source: "manual", value: 2 }),
    ]);
    await s.addReadings([
      reading({ takenAt: t(1), source: "sensor", value: 3 }),
      reading({ takenAt: t(2), source: "sensor", value: 4 }),
      reading({ takenAt: t(3), source: "sensor", value: 5 }),
    ]);
    const values = (await s.listReadings()).map((r) => r.value).sort();
    expect(values).toEqual([1, 2, 3]);
  });
});

describe("GET /api/readings hours (#8/#17)", () => {
  for (const hours of ["abc", "-1e20", "1e400", "", "0", "100000"]) {
    it(`hours=${JSON.stringify(hours)} does not 500`, async () => {
      const { GET } = await route();
      const res = await GET(new Request(`http://localhost/api/readings?crewId=cdr&hours=${hours}`));
      expect(res.status).toBe(200);
    });
  }
});

describe("POST /api/readings", () => {
  it("accepts a valid same-origin JSON post", async () => {
    const { POST } = await route();
    const res = await POST(post(valid, { origin: "http://localhost:3311" }));
    expect(res.status).toBe(201);
  });

  it("accepts a device post without Origin", async () => {
    const { POST } = await route();
    expect((await POST(post([valid, { ...valid, indicator: "systolicBP", value: 118, unit: "mmHg" }]))).status).toBe(201);
  });

  it("rejects cross-origin posts with 403 (#14)", async () => {
    const { POST } = await route();
    expect((await POST(post(valid, { origin: "http://evil.example" }))).status).toBe(403);
    expect((await POST(post(valid, { origin: "null" }))).status).toBe(403);
  });

  it("rejects non-JSON Content-Type with 415 (#14)", async () => {
    const { POST } = await route();
    expect((await POST(post(valid, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(post(valid, { "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect((await POST(post(valid, { "content-type": "application/json; charset=utf-8" }))).status).toBe(201);
  });

  it("caps body size at 1 MB, also for streamed bodies without Content-Length (#16/#30)", async () => {
    const { POST } = await route();
    const big = JSON.stringify({ crewId: "x".repeat(1_100_000) });
    expect((await POST(post(big, { "content-length": String(big.length) }))).status).toBe(413);
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 40) c.enqueue(chunk);
        else c.close();
      },
    });
    const req = new Request("http://localhost:3311/api/readings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(sent).toBeLessThan(40);
  });

  it("validates value range, unit and future takenAt (#13)", async () => {
    const { POST } = await route();
    expect((await POST(post({ ...valid, value: 1000 }))).status).toBe(400);
    expect((await POST(post({ ...valid, unit: "mmHg" }))).status).toBe(400);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await POST(post({ ...valid, takenAt: future }))).status).toBe(400);
    const skew = new Date(Date.now() + 60_000).toISOString();
    expect((await POST(post({ ...valid, takenAt: skew }))).status).toBe(201);
  });

  it("rate-limits readings per crew member (#15/#31)", async () => {
    vi.stubEnv("DEMIFY_RATE_LIMIT_PER_MIN", "5");
    const { POST } = await route();
    expect((await POST(post(Array(5).fill(valid)))).status).toBe(201);
    const res = await POST(post(valid));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await POST(post({ ...valid, crewId: "plt" }))).status).toBe(201);
  });
});
