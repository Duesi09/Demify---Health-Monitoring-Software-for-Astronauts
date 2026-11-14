import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reading } from "@/lib/types";

/**
 * PostgreSQL readings store (src/lib/store/readings-pg.ts) through the
 * readings.ts facade. Needs a test database:
 *   DEMIFY_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/demify_b1 npx vitest run tests/readings-pg.test.ts
 * Each test empties the crew and readings tables (the schema stays).
 */

const TEST_URL = process.env.DEMIFY_TEST_DATABASE_URL;

let dir: string;

const store = () => import("@/lib/store/readings");
const db = () => import("@onboard/db.mjs");
const dbPath = () => path.join(dir, "demify-db.json");

/** Same database, nothing listening (port 1 refuses connections). */
function badUrl(): string {
  const u = new URL(TEST_URL!);
  u.port = "1";
  return u.toString();
}

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

async function resetDatabase() {
  const { closePool, ensureSchema } = await db();
  await closePool();
  const pool = new pg.Pool({ connectionString: TEST_URL, max: 1 });
  try {
    await ensureSchema(pool);
    await pool.query("TRUNCATE readings, crew CASCADE");
  } finally {
    await pool.end();
  }
}

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

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
/** Everything but the id (the two stores generate different ids). */
const strip = (rs: Reading[]) =>
  rs.map(({ crewId, indicator, value, unit, takenAt, source, note }) => ({ crewId, indicator, value, unit, takenAt, source, note }));

describe.skipIf(!TEST_URL)("PostgreSQL readings store", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-readings-pg-"));
    vi.stubEnv("DEMIFY_DATA_DIR", dir);
    vi.stubEnv("DATABASE_URL", TEST_URL!);
    vi.stubEnv("DEMIFY_RETENTION_DAYS", "");
    vi.stubEnv("DEMIFY_MAX_READINGS", "");
    await resetDatabase();
    vi.resetModules();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await (await db()).closePool();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("start-up", () => {
    it("seeds the default crew into an empty crew table, only then", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await store();
      expect((await s.listCrew()).map((c) => c.id)).toEqual(["cdr", "plt", "ms1", "ms2"]);
      expect(await s.getCrew("plt")).toMatchObject({ name: "Pilot", role: "Pilot", baseline: { heartRate: 58 } });
      expect(await s.getCrew("nobody")).toBeUndefined();
      expect(await s.listReadings()).toEqual([]);
      expect(log.mock.calls.flat().join("\n")).toMatch(/added the 4 default crew members/);
      // Nothing was written to the JSON store.
      expect(await fs.readdir(dir)).toEqual([]);

      // A crew table that is not empty is left alone by the next start.
      await query("DELETE FROM crew WHERE id = 'ms2'");
      await (await db()).closePool();
      vi.resetModules();
      const again = await store();
      expect((await again.listCrew()).map((c) => c.id)).toEqual(["cdr", "plt", "ms1"]);
    });

    it("imports demify-db.json once (ON CONFLICT DO NOTHING) and renames it", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const uuid = "4b0b3c1e-6f0a-4c3e-9a51-0d6c2b7e8f10";
      const file = {
        crew: [
          { id: "cdr", name: "Commander Vega", role: "Commander", baseline: { heartRate: 61 } },
          { id: "eva", name: "EVA Specialist", role: "Mission Specialist", baseline: {} },
        ],
        readings: [
          { id: uuid, crewId: "cdr", indicator: "heartRate", value: 61, unit: "bpm", takenAt: "2026-11-10T08:00:00.000Z", source: "manual", note: "after sleep" },
          { id: "legacy-1", crewId: "eva", indicator: "spo2", value: 97, unit: "%", takenAt: "2026-11-11T08:00:00Z", source: "sensor" },
          { id: "c0ffee00-0000-4000-8000-000000000003", crewId: "cdr", indicator: "bodyTemp", value: 36.8, unit: "°C", takenAt: "2026-11-12T08:00:00.000Z", source: "manual" },
          // Skipped: unknown crew member, and a value that is not a number.
          { id: "c0ffee00-0000-4000-8000-000000000004", crewId: "ghost", indicator: "heartRate", value: 70, unit: "bpm", takenAt: "2026-11-12T09:00:00.000Z", source: "sensor" },
          { id: "c0ffee00-0000-4000-8000-000000000005", crewId: "cdr", indicator: "heartRate", value: "fast", unit: "bpm", takenAt: "2026-11-12T10:00:00.000Z", source: "sensor" },
        ],
      };
      await fs.writeFile(dbPath(), JSON.stringify(file));

      const s = await store();
      const all = await s.listReadings();
      expect(all.map((r) => r.value)).toEqual([61, 97, 36.8]);
      expect(all[0]).toEqual({
        id: uuid,
        crewId: "cdr",
        indicator: "heartRate",
        value: 61,
        unit: "bpm",
        takenAt: "2026-11-10T08:00:00.000Z",
        source: "manual",
        note: "after sleep",
      });
      // ISO strings via toISOString; a legacy id becomes a stable UUID.
      expect(all[1].takenAt).toBe("2026-11-11T08:00:00.000Z");
      expect(all[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(all[1]).not.toHaveProperty("note");

      // The file's crew list is used as is: no default crew mixed in.
      expect((await s.listCrew()).map((c) => c.id)).toEqual(["cdr", "eva"]);
      expect((await s.getCrew("cdr"))?.name).toBe("Commander Vega");

      const files = await fs.readdir(dir);
      expect(files).not.toContain("demify-db.json");
      const renamed = files.find((f) => f.startsWith("demify-db.json.imported-"));
      expect(renamed).toBeDefined();
      expect(JSON.parse(await fs.readFile(path.join(dir, renamed!), "utf8"))).toEqual(file);
      expect(log.mock.calls.flat().join("\n")).toMatch(
        /Imported .*demify-db\.json into PostgreSQL: 3 readings added, 0 already there, 2 skipped .* 2 crew members added\. The file was renamed to demify-db\.json\.imported-/,
      );

      // A restart does not import again; the same file put back adds nothing twice.
      await (await db()).closePool();
      vi.resetModules();
      await fs.writeFile(dbPath(), JSON.stringify(file));
      const again = await store();
      expect(await again.listReadings()).toEqual(all);
      expect(log.mock.calls.flat().join("\n")).toMatch(/0 readings added, 3 already there/);
      expect(await query("SELECT count(*)::int AS n FROM readings")).toEqual([{ n: 3 }]);
    });
  });

  describe("same contract as the JSON store", () => {
    it("addReadings returns the stored readings with ids and ISO takenAt", async () => {
      const s = await store();
      const [created] = await s.addReadings([reading({ takenAt: "2026-11-14T10:00:00Z", note: "check-in" })]);
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await s.listReadings()).toEqual([{ ...created, takenAt: "2026-11-14T10:00:00.000Z" }]);
      expect(await s.addReadings([])).toEqual([]);
    });

    it("filters crewId / indicator / since / limit exactly like the JSON store", async () => {
      const input = [
        reading({ crewId: "cdr", indicator: "heartRate", value: 60, takenAt: hoursAgo(50) }),
        reading({ crewId: "cdr", indicator: "heartRate", value: 61, takenAt: hoursAgo(30) }),
        reading({ crewId: "plt", indicator: "heartRate", value: 62, takenAt: hoursAgo(20) }),
        reading({ crewId: "cdr", indicator: "spo2", value: 97, unit: "%", takenAt: hoursAgo(10), source: "manual" }),
        reading({ crewId: "cdr", indicator: "heartRate", value: 63, takenAt: hoursAgo(5) }),
        reading({ crewId: "cdr", indicator: "heartRate", value: 64, takenAt: hoursAgo(1) }),
      ];
      // Insert out of time order: the result order must come from takenAt.
      const shuffled = [input[3], input[0], input[5], input[1], input[4], input[2]];
      const filters = [
        undefined,
        {},
        { crewId: "cdr" },
        { crewId: "nobody" },
        { indicator: "heartRate" as const },
        { crewId: "cdr", indicator: "heartRate" as const },
        { since: hoursAgo(24) },
        { crewId: "cdr", since: hoursAgo(24) },
        { crewId: "cdr", indicator: "heartRate" as const, limit: 2 },
        { limit: 1 },
        { limit: 3 },
        { limit: 100 },
        { limit: 0 },
        { limit: 2.7 },
        { limit: -2 },
        { since: hoursAgo(24), limit: 2 },
      ];

      // Reference: the JSON store with DATABASE_URL unset.
      const jsonDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-readings-json-"));
      vi.stubEnv("DEMIFY_DATA_DIR", jsonDir);
      vi.stubEnv("DATABASE_URL", "");
      vi.resetModules();
      const j = await store();
      await j.addReadings(shuffled.slice(0, 3));
      await j.addReadings(shuffled.slice(3));
      const expected = [];
      for (const f of filters) expected.push(strip(await j.listReadings(f)));
      await fs.rm(jsonDir, { recursive: true, force: true });

      vi.stubEnv("DEMIFY_DATA_DIR", dir);
      vi.stubEnv("DATABASE_URL", TEST_URL!);
      vi.resetModules();
      const s = await store();
      await s.addReadings(shuffled.slice(0, 3));
      await s.addReadings(shuffled.slice(3));
      for (const [i, f] of filters.entries()) {
        expect(strip(await s.listReadings(f)), JSON.stringify(f)).toEqual(expected[i]);
      }
      expect(expected[8].map((r) => r.value)).toEqual([63, 64]);
    });
  });

  describe("retention", () => {
    it("drops readings past DEMIFY_RETENTION_DAYS, at most every 10 minutes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
      vi.stubEnv("DEMIFY_RETENTION_DAYS", "10");
      const s = await store();
      const old = new Date(Date.now() - 11 * 86_400_000).toISOString();
      const recent = new Date(Date.now() - 86_400_000).toISOString();
      await s.addReadings([reading({ takenAt: recent, source: "manual" }), reading({ takenAt: old })]);
      expect((await s.listReadings()).map((r) => r.takenAt)).toEqual([recent]);

      // Within 10 minutes of the last pass the next insert does not prune.
      vi.setSystemTime(new Date("2026-11-14T12:09:00Z"));
      await s.addReadings([reading({ takenAt: old, value: 70 })]);
      expect(await s.listReadings()).toHaveLength(2);

      vi.setSystemTime(new Date("2026-11-14T12:10:01Z"));
      await s.addReadings([reading({ takenAt: recent, value: 71 })]);
      expect((await s.listReadings()).map((r) => r.value)).toEqual([64, 71]);
    });

    it("over DEMIFY_MAX_READINGS drops the oldest sensor readings, then manual, then other sources", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
      vi.stubEnv("DEMIFY_MAX_READINGS", "3");
      const s = await store();
      const t = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
      await s.addReadings([
        reading({ takenAt: t(10), source: "manual", value: 1 }),
        reading({ takenAt: t(9), source: "manual", value: 2 }),
      ]);
      vi.setSystemTime(new Date("2026-11-14T12:11:00Z"));
      await s.addReadings([
        reading({ takenAt: t(1), source: "sensor", value: 3 }),
        reading({ takenAt: t(2), source: "sensor", value: 4 }),
        reading({ takenAt: t(3), source: "sensor", value: 5 }),
      ]);
      expect((await s.listReadings()).map((r) => r.value).sort()).toEqual([1, 2, 3]);

      // Sensor readings exhausted: the oldest manual check-ins go next, legacy sources last.
      vi.stubEnv("DEMIFY_MAX_READINGS", "1");
      await query(
        `INSERT INTO readings (id, crew_id, indicator, value, unit, taken_at, source)
         VALUES ('c0ffee00-0000-4000-8000-0000000000aa', 'cdr', 'heartRate', 9, 'bpm', now() - interval '30 days', 'legacy')`,
      );
      vi.setSystemTime(new Date("2026-11-14T12:22:00Z"));
      await s.addReadings([reading({ takenAt: t(0.5), source: "manual", value: 6 })]);
      expect((await s.listReadings()).map((r) => r.value)).toEqual([9]);
    });
  });

  describe("resilience", () => {
    it("spools to the JSON store while the database is unreachable and replays it when it is back", async () => {
      vi.stubEnv("DATABASE_URL", badUrl());
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await store();

      // Reads fall back to the JSON store, writes are spooled into it; nothing throws.
      expect((await s.listCrew()).map((c) => c.id)).toEqual(["cdr", "plt", "ms1", "ms2"]);
      const a = await s.addReadings([reading({ takenAt: hoursAgo(2), value: 70 })]);
      const b = await s.addReadings([reading({ crewId: "plt", takenAt: hoursAgo(1), value: 71, source: "manual" })]);
      expect(await s.listReadings()).toEqual([...a, ...b]);
      const spool = JSON.parse(await fs.readFile(dbPath(), "utf8"));
      expect(spool.readings.map((r: Reading) => r.id)).toEqual([a[0].id, b[0].id]);
      // Logged once, without a raw stack.
      const outage = warn.mock.calls.filter((c) => /PostgreSQL is unreachable/.test(String(c[0])));
      expect(outage).toHaveLength(1);
      expect(String(outage[0][0])).toMatch(/ECONNREFUSED/);

      // The database is back.
      await (await db()).closePool();
      vi.stubEnv("DATABASE_URL", TEST_URL!);
      expect(await s.listReadings()).toEqual([...a, ...b]);
      expect(await query("SELECT id::text FROM readings ORDER BY taken_at")).toEqual([{ id: a[0].id }, { id: b[0].id }]);
      const files = await fs.readdir(dir);
      expect(files).not.toContain("demify-db.json");
      expect(files.some((f) => f.startsWith("demify-db.json.imported-"))).toBe(true);
      expect(log.mock.calls.flat().join("\n")).toMatch(/2 readings added, 0 already there/);

      // The spool is cleared: the next write goes to the database only.
      const c = await s.addReadings([reading({ value: 72 })]);
      expect((await s.listReadings()).map((r) => r.id)).toEqual([a[0].id, b[0].id, c[0].id]);
      expect(await fs.readdir(dir)).not.toContain("demify-db.json");
    });

    it("recovers on the same DATABASE_URL after an outage (retry after 15 s)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      const target = new URL(TEST_URL!);
      const port = await freePort();
      const viaProxy = new URL(TEST_URL!);
      viaProxy.hostname = "127.0.0.1";
      viaProxy.port = String(port);
      vi.stubEnv("DATABASE_URL", viaProxy.toString());

      let proxy = await startProxy(port, target.hostname, Number(target.port || 5432));
      const s = await store();
      const a = await s.addReadings([reading({ takenAt: "2026-11-14T10:00:00.000Z", value: 70 })]);
      expect((await s.listReadings()).map((r) => r.id)).toEqual([a[0].id]);

      await proxy.close(); // outage: open connections dropped, new ones refused
      const b = await s.addReadings([reading({ takenAt: "2026-11-14T11:00:00.000Z", value: 71 })]);
      // Degraded: the last-known history plus what was spooled.
      expect((await s.listReadings()).map((r) => r.id)).toEqual([a[0].id, b[0].id]);
      expect(warn.mock.calls.filter((c) => /PostgreSQL is unreachable/.test(String(c[0])))).toHaveLength(1);
      // Only the spooled reading is in the JSON file.
      expect(JSON.parse(await fs.readFile(dbPath(), "utf8")).readings.map((r: Reading) => r.id)).toEqual([b[0].id]);

      proxy = await startProxy(port, target.hostname, Number(target.port || 5432));
      try {
        // Still inside the retry window: no database attempt yet.
        expect((await s.listReadings()).map((r) => r.id)).toEqual([a[0].id, b[0].id]);
        expect(await fs.readdir(dir)).toContain("demify-db.json");
        vi.setSystemTime(new Date("2026-11-14T12:00:16Z"));
        expect((await s.listReadings()).map((r) => r.id)).toEqual([a[0].id, b[0].id]);
        expect(await fs.readdir(dir)).not.toContain("demify-db.json");
      } finally {
        await (await db()).closePool();
        await proxy.close();
      }
    });

    it("keeps a reading the database rejects (unknown crew) instead of throwing", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const s = await store();
      await s.listCrew(); // start-up done
      const [ghost] = await s.addReadings([reading({ crewId: "ghost" })]);
      expect(warn.mock.calls.flat().join("\n")).toMatch(/PostgreSQL could not store readings .*JSON file store was used instead/);
      // The next database operation replays the spool; the reading stays in the renamed file.
      expect(await s.listReadings()).toEqual([]);
      expect(log.mock.calls.flat().join("\n")).toMatch(/0 readings added, 0 already there, 1 skipped/);
      const renamed = (await fs.readdir(dir)).find((f) => f.startsWith("demify-db.json.imported-"));
      const kept = JSON.parse(await fs.readFile(path.join(dir, renamed!), "utf8"));
      expect(kept.readings.map((r: Reading) => r.id)).toEqual([ghost.id]);
      // Also saved on its own with the reason (imported-* files are pruned, rejected-* files are not).
      const rejected = (await fs.readdir(dir)).find((f) => f.startsWith("demify-db.json.rejected-"));
      const saved = JSON.parse(await fs.readFile(path.join(dir, rejected!), "utf8"));
      expect(saved.readings.map((r: Reading) => r.id)).toEqual([ghost.id]);
      expect(saved.reasons).toEqual([{ kind: "reading", id: ghost.id, reason: 'unknown crew member "ghost"' }]);
    });

    it("keeps the crew history during an outage: last-known copy (loaded at start-up) plus the spool", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      // History stored before this process started (an earlier run), and a crew list of its own.
      await query(
        `INSERT INTO crew (id, name, role, baseline) VALUES
           ('cdr', 'Commander', 'Commander', '{}'), ('plt', 'Pilot', 'Pilot', '{}'), ('eva', 'EVA Specialist', 'Mission Specialist', '{}')`,
      );
      await query(
        `INSERT INTO readings (id, crew_id, indicator, value, unit, taken_at, source) VALUES
           ('c0ffee00-0000-4000-8000-000000000101', 'cdr', 'heartRate', 61, 'bpm', '2026-11-13T08:00:00Z', 'manual'),
           ('c0ffee00-0000-4000-8000-000000000102', 'plt', 'heartRate', 59, 'bpm', '2026-11-13T09:00:00Z', 'sensor'),
           ('c0ffee00-0000-4000-8000-000000000103', 'eva', 'spo2', 97, '%', '2026-11-13T10:00:00Z', 'sensor'),
           ('c0ffee00-0000-4000-8000-000000000199', 'cdr', 'heartRate', 50, 'bpm', '2020-01-01T00:00:00Z', 'sensor')`,
      );
      vi.stubEnv("DEMIFY_RETENTION_DAYS", "365"); // the 2020 reading is outside the window
      const target = new URL(TEST_URL!);
      const port = await freePort();
      const viaProxy = new URL(TEST_URL!);
      viaProxy.hostname = "127.0.0.1";
      viaProxy.port = String(port);
      vi.stubEnv("DATABASE_URL", viaProxy.toString());
      let proxy = await startProxy(port, target.hostname, Number(target.port || 5432));
      const s = await store();
      expect((await s.listCrew()).map((c) => c.id)).toEqual(["cdr", "plt", "eva"]); // start-up done

      await proxy.close();
      const [b] = await s.addReadings([reading({ crewId: "eva", indicator: "spo2", value: 96, unit: "%", takenAt: "2026-11-14T11:00:00.000Z" })]);
      const ids = (rs: Reading[]) => rs.map((r) => r.id.slice(-3));
      expect(ids(await s.listReadings())).toEqual(["101", "102", "103", b.id.slice(-3)]);
      expect(ids(await s.listReadings({ crewId: "eva" }))).toEqual(["103", b.id.slice(-3)]);
      expect(ids(await s.listReadings({ crewId: "cdr", indicator: "heartRate" }))).toEqual(["101"]);
      expect(ids(await s.listReadings({ since: "2026-11-13T08:30:00.000Z", limit: 2 }))).toEqual(["103", b.id.slice(-3)]);
      // The crew list stays the database's, not the JSON store's default crew.
      expect((await s.listCrew()).map((c) => c.id)).toEqual(["cdr", "plt", "eva"]);
      expect(await s.getCrew("eva")).toMatchObject({ name: "EVA Specialist" });

      proxy = await startProxy(port, target.hostname, Number(target.port || 5432));
      try {
        vi.setSystemTime(new Date("2026-11-14T12:00:16Z"));
        expect(ids(await s.listReadings({ since: "2026-11-01T00:00:00.000Z" }))).toEqual(["101", "102", "103", b.id.slice(-3)]);
        expect(await fs.readdir(dir)).not.toContain("demify-db.json");
      } finally {
        await (await db()).closePool();
        await proxy.close();
      }
    });
  });

  describe("text PostgreSQL cannot store (NUL, unpaired surrogates)", () => {
    it("stores such a reading cleaned instead of spooling it; the database stays in use", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const s = await store();
      const created = await s.addReadings([
        reading({ note: "bad\u0000note", takenAt: "2026-11-14T10:00:00.000Z" }),
        reading({ note: "half \ud83d pair", takenAt: "2026-11-14T10:01:00.000Z" }),
        reading({ note: "whole \ud83d\ude80 pair", takenAt: "2026-11-14T10:02:00.000Z" }),
      ]);
      expect(await fs.readdir(dir)).toEqual([]); // nothing spooled
      expect(await query("SELECT note FROM readings ORDER BY taken_at")).toEqual([
        { note: "badnote" },
        { note: "half \ufffd pair" },
        { note: "whole \ud83d\ude80 pair" },
      ]);
      expect((await s.listReadings()).map((r) => r.id)).toEqual(created.map((r) => r.id));
      await s.addReadings([reading({ value: 70 })]);
      expect(await query("SELECT count(*)::int AS n FROM readings")).toEqual([{ n: 4 }]);
      expect(warn.mock.calls.flat().join("\n")).not.toMatch(/PostgreSQL could not|unreachable|start-up failed/);
    });

    it("imports a spool or legacy file holding such text (cleaned) and renames it", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const file = {
        crew: [{ id: "cdr", name: "Com\u0000mander", role: "Commander", baseline: { heartRate: 62 } }],
        readings: [
          { id: "c0ffee00-0000-4000-8000-000000000201", crewId: "cdr", indicator: "heartRate", value: 61, unit: "bpm", takenAt: "2026-11-14T08:00:00.000Z", source: "manual", note: "bad\u0000note" },
          { id: "c0ffee00-0000-4000-8000-000000000202", crewId: "cdr", indicator: "heartRate", value: 62, unit: "bpm", takenAt: "2026-11-14T09:00:00.000Z", source: "manual", note: "\udc00x" },
        ],
      };
      await fs.writeFile(dbPath(), JSON.stringify(file));
      const s = await store();
      expect((await s.listReadings()).map((r) => r.note)).toEqual(["badnote", "\ufffdx"]);
      expect((await s.getCrew("cdr"))?.name).toBe("Commander");
      const files = await fs.readdir(dir);
      expect(files).not.toContain("demify-db.json");
      expect(files.filter((f) => f.startsWith("demify-db.json.rejected-"))).toEqual([]);
    });

    it("a row the database still refuses goes to a .rejected file and never blocks the replay", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      // Stand-in for any row PostgreSQL refuses with a data error (SQLSTATE class 22).
      const original = pg.Client.prototype.query;
      vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: unknown[]) {
        const [text, params] = args;
        if (typeof text === "string" && text.includes("INSERT INTO readings") && JSON.stringify(params ?? []).includes("poison")) {
          return Promise.reject(Object.assign(new Error("simulated data error"), { code: "22003" }));
        }
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as never);
      const row = (n: number, note?: string) => ({
        id: `c0ffee00-0000-4000-8000-00000000030${n}`,
        crewId: "cdr",
        indicator: "heartRate",
        value: 60 + n,
        unit: "bpm",
        takenAt: `2026-11-14T0${n}:00:00.000Z`,
        source: "sensor",
        ...(note ? { note } : {}),
      });
      const file = { crew: [{ id: "cdr", name: "Commander", role: "Commander", baseline: {} }], readings: [row(1), row(2, "poison"), row(3)] };
      await fs.writeFile(dbPath(), JSON.stringify(file));

      const s = await store();
      expect((await s.listReadings()).map((r) => r.value)).toEqual([61, 63]);
      const files = await fs.readdir(dir);
      expect(files).not.toContain("demify-db.json");
      const rejected = files.find((f) => f.startsWith("demify-db.json.rejected-"));
      const saved = JSON.parse(await fs.readFile(path.join(dir, rejected!), "utf8"));
      expect(saved.readings).toEqual([row(2, "poison")]);
      expect(saved.reasons).toEqual([
        { kind: "reading", id: row(2).id, reason: "rejected by the database (simulated data error)" },
      ]);
      expect(log.mock.calls.flat().join("\n")).toMatch(
        /2 readings added, 0 already there, 0 skipped .*, 1 rejected by the database, 1 crew members added\. .*Rows not imported were saved to demify-db\.json\.rejected-/,
      );
      // The database stays in use: the next write is stored there, nothing is spooled.
      await s.addReadings([reading({ value: 70 })]);
      expect(await query("SELECT count(*)::int AS n FROM readings")).toEqual([{ n: 3 }]);
      expect(await fs.readdir(dir)).not.toContain("demify-db.json");
      expect(warn.mock.calls.flat().join("\n")).not.toMatch(/start-up failed|unreachable/);
    });
  });
});

describe("onboard/db.mjs pool settings (no database needed)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await (await db()).closePool();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sets a client-side query timeout and TCP keep-alive", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://demify:x@127.0.0.1:1/demify");
    const { getPool, QUERY_TIMEOUT_MS } = await db();
    const pool = getPool() as unknown as { options: Record<string, unknown> };
    expect(QUERY_TIMEOUT_MS).toBe(10_000);
    expect(pool.options).toMatchObject({ query_timeout: 10_000, keepAlive: true, connectionTimeoutMillis: 3000 });
  });

  it("warns about an invalid DEMIFY_* value once, not on every database operation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://demify:x@127.0.0.1:1/demify");
    vi.stubEnv("DEMIFY_EMBED_DIM", "not-a-number");
    const { databaseUrl, getPool } = await db();
    for (let i = 0; i < 5; i++) {
      expect(databaseUrl()).toBe("postgres://demify:x@127.0.0.1:1/demify");
      getPool();
    }
    expect(warn.mock.calls.filter((c) => /Ignoring invalid DEMIFY_EMBED_DIM/.test(String(c[0])))).toHaveLength(1);
    // A changed value is read (and warned about) again.
    vi.stubEnv("DEMIFY_EMBED_DIM", "also-bad");
    databaseUrl();
    expect(warn.mock.calls.filter((c) => /Ignoring invalid DEMIFY_EMBED_DIM/.test(String(c[0])))).toHaveLength(2);
  });

  it("logs lost pool connections at most once a minute, with a count of the rest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    (globalThis as { __demifyPgErrorLog?: unknown }).__demifyPgErrorLog = undefined;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://demify:x@127.0.0.1:1/demify");
    const pool = (await db()).getPool();
    for (let i = 0; i < 4; i++) pool.emit("error", new Error("terminating connection due to administrator command"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/PostgreSQL connection lost: terminating connection/);
    vi.advanceTimersByTime(60_000);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1][0])).toMatch(/3 more pool connection error\(s\) in the last minute/);
    vi.advanceTimersByTime(120_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("JSON store: imported-file housekeeping (no database)", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-readings-prune-"));
    vi.stubEnv("DEMIFY_DATA_DIR", dir);
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps only the 5 newest demify-db.json.imported-* files; rejected-* and other files stay", async () => {
    const old = [1, 2, 3, 4, 5, 6, 7].map((d) => `demify-db.json.imported-2026-11-0${d}T10-00-00-000Z`);
    for (const name of old) await fs.writeFile(path.join(dir, name), "{}");
    await fs.writeFile(path.join(dir, "demify-db.json.rejected-2026-11-01T10-00-00-000Z"), "{}");
    await fs.writeFile(path.join(dir, "demify-db.json.imported-notes.txt"), "keep me");
    await fs.writeFile(dbPath(), JSON.stringify({ crew: [], readings: [] }));
    const j = await import("@/lib/store/readings-json");
    const done = await j.drainJsonStore(async () => "imported");
    expect(done?.result).toBe("imported");
    const files = (await fs.readdir(dir)).sort();
    expect(files.filter((f) => /^demify-db\.json\.imported-\d/.test(f))).toEqual(
      [...old.slice(3), path.basename(done!.renamedTo)].sort(),
    );
    expect(files).toContain("demify-db.json.rejected-2026-11-01T10-00-00-000Z");
    expect(files).toContain("demify-db.json.imported-notes.txt");
    expect(j.KEEP_IMPORTED_FILES).toBe(5);
  });
});

describe("JSON store shared by Next.js module copies (no database)", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-readings-copies-"));
    vi.stubEnv("DEMIFY_DATA_DIR", dir);
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("a write through one copy is seen by, and never overwritten by, the other", async () => {
    // Next.js bundles server modules once for route handlers and once for pages.
    const pages = await store();
    expect(await pages.listReadings()).toEqual([]); // this copy has the file in memory now
    vi.resetModules();
    const routes = await store();
    expect(routes).not.toBe(pages);
    const [a] = await routes.addReadings([reading({ value: 70 })]);
    expect((await pages.listReadings()).map((r) => r.id)).toEqual([a.id]);
    const [b] = await pages.addReadings([reading({ value: 71 })]);
    const onDisk = JSON.parse(await fs.readFile(dbPath(), "utf8"));
    expect(onDisk.readings.map((r: Reading) => r.id)).toEqual([a.id, b.id]);
  });
});

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A TCP forwarder standing in for the network path to the database. */
async function startProxy(port: number, host: string, targetPort: number): Promise<{ close(): Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, host);
    sockets.add(client);
    sockets.add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on("error", drop).on("close", drop);
    upstream.on("error", drop).on("close", drop);
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
