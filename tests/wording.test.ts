import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISCLAIMER_LONG, DISCLAIMER_SHORT, INTENDED_PURPOSE } from "@/lib/disclaimer";
import { Provenance, provenanceLabel } from "@/components/ui";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

/**
 * Phrases that must not appear anywhere in the app. Under EU MDR Rule 11 /
 * Swiss MedDO software that rates vitals and says when to call a doctor is
 * medical device software, and these phrases describe exactly that. Use the
 * constants in src/lib/disclaimer.ts and training framing instead.
 */
const FORBIDDEN = [/not a medical device/i, /decision[\s-]+support/i];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("wording guard: src/ never uses medical-device trigger phrases", () => {
  it("no file under src/ contains them", () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      if (/\.(png|jpe?g|gif|ico|webp|woff2?)$/i.test(file)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN.some((re) => re.test(line))) hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits, `Use DISCLAIMER_SHORT / DISCLAIMER_LONG or training framing instead:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("disclaimer constants", () => {
  it("match the agreed texts exactly", () => {
    expect(DISCLAIMER_SHORT).toBe("Research prototype, not a certified medical device.");
    expect(DISCLAIMER_LONG).toBe(
      "Research prototype – not a certified medical device. Not for diagnosis, treatment or emergency decisions. Vital signs are simulated unless labelled REAL or DEVICE. Thresholds come from NASA standards, clinical guidelines or our own project rules, and each carries its source tag. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service.",
    );
    expect(INTENDED_PURPOSE).toMatch(/^Demify is open-source research and training software for analog and simulated space missions\./);
    expect(INTENDED_PURPOSE).toMatch(/It must not be used for the medical care of any individual\.$/);
  });

  it("are shown in the site footer and on /help", () => {
    const layout = readFileSync(path.join(SRC, "app/layout.tsx"), "utf8");
    expect(layout).toContain("DISCLAIMER_LONG");
    expect(layout).toContain("ATTRIBUTION");
    const help = readFileSync(path.join(SRC, "app/help/page.tsx"), "utf8");
    expect(help).toContain("INTENDED_PURPOSE");
    expect(help).toContain('title="About Demify"');
  });
});

describe("data labels (REAL / SNAPSHOT <date>)", () => {
  const at = "2026-11-14T09:06:18.482Z";

  it("labels a live fetch and an in-memory copy of it REAL, with the fetch time", () => {
    expect(provenanceLabel({ freshness: "live", fetchedAt: at })).toEqual({ label: "REAL", real: true, time: "2026-11-14 09:06 UTC" });
    expect(provenanceLabel({ freshness: "cache", fetchedAt: at })).toMatchObject({ label: "REAL", real: true });
  });

  it("labels the offline copy SNAPSHOT <date> and never calls it live", () => {
    expect(provenanceLabel({ freshness: "snapshot", fetchedAt: at })).toMatchObject({ label: "SNAPSHOT 2026-11-14", real: false });
    const html = renderToStaticMarkup(
      createElement(Provenance, { result: { source: "NOAA SWPC", freshness: "snapshot", fetchedAt: at, error: "offline mode" } }),
    );
    expect(html).toContain("SNAPSHOT 2026-11-14");
    expect(html.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("shows REAL with its fetch time", () => {
    const html = renderToStaticMarkup(createElement(Provenance, { result: { source: "NASA OSDR", freshness: "live", fetchedAt: at } }));
    expect(html).toContain("REAL");
    expect(html).toContain("fetched 2026-11-14 09:06 UTC");
  });
});

describe("radiation and open-data wording", () => {
  const radiation = readFileSync(path.join(SRC, "app/radiation/page.tsx"), "utf8");
  const research = readFileSync(path.join(SRC, "app/research/page.tsx"), "utf8");

  it("cites NASA-STD-3001 Vol. 1 Rev C and tags the dose-rate estimate as illustrative", () => {
    expect(radiation).toContain("NASA-STD-3001 Vol. 1 Rev C");
    expect(radiation).not.toMatch(/Rev\.? B\b/);
    expect(radiation).toContain("App (illustrative)");
    expect(radiation).toContain("not a measurement at your location");
  });

  it("never converts absorbed dose (mGy) to mSv with a quality factor", () => {
    for (const src of [radiation, research]) {
      expect(src).not.toMatch(/Q\s*≈|quality factor/i);
      expect(src).not.toMatch(/meanTotal \* 2/);
    }
  });

  it("names the open-data page after its source", () => {
    const nav = readFileSync(path.join(SRC, "components/app-nav.tsx"), "utf8");
    expect(nav).toContain('label: "Open data (NASA OSDR)"');
    expect(research).toContain('title="Open data (NASA OSDR)"');
  });
});

/* ------------------------------------------------------------------------- */
/* GET /api/osdr/search without a connection                                  */
/* ------------------------------------------------------------------------- */

let runtimeDir: string;
let seedDir: string;

function writeSnap(key: string, query: string, accessions: string[]) {
  mkdirSync(seedDir, { recursive: true });
  const hits = accessions.map((accession) => ({ accession, title: `Study ${accession}`, organism: "Homo sapiens", mission: null, flightProgram: null, spaceProgram: null, projectType: null, measurement: [], technology: [], material: null, releaseDate: null, description: "", url: `https://osdr.nasa.gov/bio/repo/data/studies/${accession}` }));
  writeFileSync(
    path.join(seedDir, `${key}.json`),
    JSON.stringify({ fetchedAt: "2026-11-14T09:06:18.482Z", data: { query, total: hits.length, from: 0, hits } }),
  );
}

async function search(q: string) {
  const { GET } = await import("@/app/api/osdr/search/route");
  const res = await GET(new Request(`http://localhost/api/osdr/search?q=${encodeURIComponent(q)}&size=10&from=0`));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/osdr/search offline (P0.10)", () => {
  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), "demify-search-"));
    runtimeDir = path.join(root, "runtime");
    seedDir = path.join(root, "seed");
    process.env.DEMIFY_SNAPSHOT_DIR = runtimeDir;
    process.env.DEMIFY_SNAPSHOT_SEED_DIR = seedDir;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DEMIFY_OFFLINE;
    delete process.env.DEMIFY_SNAPSHOT_DIR;
    delete process.env.DEMIFY_SNAPSHOT_SEED_DIR;
  });

  it("offline mode: any other query returns 200 with the cached default list, not a 502", async () => {
    process.env.DEMIFY_OFFLINE = "true";
    writeSnap("osdr-search-default", "human health", ["OSD-1", "OSD-2"]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { status, body } = await search("astronaut sleep");
    expect(status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(body.offline).toEqual({
      reason: "offline-mode",
      requested: "astronaut sleep",
      message: "Search needs a connection; showing the cached default list",
    });
    expect(body.query).toBe("human health");
    expect(body.hits.map((h: { accession: string }) => h.accession)).toEqual(["OSD-1", "OSD-2"]);
    expect(body.provenance.freshness).toBe("snapshot");
  });

  it("offline mode: a seeded example query answers from its own snapshot", async () => {
    process.env.DEMIFY_OFFLINE = "true";
    writeSnap("osdr-search-default", "human health", ["OSD-1"]);
    writeSnap("osdr-search-bone-loss", "bone loss", ["OSD-342"]);
    const { status, body } = await search("Bone loss");
    expect(status).toBe(200);
    expect(body.offline).toBeUndefined();
    expect(body.hits[0].accession).toBe("OSD-342");
    expect(body.provenance.freshness).toBe("snapshot");
  });

  it("OSDR unreachable: falls back to the default list and says so", async () => {
    writeSnap("osdr-search-default", "human health", ["OSD-1"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND osdr.nasa.gov");
      }),
    );
    const { status, body } = await search("muscle atrophy");
    expect(status).toBe(200);
    expect(body.offline).toMatchObject({ reason: "unreachable", requested: "muscle atrophy" });
    expect(body.hits[0].accession).toBe("OSD-1");
  });

  it("OSDR answering with an HTTP error: says OSDR did not answer, and backs off before the next try", async () => {
    writeSnap("osdr-search-default", "human health", ["OSD-1"]);
    const fetchSpy = vi.fn<(url: string | URL | Request) => Promise<Response>>(
      async () => new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { status, body } = await search("muscle atrophy");
    expect(status).toBe(200);
    expect(body.offline).toEqual({
      reason: "osdr-error",
      requested: "muscle atrophy",
      message: "OSDR did not answer; showing the cached default list",
    });
    expect(body.hits[0].accession).toBe("OSD-1");
    const calls = fetchSpy.mock.calls.length;
    const again = await search("muscle atrophy");
    expect(again.body.offline).toMatchObject({ reason: "osdr-error" });
    // The failed query is not retried live within the backoff window.
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("term=muscle%20atrophy"))).toBe(true);
    expect(fetchSpy.mock.calls.slice(calls).some(([u]) => String(u).includes("term=muscle%20atrophy"))).toBe(false);
  });

  it("answers 503 with a friendly message only when no list is cached at all", async () => {
    process.env.DEMIFY_OFFLINE = "true";
    const { status, body } = await search("astronaut sleep");
    expect(status).toBe(503);
    expect(body.offline).toBe(true);
    expect(body.reason).toBe("offline-mode");
    expect(body.error).toMatch(/needs a connection/);
    expect(body.error).not.toMatch(/\.$/);
  });

  it("ships seed snapshots for the default list and the example queries", async () => {
    const { SEEDED_SEARCHES, seededSearchKey } = await import("@/lib/sources/osdr");
    for (const q of ["human health", ...SEEDED_SEARCHES]) {
      const key = seededSearchKey(q);
      expect(key).not.toBeNull();
      const snap = JSON.parse(readFileSync(path.join(ROOT, "data/snapshots", `${key}.json`), "utf8"));
      expect(snap.data.hits.length).toBeGreaterThan(0);
    }
  });
});
