import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * Pitch demo: with the healthy crew (DEMIFY_HEALTHY_CREW, on by default in the
 * app, off in the other tests) every simulated crew member is nominal and
 * raises no monitor alarm, at any time of day, sleep and workout included.
 */

const SIMULATED = ["cdr", "plt", "ms1", "ms2"];

describe("healthy crew mode", () => {
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("all simulated crew members are nominal with no alarms, every 2 h over 3 days", async () => {
    vi.stubEnv("DEMIFY_HEALTHY_CREW", "true");
    vi.resetModules();
    const { assessAllCrew } = await import("@/lib/health/assess");
    const { getAllLiveVitals } = await import("@/lib/monitor/live");
    const { config } = await import("@/lib/config");
    expect(config.healthyCrew).toBe(true);

    vi.useFakeTimers({ toFake: ["Date"] });
    const problems: string[] = [];
    const start = Date.parse("2026-11-15T00:30:00.000Z");
    for (let t = start; t < start + 3 * 86_400_000; t += 2 * 3_600_000) {
      vi.setSystemTime(t);
      const all = await assessAllCrew();
      for (const a of all.filter((x) => SIMULATED.includes(x.crew.id))) {
        if (a.overall !== "nominal") {
          const bad = a.assessments.filter((i) => i.status !== "nominal" && i.status !== "unknown");
          problems.push(`${new Date(t).toISOString()} ${a.crew.id} ${a.overall}: ${bad.map((i) => `${i.indicator}=${i.value}`).join(", ")}`);
        }
      }
      for (const v of (await getAllLiveVitals(t)).filter((x) => SIMULATED.includes(x.crewId))) {
        for (const al of v.alarms) problems.push(`${new Date(t).toISOString()} ${v.crewId} alarm ${al.text} (${v.activity})`);
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);
});
