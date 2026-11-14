import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config reads the environment at import time, so each test re-imports the
// modules. The in-memory cache, failure and in-flight maps are process-wide
// per snapshot directory pair, so a fresh pair of directories per test gives
// each test a fresh cache. DEMIFY_DATA_DIR is a fresh directory too, so a
// developer's data/ground-link.json (switch down) cannot leak into these
// tests, and DATABASE_URL is cleared so the switch is never read from a
// developer's database.
let root: string;
let runtimeDir: string;
let seedDir: string;

function writeSnap(dir: string, key: string, fetchedAt: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ fetchedAt, data }));
}

async function loadCache() {
  return import("@/lib/sources/cache");
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "demify-cache-"));
  runtimeDir = path.join(root, "runtime");
  seedDir = path.join(root, "seed");
  vi.stubEnv("DEMIFY_SNAPSHOT_DIR", runtimeDir);
  vi.stubEnv("DEMIFY_SNAPSHOT_SEED_DIR", seedDir);
  vi.stubEnv("DEMIFY_DATA_DIR", path.join(root, "data"));
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMIFY_OFFLINE", "");
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // Best effort: a snapshot refresh may still be writing in the background.
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* left in the OS temp dir */
  }
});

describe("test isolation", () => {
  it("never reads the repository's ground link file", async () => {
    const { getGroundLink } = await import("@/lib/onboard/ground-link");
    expect(await getGroundLink()).toMatchObject({ up: true, backend: "file", changedAt: new Date(0).toISOString() });
  });
});

describe("cached(): failure backoff (#9)", () => {
  it("does not retry the live fetch inside the backoff window, then retries", async () => {
    const { cached } = await loadCache();
    writeSnap(seedDir, "k", "2026-01-01T00:00:00.000Z", { v: "seed" });
    const loader = vi.fn(async () => {
      throw new Error("timed out");
    });

    const a = await cached("k", "src", loader, 300);
    expect(a).toMatchObject({ freshness: "snapshot", data: { v: "seed" }, error: "timed out" });
    expect(loader).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    const b = await cached("k", "src", loader, 300);
    expect(b).toMatchObject({ freshness: "snapshot", data: { v: "seed" }, error: "timed out" });
    expect(loader).toHaveBeenCalledTimes(1);

    // Backoff is min(ttl, 60 s).
    vi.advanceTimersByTime(31_000);
    loader.mockResolvedValueOnce({ v: "live" } as never);
    const c = await cached("k", "src", loader, 300);
    expect(c).toMatchObject({ freshness: "live", data: { v: "live" } });
    expect(c.error).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("caps the backoff at the TTL for short-lived sources", async () => {
    const { cached } = await loadCache();
    writeSnap(seedDir, "short", "2026-01-01T00:00:00.000Z", 1);
    const loader = vi.fn(async (): Promise<number> => {
      throw new Error("down");
    });
    await cached("short", "src", loader, 10);
    vi.advanceTimersByTime(9_000);
    await cached("short", "src", loader, 10);
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await cached("short", "src", loader, 10);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("serves stale memory (not the older snapshot) during the backoff", async () => {
    const { cached } = await loadCache();
    writeSnap(seedDir, "s", "2026-01-01T00:00:00.000Z", "seed");
    const loader = vi.fn(async () => "fresh");
    expect((await cached("s", "src", loader, 60)).freshness).toBe("live");

    vi.advanceTimersByTime(61_000); // memory now stale
    loader.mockRejectedValue(new Error("link down"));
    const a = await cached("s", "src", loader, 60);
    expect(a).toMatchObject({ freshness: "cache", data: "fresh", error: "link down" });
    const b = await cached("s", "src", loader, 60);
    expect(b).toMatchObject({ freshness: "cache", data: "fresh", error: "link down" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("still throws when there is no fallback at all", async () => {
    const { cached } = await loadCache();
    const loader = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(cached("none", "src", loader)).rejects.toThrow("No data for none: nope");
    await expect(cached("none", "src", loader)).rejects.toThrow("No data for none: nope");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("cached(): in-flight dedupe (#9)", () => {
  it("concurrent callers share one live load", async () => {
    const { cached } = await loadCache();
    let release!: (v: { n: number }) => void;
    const loader = vi.fn(() => new Promise<{ n: number }>((r) => (release = r)));
    const p = Promise.all([cached("d", "src", loader), cached("d", "src", loader), cached("d", "src", loader)]);
    await Promise.resolve();
    release({ n: 1 });
    const results = await p;
    expect(loader).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toMatchObject({ freshness: "live", data: { n: 1 } });
    // Distinct result objects per caller.
    expect(results[0]).not.toBe(results[1]);
  });

  it("concurrent callers share one failed load and its fallback", async () => {
    const { cached } = await loadCache();
    writeSnap(seedDir, "f", "2026-01-01T00:00:00.000Z", "seed");
    let fail!: (e: Error) => void;
    const loader = vi.fn(() => new Promise<string>((_, rej) => (fail = rej)));
    const p = Promise.all([cached("f", "src", loader), cached("f", "src", loader)]);
    await Promise.resolve();
    fail(new Error("timeout"));
    const results = await p;
    expect(loader).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toMatchObject({ freshness: "snapshot", data: "seed", error: "timeout" });
  });
});

describe("cached(): snapshot directories", () => {
  it("reads the newest of the refreshed and seed snapshots", async () => {
    vi.stubEnv("DEMIFY_OFFLINE", "true");
    const { cached } = await loadCache();
    writeSnap(seedDir, "n", "2026-01-01T00:00:00.000Z", "seed");
    writeSnap(runtimeDir, "n", "2026-06-01T00:00:00.000Z", "runtime");
    const loader = vi.fn(async () => "live");
    const r = await cached("n", "src", loader);
    expect(r).toMatchObject({ freshness: "snapshot", data: "runtime", error: "offline mode" });
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("EDA reference (#11)", () => {
  const MISSIONS = ["RR-1", "RR-9", "RR-6", "RR-8", "RR-12", "RR-17", "RR-19", "RR-23"];
  const seed = {
    unit: "mGy/day",
    meanTotal: 0.3,
    meanGcr: 0.2,
    meanSaa: 0.1,
    min: 0.3,
    max: 0.3,
    missions: MISSIONS.map((name) => ({ name, title: name, link: null, start: "2014-01-01", end: "2014-01-02", days: 2, meanTotal: 0.3, meanGcr: 0.2, meanSaa: 0.1, points: [] })),
    latest: null,
  };

  function stubFetch(failing: Set<string>, listFails = false) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const m = /missions\/([^/]+)\/radiation_data/.exec(url)?.[1];
        const fail = m ? failing.has(decodeURIComponent(m)) : listFails;
        if (fail) return new Response("err", { status: 503, statusText: "Service Unavailable" });
        const body = m
          ? [{ time: "2016-01-01T00:00:00", gcr: 0.2, saa: 0.1, total: 0.3, milestones: null }]
          : MISSIONS.map((name) => ({ name, title: `Rodent Research ${name}`, link: "x" }));
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
  }

  it("rejects a refresh that lost even one mission and keeps the complete snapshot", async () => {
    writeSnap(seedDir, "eda-iss-dose", "2026-01-01T00:00:00.000Z", seed);
    stubFetch(new Set(["RR-23", "RR-1", "RR-9", "RR-6"])); // exactly half fail
    const { getIssDoseReference, getMissionDose } = await import("@/lib/sources/eda");
    const r = await getIssDoseReference();
    expect(r.freshness).toBe("snapshot");
    expect(r.data.missions).toHaveLength(8);
    expect(r.error).toMatch(/only 4 of 8 missions/);
    expect(await getMissionDose("RR-23")).not.toBeNull();
  });

  it("rejects a refresh where only the mission list failed", async () => {
    writeSnap(seedDir, "eda-iss-dose", "2026-01-01T00:00:00.000Z", seed);
    stubFetch(new Set(), true);
    const { getIssDoseReference } = await import("@/lib/sources/eda");
    const r = await getIssDoseReference();
    expect(r.freshness).toBe("snapshot");
    expect(r.data.missions[0].title).toBe("RR-1");
  });

  it("accepts a complete refresh", async () => {
    writeSnap(seedDir, "eda-iss-dose", "2026-01-01T00:00:00.000Z", seed);
    stubFetch(new Set());
    const { getIssDoseReference } = await import("@/lib/sources/eda");
    const r = await getIssDoseReference();
    expect(r.freshness).toBe("live");
    expect(r.data.missions).toHaveLength(8);
    expect(r.data.missions[0].title).toBe("Rodent Research RR-1");
  });
});
