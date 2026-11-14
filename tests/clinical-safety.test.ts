import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewMember, IndicatorId, MonitorAlarm, Reading, Scenario } from "@/lib/types";

/**
 * Clinical safety rules from the pitch brief:
 *  - no drug names, doses or amounts in crew actions or protocol steps,
 *  - escalation (contact the flight surgeon) only on explicit limits,
 *    symptom-type bands or repeated values, never on a critical band alone,
 *  - NEWS2 temperature bands and AHA hypertensive-crisis limits,
 *  - finding text follows the escalation, not the band.
 */

const DAY = 86_400_000;
const H = 3_600_000;

const CREW: Record<string, CrewMember> = {
  cdr: { id: "cdr", name: "Commander", role: "Commander", baseline: { heartRate: 62, systolicBP: 118, bodyTemp: 36.7 } },
  ms2: {
    id: "ms2",
    name: "Mission Specialist 2",
    role: "Flight Engineer",
    baseline: { heartRate: 60, systolicBP: 116, diastolicBP: 74, bodyTemp: 36.7, glucose: 90, spo2: 98 },
  },
};

const state = vi.hoisted(() => ({ readings: [] as Reading[], scenario: null as Scenario | null }));

vi.mock("@/lib/store/readings", () => ({
  getCrew: async (id: string) => CREW[id] ?? null,
  listCrew: async () => Object.values(CREW),
  listReadings: async ({ crewId, since }: { crewId?: string; since?: string }) =>
    state.readings.filter((r) => (!crewId || r.crewId === crewId) && (!since || r.takenAt >= since)),
}));

vi.mock("@/lib/store/scenarios", () => ({
  getScenario: async (crewId: string) => (state.scenario?.crewId === crewId ? state.scenario : null),
}));

vi.mock("@/lib/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/config")>();
  return { ...actual, config: { ...actual.config, simulateTelemetry: false }, currentMission: () => actual.MISSION_PROFILES.iss };
});

vi.mock("@/lib/sources/swpc", async (orig) => {
  const actual = await orig<typeof import("@/lib/sources/swpc")>();
  return {
    ...actual,
    getSpaceWeather: async () => {
      throw new Error("offline");
    },
  };
});

const { assessCrewMember, currentValue } = await import("@/lib/health/assess");
const { INDICATORS, classify, evaluateValue, judgement, persistenceLabel } = await import("@/lib/health/knowledge");
const { buildProtocol } = await import("@/components/crew/protocols");
const { simulateDaily } = await import("@/lib/sources/simulator");

const FORBIDDEN = /aspirin|ibuprofen|paracetamol|acetaminophen|bisphosph|melatonin|oxygen\b|\b\d+\s?(mg|g|ml|mL)\b/i;
const ALL_IDS = Object.keys(INDICATORS) as IndicatorId[];

let seq = 0;
function reading(indicator: IndicatorId, value: number, takenAt: number, source: Reading["source"] = "manual", crewId = "cdr"): Reading {
  return { id: `c${seq++}`, crewId, indicator, value, unit: "", takenAt: new Date(takenAt).toISOString(), source };
}

/** Daily values ending today (last value = today), one per day at the same time. */
function daily(id: IndicatorId, values: number[], at = Date.now() - 60_000) {
  return values.map((v, i) => reading(id, v, at - (values.length - 1 - i) * DAY));
}

async function assessmentOf(id: IndicatorId, crewId = "cdr") {
  const a = await assessCrewMember(crewId);
  return a!.assessments.find((x) => x.indicator === id)!;
}

beforeEach(() => {
  state.readings = [];
  state.scenario = null;
});

describe("P0.2 no drug names, doses or amounts in advice", () => {
  it("crew actions name no drug and no amount", () => {
    for (const def of Object.values(INDICATORS)) {
      for (const a of def.actions) expect(a, `${def.id}: ${a}`).not.toMatch(FORBIDDEN);
    }
  });

  it("protocol steps name no drug and no amount, for every protocol id", () => {
    const opts = { commDelaySeconds: 1320, missionName: "Mars transit" };
    const alarm = (indicator: IndicatorId): MonitorAlarm => ({
      id: `cdr:${indicator}`,
      crewId: "cdr",
      crewName: "Commander",
      priority: "high",
      text: `${indicator} alarm`,
      indicator,
      drill: false,
    });
    const protocols = [
      ...(["stemi", "vf", "hypertensive-crisis", "general"] as const).map((id) => buildProtocol(id, opts)),
      ...ALL_IDS.map((id) => buildProtocol("general", { ...opts, alarm: alarm(id) })),
    ];
    for (const p of protocols) {
      for (const step of p.steps) {
        expect(step.text, `${p.id}/${step.id}`).not.toMatch(FORBIDDEN);
        if (step.detail) expect(step.detail, `${p.id}/${step.id} detail`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("the STEMI checklist defers to the onboard procedure", () => {
    const steps = buildProtocol("stemi", { commDelaySeconds: 1.3, missionName: "ISS" }).steps.map((s) => s.text);
    expect(steps).toContain("Follow the onboard medical checklist for chest pain; contact the flight surgeon.");
  });
});

describe("P1.1 escalation follows explicit rules, not the critical band", () => {
  it("blood pressure escalates only above the AHA hypertensive crisis", () => {
    expect(evaluateValue("systolicBP", 179)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("systolicBP", 180)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("systolicBP", 181)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("diastolicBP", 119)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("diastolicBP", 120)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("diastolicBP", 121)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("systolicBP", 140)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("systolicBP", 79)).toMatchObject({ status: "critical", escalate: true });
  });

  it("stage 2 blood pressure asks for a re-check in 15 minutes", () => {
    const ev = evaluateValue("systolicBP", 150);
    expect(judgement(INDICATORS.systolicBP, ev)).toBe("outside normal range, re-check in 15 minutes");
    expect(INDICATORS.systolicBP.ranges.caution).toContain("140–180");
    expect(INDICATORS.systolicBP.ranges.critical).toContain("> 180");
    expect(INDICATORS.diastolicBP.ranges.critical).toContain("> 120");
  });

  it("symptom-type indicators escalate on any critical value", () => {
    expect(evaluateValue("stDeviation", 1.0)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("stDeviation", 0.9)).toMatchObject({ status: "nominal", escalate: false });
    expect(evaluateValue("stDeviation", -2.1)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("spo2", 90)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("spo2", 91)).toMatchObject({ status: "caution", escalate: false });
    expect(evaluateValue("visionChange", 1)).toMatchObject({ status: "caution", escalate: true });
    expect(evaluateValue("visionChange", 0)).toMatchObject({ status: "nominal", escalate: false });
  });

  it("indicators without an explicit rule never escalate on one value", () => {
    for (const id of ALL_IDS) {
      const def = INDICATORS[id];
      if (def.escalateAbove != null || def.escalateBelow != null || def.escalateFromBand) continue;
      for (let v = def.inputRange[0]; v <= def.inputRange[1]; v += (def.inputRange[1] - def.inputRange[0]) / 50) {
        expect(evaluateValue(id, v).escalate, `${id} = ${v}`).toBe(false);
      }
    }
  });

  it("single values of persistence-rule indicators say that repeated values escalate", () => {
    expect(evaluateValue("stress", 9)).toMatchObject({ escalate: false, repeatRule: "≥ 8 /10 on 2 days in a row" });
    expect(evaluateValue("mood", 2)).toMatchObject({ escalate: false, repeatRule: "≤ 2 /10 on 2 days in a row" });
    expect(evaluateValue("sleepHours", 4.5)).toMatchObject({ escalate: false, repeatRule: "< 6 h on 7 days in a row" });
    expect(evaluateValue("bodyTemp", 38.4)).toMatchObject({ escalate: false, repeatRule: "≥ 38.1 °C persisting 24 h" });
    expect(evaluateValue("stress", 7).repeatRule).toBeNull();
    expect(judgement(INDICATORS.stress, evaluateValue("stress", 9))).toBe(
      "in the critical band, single value; repeated values escalate (≥ 8 /10 on 2 days in a row)",
    );
  });

  it("finding text follows escalate: critical without a rule is re-check and log", () => {
    expect(judgement(INDICATORS.hydration, evaluateValue("hydration", 1))).toBe("in the critical band: re-check and log");
    expect(judgement(INDICATORS.systolicBP, evaluateValue("systolicBP", 190))).toBe("critical: contact the flight surgeon");
  });

  it("glucose keeps the 2-day rule and a single-value ceiling above 400 mg/dL", () => {
    expect(evaluateValue("glucose", 300)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("glucose", 400)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("glucose", 401)).toMatchObject({ status: "critical", escalate: true });
    expect(evaluateValue("glucose", 600)).toMatchObject({ escalate: true });
    expect(evaluateValue("glucose", 53)).toMatchObject({ status: "critical", escalate: true });
    expect(INDICATORS.glucose.escalation).toContain("above 400 mg/dL (project rule)");
  });

  it("marks project-defined escalation rules on NASA and clinical indicators", () => {
    expect(INDICATORS.glucose.escalation).toMatch(/250 mg\/dL on two days in a row \(project rule\)/);
    expect(INDICATORS.exerciseMinutes.escalation).toMatch(/3 days in a row \(project rule\)/);
    expect(INDICATORS.wbc.escalation).toMatch(/above 30 ×10⁹\/L \(project rule\)/);
    expect(INDICATORS.bodyTemp.escalation).toMatch(/persisting 24 h \(project rule\)/);
  });

  it("cabin CO₂: a single reading counts as a breach of the 1-hour average limit, and says so", () => {
    expect(INDICATORS.cabinCO2.measurement).not.toMatch(/read as 1-hour averages/);
    expect(INDICATORS.cabinCO2.measurement).toMatch(/single high reading as a breach/);
    expect(evaluateValue("cabinCO2", 3.1)).toMatchObject({ status: "critical", escalate: true });
  });

  it("the stated escalation text names every automatic limit", () => {
    for (const def of Object.values(INDICATORS)) {
      const limits = [def.escalateAbove, def.escalateBelow, def.persistence?.value].filter((v): v is number => v != null);
      for (const v of limits) expect(def.escalation, `${def.id} text vs ${v}`).toContain(String(Math.abs(v)));
      if (def.persistence?.days) expect(def.escalation, def.id).toMatch(/in a row/);
      if (def.persistence?.hours) expect(def.escalation, def.id).toContain(`persisting ${def.persistence.hours} h`);
    }
  });
});

describe("P1.2 temperature uses the NEWS2 bands", () => {
  const cases: Array<[number, string, boolean]> = [
    [34.9, "critical", true],
    [35.0, "critical", true],
    [35.1, "caution", false],
    [36.0, "caution", false],
    [36.1, "nominal", false],
    [38.0, "nominal", false],
    [38.1, "caution", false],
    [39.0, "caution", false],
    [39.1, "critical", true],
  ];
  it.each(cases)("%d °C is %s (escalate %s)", (v, status, escalate) => {
    expect(classify("bodyTemp", v)).toBe(status);
    expect(evaluateValue("bodyTemp", v, 36.7)).toMatchObject({ status, escalate });
  });

  it("escalates from the critical band: ≤ 35.0 °C and ≥ 39.1 °C", () => {
    expect(INDICATORS.bodyTemp.escalateFromBand).toBe("critical");
    expect(INDICATORS.bodyTemp.escalateAbove).toBeUndefined();
    expect(INDICATORS.bodyTemp.escalateBelow).toBeUndefined();
    expect(INDICATORS.bodyTemp.escalation).toMatch(/35\.0 °C or below, 39\.1 °C or above/);
  });

  it("says the critical mapping above 39 °C is a project rule", () => {
    expect(INDICATORS.bodyTemp.ranges.critical).toMatch(/our project rule/);
    expect(INDICATORS.bodyTemp.sources.map((s) => s.label)).toContain("RCP NEWS2");
  });
});

describe("persistence rules with history (assess.ts)", () => {
  it("stress: one day of 9 does not escalate, two days of 8+ do", async () => {
    state.readings = daily("stress", [5, 9]);
    let a = await assessmentOf("stress");
    expect(a).toMatchObject({ status: "critical", escalate: false });
    expect(a.finding).toContain("single value; repeated values escalate");
    expect(a.finding).not.toMatch(/act now|contact the flight surgeon/);

    state.readings = daily("stress", [8, 9]);
    a = await assessmentOf("stress");
    expect(a).toMatchObject({ status: "critical", escalate: true });
    expect(a.finding).toBe("Stress 9 /10: ≥ 8 /10 on 2 days in a row, critical: contact the flight surgeon.");
  });

  it("mood: ≤ 2 on two days in a row escalates, a gap resets it", async () => {
    state.readings = daily("mood", [2, 2]);
    expect((await assessmentOf("mood")).escalate).toBe(true);
    state.readings = daily("mood", [2, 6, 1]);
    expect((await assessmentOf("mood")).escalate).toBe(false);
  });

  it("temperature ≥ 38.1 °C escalates only after 24 h without a lower reading", async () => {
    const now = Date.now() - 60_000;
    state.readings = [reading("bodyTemp", 38.4, now - 24 * H), reading("bodyTemp", 38.3, now)];
    let a = await assessmentOf("bodyTemp");
    expect(a).toMatchObject({ status: "caution", escalate: true });
    expect(a.finding).toContain("≥ 38.1 °C persisting 24 h, contact the flight surgeon");

    state.readings = [reading("bodyTemp", 38.4, now - 10 * H), reading("bodyTemp", 38.3, now)];
    a = await assessmentOf("bodyTemp");
    expect(a.escalate).toBe(false);
    expect(a.finding).toContain("10 h so far; repeated values escalate (≥ 38.1 °C persisting 24 h)");

    state.readings = [
      reading("bodyTemp", 38.4, now - 26 * H),
      reading("bodyTemp", 37.0, now - 12 * H),
      reading("bodyTemp", 38.3, now),
    ];
    expect((await assessmentOf("bodyTemp")).escalate).toBe(false);

    state.readings = [reading("bodyTemp", 39.2, now)];
    expect(await assessmentOf("bodyTemp")).toMatchObject({ status: "critical", escalate: true });
  });

  it("temperature: a gap of more than 36 h without readings does not count as persisting", async () => {
    const now = Date.now() - 60_000;
    state.readings = [reading("bodyTemp", 38.5, now - 72 * H), reading("bodyTemp", 38.5, now)];
    const a = await assessmentOf("bodyTemp");
    expect(a.escalate).toBe(false);
    expect(a.finding).toContain("single value; repeated values escalate");

    state.readings = [reading("bodyTemp", 38.5, now - 37 * H), reading("bodyTemp", 38.5, now)];
    expect((await assessmentOf("bodyTemp")).escalate).toBe(false);

    state.readings = [reading("bodyTemp", 38.5, now - 48 * H), reading("bodyTemp", 38.4, now - 24 * H), reading("bodyTemp", 38.5, now)];
    expect((await assessmentOf("bodyTemp")).escalate).toBe(true);
  });

  it.each([26, 35])("temperature: daily check-ins %d h apart (drifting times) count as persisting", async (hours) => {
    const now = Date.now() - 60_000;
    state.readings = [reading("bodyTemp", 38.4, now - hours * H), reading("bodyTemp", 38.5, now)];
    const a = await assessmentOf("bodyTemp");
    expect(a).toMatchObject({ status: "caution", escalate: true });
    expect(a.finding).toBe("Temperature 38.5 °C: ≥ 38.1 °C persisting 24 h, contact the flight surgeon.");
    const { PERSIST_MAX_GAP_MS } = await import("@/lib/health/assess");
    expect(PERSIST_MAX_GAP_MS).toBe(36 * H);
  });

  it("temperature: never 'single value' while an earlier fever reading is in the window", async () => {
    const now = Date.now() - 60_000;
    state.readings = [reading("bodyTemp", 38.4, now - 20 * 60_000), reading("bodyTemp", 38.5, now)];
    let a = await assessmentOf("bodyTemp");
    expect(a.escalate).toBe(false);
    expect(a.finding).not.toContain("single value");
    expect(a.finding).toContain("under 1 h so far; repeated values escalate (≥ 38.1 °C persisting 24 h)");

    state.readings = [reading("bodyTemp", 38.4, now - 6 * H), reading("bodyTemp", 38.5, now)];
    a = await assessmentOf("bodyTemp");
    expect(a.finding).not.toContain("single value");
    expect(a.finding).toContain("6 h so far");

    state.readings = [reading("bodyTemp", 38.5, now)];
    expect((await assessmentOf("bodyTemp")).finding).toContain("single value; repeated values escalate");
  });

  it("finding text reads with one colon: value, band, progress, rule", async () => {
    state.readings = daily("sleepHours", [4.9, 4.9, 4.9, 4.9, 4.9]);
    const a = await assessmentOf("sleepHours");
    expect(a.escalate).toBe(false);
    expect(a.finding).toBe("Sleep 4.9 h: in the critical band, 5 days in a row so far; repeated values escalate (< 6 h on 7 days in a row).");
  });

  it("glucose above 250 mg/dL escalates on the second day only, above 400 at once", async () => {
    state.readings = daily("glucose", [95, 300]);
    expect(await assessmentOf("glucose")).toMatchObject({ status: "critical", escalate: false });
    state.readings = daily("glucose", [280, 300]);
    expect((await assessmentOf("glucose")).escalate).toBe(true);
    state.readings = daily("glucose", [95, 450]);
    const a = await assessmentOf("glucose");
    expect(a).toMatchObject({ status: "critical", escalate: true });
    expect(a.finding).toContain("critical: contact the flight surgeon");
  });

  it("blood pressure 150 mmHg is caution with a re-check, not an escalation", async () => {
    state.readings = [reading("systolicBP", 150, Date.now() - 60_000)];
    const a = await assessmentOf("systolicBP");
    expect(a).toMatchObject({ status: "caution", escalate: false });
    expect(a.finding).toContain("re-check in 15 minutes");
  });
});

describe("training drills still escalate", () => {
  const drill = (type: Scenario["type"], secondsAgo: number): Scenario => ({
    crewId: "cdr",
    type,
    startedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
  });

  it("STEMI: ST segment critical escalates", async () => {
    state.scenario = drill("stemi", 180);
    const a = await assessmentOf("stDeviation");
    expect(a).toMatchObject({ status: "critical", escalate: true, drill: true });
    expect(a.finding).toContain("critical: contact the flight surgeon");
  });

  it("VF: no pulse and no pressure escalate", async () => {
    state.scenario = drill("vf", 30);
    const a = await assessCrewMember("cdr");
    const esc = a!.escalations.map((e) => e.indicator);
    expect(esc).toContain("heartRate");
    expect(esc).toContain("systolicBP");
  });

  it("hypertensive crisis: BP above 180/120 escalates", async () => {
    state.scenario = drill("hypertensive-crisis", 120);
    const a = await assessCrewMember("cdr");
    const esc = a!.escalations.map((e) => e.indicator);
    expect(esc).toContain("systolicBP");
    expect(esc).toContain("diastolicBP");
  });
});

describe("ms2 demo sleep debt story", () => {
  it("a short night never says act now; it escalates only after 7 nights under 6 h", async () => {
    const now = Date.now();
    state.readings = simulateDaily(CREW.ms2, now - 8 * DAY, now).map((r) => ({ ...r, crewId: "ms2" }));
    const a = await assessmentOf("sleepHours", "ms2");
    expect(a.finding).not.toMatch(/act now/);
    const nights = state.readings
      .filter((r) => r.indicator === "sleepHours")
      .sort((x, y) => x.takenAt.localeCompare(y.takenAt))
      .slice(-7)
      .map((r) => r.value);
    const debt = nights.length === 7 && nights.every((v) => v < 6);
    expect(a.escalate).toBe(debt);
    if (!debt && a.value! < 6) expect(a.finding).toContain(`repeated values escalate (${persistenceLabel(INDICATORS.sleepHours)})`);
    if (debt) expect(a.finding).toContain("sleep debt");
  });
});

describe("guidance and help texts follow the engine", () => {
  it("tier 2 of the escalation protocol is generated from the rule fields", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { EscalationProtocol } = await import("@/components/guidance/escalation-protocol");
    const text = renderToStaticMarkup(createElement(EscalationProtocol)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("any critical SpO₂, temperature or ST segment value");
    expect(text).toContain("any vision value ≥ 1 /3");
    expect(text).toContain("a current solar radiation storm alert (NOAA S1 or higher)");
    expect(text).toContain("a value repeated for the stated days or hours");
  });

  it("no page says a critical band alone means act now", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "..");
    for (const file of ["src/app/check-in/page.tsx", "src/app/help/page.tsx", "src/components/help/diagrams.tsx"]) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src, file).not.toMatch(/act now and contact the flight surgeon/);
      expect(src, file).not.toMatch(/real alarm:|no: real alarm|A real alarm has no such tag/);
    }
  });
});

describe("crew entries and DEVICE readings replace simulated values", () => {
  it("for a vital sign only while at most 6 h old; other indicators always", () => {
    const now = Date.now();
    const sim = reading("heartRate", 70, now - 60_000, "simulated");
    for (const source of ["manual", "sensor"] as const) {
      expect(currentValue("heartRate", [reading("heartRate", 90, now - 6 * H + 60_000, source), sim], now)?.source).toBe(source);
      expect(currentValue("heartRate", [reading("heartRate", 90, now - 6 * H - 60_000, source), sim], now)?.source).toBe("simulated");
    }
    // A daily check-in indicator: an older crew entry still wins over simulated values.
    const sleep = [reading("sleepHours", 6.5, now - 3 * DAY, "manual"), reading("sleepHours", 7.5, now - 60_000, "simulated")];
    expect(currentValue("sleepHours", sleep, now)?.source).toBe("manual");
  });

  it("the overview and /help say so (no 'always override')", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "..");
    const flat = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\s+/g, " ");
    const overview = flat("src/app/page.tsx");
    const help = flat("src/app/help/page.tsx");
    expect(overview).toContain(
      "Daily check-in values are simulated until the crew enters its own (labelled Crew entry); crew entries and DEVICE readings replace simulated values (for a vital sign while at most 6 h old, project rule).",
    );
    expect(help).toContain("Crew entries and DEVICE readings replace simulated values (for a vital sign while at most 6 h old, project rule).");
    for (const src of [overview, help]) expect(src).not.toMatch(/always (override|replace)/);
  });
});
