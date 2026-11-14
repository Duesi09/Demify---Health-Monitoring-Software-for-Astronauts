import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IndicatorId } from "@/lib/types";

/**
 * P1.0 pitch-time check: what the app shows at the live pitch
 * (Sun 15 Nov 2026, about 15:00 UTC; this test uses 15:30Z) on a fresh data
 * directory: only SIMULATED telemetry, no crew entries, no drill, no solar
 * radiation storm (space weather offline). Everything here is deterministic,
 * so the list of escalating crew members is pinned below.
 */

const PITCH = new Date("2026-11-15T15:30:00Z");

// Isolated, empty data directory (no crew entries, no drills from the dev DB).
const dataDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  return mkdtempSync(path.join(tmpdir(), "demify-pitch-"));
});

vi.mock("@/lib/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/config")>();
  return {
    ...actual,
    config: { ...actual.config, dataDir, simulateTelemetry: true, offline: true },
    currentMission: () => actual.MISSION_PROFILES.iss,
  };
});

// Quiet sun: no NOAA data, so no storm escalation (a real S1+ storm on the day
// would add a radiation escalation for every crew member).
vi.mock("@/lib/sources/swpc", async (orig) => {
  const actual = await orig<typeof import("@/lib/sources/swpc")>();
  return {
    ...actual,
    getSpaceWeather: async () => {
      throw new Error("offline");
    },
  };
});

const { assessAllCrew, persistenceFlag, readingsFor } = await import("@/lib/health/assess");
const { INDICATORS, evaluateValue, needsEscalation, persistenceLabel } = await import("@/lib/health/knowledge");
const { simulateSeries } = await import("@/lib/sources/simulator");
const { startScenario, stopScenario } = await import("@/lib/store/scenarios");
const { listCrew } = await import("@/lib/store/readings");
const { EscalationBanner, escalationItems } = await import("@/components/overview/escalation-banner");

type All = Awaited<ReturnType<typeof assessAllCrew>>;

const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Crew member -> indicators that meet an escalation rule. */
function escalating(all: All): Record<string, IndicatorId[]> {
  return Object.fromEntries(
    all.filter((a) => a.escalations.length).map((a) => [a.crew.id, a.escalations.map((e) => e.indicator).sort()]),
  );
}

let all: All;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PITCH);
  all = await assessAllCrew();
  console.log(
    `[pitch-time] ${PITCH.toISOString()} escalating crew:`,
    JSON.stringify(escalating(all)),
    "\n" +
      all
        .flatMap((a) =>
          a.assessments
            .filter((x) => x.status === "caution" || x.status === "critical")
            .map((x) => `  ${a.crew.id} ${x.indicator} ${x.status}${x.escalate ? " ESCALATE" : ""}: ${x.finding}`),
        )
        .join("\n"),
  );
});

afterAll(async () => {
  await stopScenario();
  vi.useRealTimers();
  const { rmSync } = await import("node:fs");
  rmSync(dataDir, { recursive: true, force: true });
});

describe("P1.0 pitch time (2026-11-15 15:30Z, fresh data, quiet sun)", () => {
  it("assesses the four default crew members", () => {
    expect(all.map((a) => a.crew.id)).toEqual(["cdr", "plt", "ms1", "ms2"]);
  });

  it("pins which crew members escalate", () => {
    expect(escalating(all)).toMatchInlineSnapshot(`
      {
        "cdr": [
          "visionChange",
        ],
      }
    `);
  });

  it("at least one crew member escalates without a drill (cdr, vision change on SIMULATED data)", () => {
    const items = escalationItems(all);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const cdr = all.find((a) => a.crew.id === "cdr")!;
    const vision = cdr.escalations.find((e) => e.indicator === "visionChange")!;
    expect(vision.drill).toBeUndefined();
    expect(cdr.sources.visionChange).toBe("simulated");
    expect(vision.finding).toBe("Vision 1 /3: contact the flight surgeon.");
  });

  it("the escalation list is stable across the pitch window (14:30Z to 16:30Z, every 10 min)", async () => {
    const seen = new Set<string>();
    for (let t = Date.parse("2026-11-15T14:30:00Z"); t <= Date.parse("2026-11-15T16:30:00Z"); t += 10 * 60_000) {
      vi.setSystemTime(t);
      seen.add(JSON.stringify(escalating(await assessAllCrew())));
    }
    vi.setSystemTime(PITCH);
    expect([...seen]).toEqual([JSON.stringify(escalating(all))]);
  });

  it("no finding says 'contact the flight surgeon' unless an escalation rule applies", async () => {
    vi.setSystemTime(PITCH);
    for (const a of all) {
      // The same readings the assessment used (no space weather, so no storm rule).
      const rs = await readingsFor(a.crew, 24 * 7);
      for (const x of a.assessments) {
        const where = `${a.crew.id}/${x.indicator}: ${x.finding}`;
        const says = /contact the flight surgeon/i.test(x.finding);
        expect(says, where).toBe(x.escalate);
        if (x.value == null || x.takenAt == null) continue;
        const source = a.sources[x.indicator];
        const persist = source ? persistenceFlag(x.indicator, { value: x.value, takenAt: x.takenAt, source }, rs, PITCH.getTime()) : null;
        const single = needsEscalation(x.indicator, x.value);
        // The rule that applies: a single-value rule, or a persistence rule
        // that is actually met on the history. A run still in progress
        // ("... so far; repeated values escalate") must never count as met.
        expect(single || persist?.met === true, where).toBe(x.escalate);
        if (x.escalate && !single) expect(x.finding, where).toContain(persistenceLabel(INDICATORS[x.indicator])!);
        if (persist && !persist.met && !single) expect(x.finding, where).not.toMatch(/contact the flight surgeon/);
      }
    }
  });

  it("a short sleep run (ms2) does not escalate before 7 nights", () => {
    const sleep = all.find((a) => a.crew.id === "ms2")!.assessments.find((x) => x.indicator === "sleepHours")!;
    expect(sleep.value).toBeLessThan(6);
    expect(sleep.escalate).toBe(false);
    expect(sleep.finding).toMatch(/repeated values escalate \(< 6 h on 7 days in a row\)/);
    expect(sleep.finding).not.toMatch(/contact the flight surgeon/);
  });

  it("the banner count matches the crew members that escalate", () => {
    const items = escalationItems(all);
    const n = Object.keys(escalating(all)).length;
    expect(items).toHaveLength(n);
    const html = renderToStaticMarkup(createElement(EscalationBanner, { items, commDelaySeconds: 0.5 }));
    if (n === 0) {
      expect(html).toBe("");
      return;
    }
    const t = text(html);
    expect(t).toContain(`${n} crew member${n > 1 ? "s" : ""}`);
    for (const it of items) expect(t).toContain(it.crewName);
    // Fresh data is all SIMULATED: the banner is framed as training.
    expect(t).toContain("Training: in a real mission this prompts a call to the flight surgeon");
  });

  it("simulated temperature does not flicker between consecutive 10-min samples around 15:30Z", async () => {
    const from = Date.parse("2026-11-15T14:00:00Z");
    const to = Date.parse("2026-11-15T17:00:00Z");
    for (const crew of await listCrew()) {
      const temps = simulateSeries(crew, from, to).filter((r) => r.indicator === "bodyTemp");
      expect(temps.length).toBe(19);
      const statuses = temps.map((r) => evaluateValue("bodyTemp", r.value, crew.baseline.bodyTemp).status);
      const flips = statuses.filter((s, i) => i > 0 && s !== statuses[i - 1]).length;
      expect(flips, `${crew.id}: ${temps.map((r, i) => `${r.takenAt.slice(11, 16)} ${r.value} ${statuses[i]}`).join(", ")}`).toBe(0);
    }
  });

  it("a STEMI drill on cdr escalates through the ST segment and is tagged as a drill", async () => {
    await startScenario("cdr", "stemi", PITCH.getTime() - 2 * 60_000);
    try {
      const withDrill = await assessAllCrew();
      const cdr = withDrill.find((a) => a.crew.id === "cdr")!;
      const st = cdr.escalations.find((e) => e.indicator === "stDeviation");
      expect(st, JSON.stringify(cdr.escalations.map((e) => e.finding))).toBeDefined();
      expect(st!.drill).toBe(true);
      expect(st!.value!).toBeGreaterThanOrEqual(1);
      expect(cdr.scenario?.type).toBe("stemi");
      const items = escalationItems(withDrill);
      expect(items.find((i) => i.crewId === "cdr")?.findings.some((f) => f.indicator === "stDeviation" && f.drill)).toBe(true);
    } finally {
      await stopScenario("cdr");
    }
    const after = await assessAllCrew();
    expect(after.find((a) => a.crew.id === "cdr")!.scenario).toBeNull();
  });
});
