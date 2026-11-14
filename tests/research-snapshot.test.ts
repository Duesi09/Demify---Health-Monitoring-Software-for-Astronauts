import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// /research must branch on "data", not on "error": a snapshot fallback carries both (the fetch failed, the bundled
// copy was served) and has to render its data with the SNAPSHOT label, exactly like /radiation.

function seed<T>(key: string): { fetchedAt: string; data: T } {
  return JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../data/snapshots", `${key}.json`), "utf8"));
}

const state: { mode: "snapshot" | "failed" } = { mode: "snapshot" };
const ERR = "ground link down (simulated blackout)";

function fallback<T>(key: string, source: string) {
  if (state.mode === "failed") throw new Error("no copy available");
  const s = seed<T>(key);
  return { data: s.data, source, freshness: "snapshot" as const, fetchedAt: s.fetchedAt, error: ERR };
}

vi.mock("@/lib/sources/eda", async (orig) => ({
  ...(await orig<typeof import("@/lib/sources/eda")>()),
  getIssDoseReference: async () => fallback("eda-iss-dose", "NASA EDA"),
}));
vi.mock("@/lib/sources/osdr", async (orig) => ({
  ...(await orig<typeof import("@/lib/sources/osdr")>()),
  getMissionStudies: async () => fallback("osdr-mission-i4", "NASA OSDR mission registry"),
  getInspiration4: async () => ({ panels: [], errors: [] }),
  searchStudies: async () => {
    throw new Error("offline");
  },
}));

const { default: ResearchPage } = await import("@/app/research/page");

async function render() {
  const html = renderToStaticMarkup(await ResearchPage());
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
}

describe("/research snapshot fallback", () => {
  it("renders dose and mission data with the SNAPSHOT label when the fetch failed but a snapshot exists", async () => {
    state.mode = "snapshot";
    const text = await render();
    const doseDate = seed("eda-iss-dose").fetchedAt.slice(0, 10);
    const missionDate = seed("osdr-mission-i4").fetchedAt.slice(0, 10);
    expect(text).not.toContain("Dosimetry unavailable");
    expect(text).not.toContain("Mission registry unavailable");
    expect(text).toContain("Mean dose rate");
    expect(text).toContain("OSD-569");
    expect(text).toContain(`SNAPSHOT ${doseDate}`);
    expect(text).toContain(`SNAPSHOT ${missionDate}`);
    expect(text).not.toMatch(/\bREAL\b · fetched/);
  });

  it("still shows the unavailable message when there is no data at all", async () => {
    state.mode = "failed";
    const text = await render();
    expect(text).toContain("Dosimetry unavailable: no copy available");
    expect(text).toContain("Mission registry unavailable: no copy available");
    expect(text).not.toContain("Mean dose rate");
  });
});
