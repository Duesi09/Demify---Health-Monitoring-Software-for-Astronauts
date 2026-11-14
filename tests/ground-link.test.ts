import { mkdirSync, promises as fs, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Simulated ground link switch (src/lib/onboard/ground-link.ts), its effect
 * on the source cache, and the /api/ground-link and /api/health routes.
 * The database backend runs only with DEMIFY_TEST_DATABASE_URL set.
 */

const TEST_URL = process.env.DEMIFY_TEST_DATABASE_URL;
const HOST = "localhost:3311";

let dir: string;

const link = () => import("@/lib/onboard/ground-link");
const linkRoute = () => import("@/app/api/ground-link/route");
const healthRoute = () => import("@/app/api/health/route");
const db = () => import("@onboard/db.mjs");
const linkFile = () => path.join(dir, "ground-link.json");

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}/api/ground-link`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-ground-link-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMIFY_OFFLINE", "");
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  vi.resetModules();
});

afterEach(async () => {
  vi.useRealTimers();
  await (await db()).closePool();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("ground link: file backend (no DATABASE_URL)", () => {
  it("is up when nothing is stored", async () => {
    const g = await link();
    expect(await g.getGroundLink()).toEqual({
      up: true,
      switchedUp: true,
      forcedOffline: false,
      changedAt: new Date(0).toISOString(),
      backend: "file",
    });
    expect(await g.isGroundLinkUp()).toBe(true);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("stores the switch in ground-link.json with an atomic write", async () => {
    const g = await link();
    const state = await g.setGroundLink(false, "test");
    expect(state).toMatchObject({ up: false, switchedUp: false, forcedOffline: false, changedBy: "test", backend: "file" });
    expect(Date.parse(state.changedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(await fs.readdir(dir)).toEqual(["ground-link.json"]); // no temp file left behind
    expect(JSON.parse(await fs.readFile(linkFile(), "utf8"))).toEqual({
      up: false,
      changedAt: state.changedAt,
      changedBy: "test",
    });
    expect(await g.isGroundLinkUp()).toBe(false);
    expect(await g.getGroundLink()).toEqual(state);

    // Survives a restart.
    vi.resetModules();
    expect(await (await link()).isGroundLinkUp()).toBe(false);
  });

  it("caches isGroundLinkUp for about 2 s; setGroundLink invalidates it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    const g = await link();
    expect(await g.isGroundLinkUp()).toBe(true);
    // Changed behind the app's back (e.g. by hand): seen after the cache expires.
    writeFileSync(linkFile(), JSON.stringify({ up: false, changedAt: new Date().toISOString() }));
    expect(await g.isGroundLinkUp()).toBe(true);
    vi.setSystemTime(new Date("2026-11-14T12:00:02.100Z"));
    expect(await g.isGroundLinkUp()).toBe(false);
    await g.setGroundLink(true);
    expect(await g.isGroundLinkUp()).toBe(true);
    await g.setGroundLink(false);
    expect(await g.isGroundLinkUp()).toBe(false);
  });

  it("a switch made through one Next.js module copy reaches the other at once", async () => {
    const pages = await link();
    expect(await pages.isGroundLinkUp()).toBe(true); // cached in this copy's view
    vi.resetModules();
    const routes = await link();
    expect(routes).not.toBe(pages);
    await routes.setGroundLink(false);
    expect(await pages.isGroundLinkUp()).toBe(false);
  });

  it("never throws: an unreadable or invalid file counts as up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(linkFile(), "{not json");
    const g = await link();
    expect(await g.isGroundLinkUp()).toBe(true);
    expect((await g.getGroundLink()).up).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not a valid ground link file/));

    // Data dir is a regular file: reads fall back to up; storing the switch fails loudly.
    const notADir = path.join(dir, "plain-file");
    writeFileSync(notADir, "x");
    vi.stubEnv("DEMIFY_DATA_DIR", notADir);
    expect(await g.isGroundLinkUp()).toBe(true);
    await expect(g.setGroundLink(false)).rejects.toThrow();
  });
});

describe("ground link: DEMIFY_OFFLINE=true", () => {
  it("forces the link down whatever the switch says", async () => {
    vi.stubEnv("DEMIFY_OFFLINE", "true");
    const g = await link();
    expect(await g.getGroundLink()).toMatchObject({ up: false, switchedUp: true, forcedOffline: true });
    expect(await g.isGroundLinkUp()).toBe(false);
    expect(await g.setGroundLink(true)).toMatchObject({ up: false, switchedUp: true, forcedOffline: true });
    expect(await g.isGroundLinkUp()).toBe(false);
  });
});

describe("source cache while the ground link is down", () => {
  let seedDir: string;

  beforeEach(() => {
    seedDir = path.join(dir, "seed");
    vi.stubEnv("DEMIFY_SNAPSHOT_DIR", path.join(dir, "runtime"));
    vi.stubEnv("DEMIFY_SNAPSHOT_SEED_DIR", seedDir);
    mkdirSync(seedDir, { recursive: true });
    writeFileSync(path.join(seedDir, "k.json"), JSON.stringify({ fetchedAt: "2026-01-01T00:00:00.000Z", data: "seed" }));
  });

  it("does no live fetch and serves the snapshot with a blackout error", async () => {
    const { cached, GROUND_LINK_DOWN } = await import("@/lib/sources/cache");
    await (await link()).setGroundLink(false);
    const loader = vi.fn(async () => "live");
    const r = await cached("k", "src", loader);
    expect(GROUND_LINK_DOWN).toBe("ground link down (simulated blackout)");
    expect(r).toMatchObject({ freshness: "snapshot", data: "seed", error: "ground link down (simulated blackout)" });
    expect(loader).not.toHaveBeenCalled();
    await expect(cached("none", "src", loader)).rejects.toThrow("No data for none: ground link down (simulated blackout)");
    expect(loader).not.toHaveBeenCalled();

    // Link back up: the very next request goes live (a blackout is not a failure to back off from).
    await (await link()).setGroundLink(true);
    expect(await cached("k", "src", loader)).toMatchObject({ freshness: "live", data: "live" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps serving what it fetched before the blackout from memory", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    const { cached } = await import("@/lib/sources/cache");
    const loader = vi.fn(async () => "before");
    expect(await cached("k", "src", loader, 60)).toMatchObject({ freshness: "live", data: "before" });
    await (await link()).setGroundLink(false);
    vi.setSystemTime(new Date("2026-11-14T12:05:00Z")); // memory is stale now
    const r = await cached("k", "src", loader, 60);
    expect(r).toMatchObject({ freshness: "cache", data: "before", error: "ground link down (simulated blackout)" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps the DEMIFY_OFFLINE message under a hard air-gap", async () => {
    vi.stubEnv("DEMIFY_OFFLINE", "true");
    const { cached } = await import("@/lib/sources/cache");
    const loader = vi.fn(async () => "live");
    expect(await cached("k", "src", loader)).toMatchObject({ freshness: "snapshot", error: "offline mode" });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/ground-link", () => {
  it("reads and switches the ground link", async () => {
    const { GET, POST } = await linkRoute();
    expect(await (await GET()).json()).toMatchObject({ up: true, backend: "file" });
    const res = await POST(post({ up: false }, { origin: `http://${HOST}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ up: false, switchedUp: false, changedBy: "operator", backend: "file" });
    expect(await (await GET()).json()).toMatchObject({ up: false });
    const back = await POST(post({ up: true, changedBy: "flight director" }));
    expect(await back.json()).toMatchObject({ up: true, changedBy: "flight director" });
  });

  it("has the same guards as POST /api/scenarios", async () => {
    const { POST } = await linkRoute();
    expect((await POST(post({ up: false }, { origin: "http://evil.example" }))).status).toBe(403);
    expect((await POST(post({ up: false }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(post("{nope"))).status).toBe(400);
    expect((await POST(post({ up: "no" }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ up: false, changedBy: "x".repeat(65) }))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ up: false, pad: "x".repeat(5000) })))).status).toBe(413);
    // None of these moved the switch.
    expect(await (await link()).isGroundLinkUp()).toBe(true);
  });

  it("needs the admin token when DEMIFY_ADMIN_TOKEN is set", async () => {
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "s3cret");
    const { POST } = await linkRoute();
    expect((await POST(post({ up: false }))).status).toBe(401);
    expect((await POST(post({ up: false }, { "x-demify-admin": "wrong" }))).status).toBe(401);
    expect((await POST(post({ up: false }, { "x-demify-admin": "s3cret" }))).status).toBe(200);
  });

  it("answers 500 with a plain message when the switch cannot be stored", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notADir = path.join(dir, "plain-file");
    writeFileSync(notADir, "x");
    vi.stubEnv("DEMIFY_DATA_DIR", notADir);
    const { POST } = await linkRoute();
    const res = await POST(post({ up: false }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not store the ground link switch" });
  });
});

describe("GET /api/health", () => {
  it("reports database not-configured and the ground link, keeping the existing fields", async () => {
    const { GET } = await healthRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      offline: false,
      database: "not-configured",
      groundLink: { up: true, forcedOffline: false },
    });
    expect(typeof body.mission).toBe("string");
    expect(Number.isFinite(Date.parse(body.time))).toBe(true);
  });

  it("stays 200 with database unreachable; the ground link falls back to the file", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://demify:x@127.0.0.1:1/demify");
    const g = await link();
    expect(await g.setGroundLink(false, "test")).toMatchObject({ up: false, backend: "file" });
    expect(await g.isGroundLinkUp()).toBe(false);
    const res = await (await healthRoute()).GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: "unreachable", groundLink: { up: false } });
  });
});

describe.skipIf(!TEST_URL)("ground link: database backend", () => {
  async function row() {
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
      const { rows } = await client.query("SELECT up, changed_at, changed_by FROM ground_link WHERE id = 1");
      return rows[0] as { up: boolean; changed_at: Date; changed_by: string | null };
    } finally {
      await client.end();
    }
  }

  async function sql(text: string) {
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
      await client.query(text);
    } finally {
      await client.end();
    }
  }

  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", TEST_URL!);
    const { closePool, ensureSchema } = await db();
    await closePool();
    const pool = new pg.Pool({ connectionString: TEST_URL, max: 1 });
    try {
      await ensureSchema(pool);
    } finally {
      await pool.end();
    }
    await sql("UPDATE ground_link SET up = true, changed_at = now() - interval '1 hour', changed_by = NULL WHERE id = 1");
  });

  it("stores the switch in PostgreSQL and mirrors it to the file", async () => {
    const g = await link();
    expect(await g.getGroundLink()).toMatchObject({ up: true, backend: "database" });
    const state = await g.setGroundLink(false, "test");
    expect(state).toMatchObject({ up: false, switchedUp: false, changedBy: "test", backend: "database" });
    expect(await row()).toMatchObject({ up: false, changed_by: "test" });
    expect(JSON.parse(await fs.readFile(linkFile(), "utf8"))).toEqual({ up: false, changedAt: state.changedAt, changedBy: "test" });
    expect(await g.isGroundLinkUp()).toBe(false);
    const res = await (await healthRoute()).GET();
    expect(await res.json()).toMatchObject({ database: "connected", groundLink: { up: false, forcedOffline: false } });
  });

  it("sees a change made in the database (sync service, psql) once the cache expires", async () => {
    const g = await link();
    await g.setGroundLink(false);
    await sql("UPDATE ground_link SET up = true, changed_at = now(), changed_by = 'psql' WHERE id = 1");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2_500);
    expect(await g.isGroundLinkUp()).toBe(true);
    expect(JSON.parse(await fs.readFile(linkFile(), "utf8"))).toMatchObject({ up: true, changedBy: "psql" });
  });

  it("uses the file while the database is unreachable and writes the newer switch back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = new URL(TEST_URL!);
    bad.port = "1";
    vi.stubEnv("DATABASE_URL", bad.toString());
    const g = await link();
    expect(await g.setGroundLink(false, "during outage")).toMatchObject({ up: false, backend: "file" });
    expect((await row()).up).toBe(true);

    await (await db()).closePool();
    vi.stubEnv("DATABASE_URL", TEST_URL!);
    expect(await g.getGroundLink()).toMatchObject({ up: false, changedBy: "during outage", backend: "database" });
    expect(await row()).toMatchObject({ up: false, changed_by: "during outage" });
  });
});
