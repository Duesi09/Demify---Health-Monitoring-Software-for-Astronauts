import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewMember, IndicatorId, Reading, SourceResult } from "@/lib/types";
import type { SpaceWeather } from "@/lib/sources/swpc";

const DAY = 86_400_000;
const crew: CrewMember = {
  id: "cdr",
  name: "Commander",
  role: "Commander",
  baseline: { heartRate: 62, systolicBP: 118 },
} as CrewMember;

const state = vi.hoisted(() => ({ readings: [] as Reading[], sw: null as unknown }));

vi.mock("@/lib/store/readings", () => ({
  getCrew: async (id: string) => (id === "cdr" ? crew : null),
  listCrew: async () => [crew],
  listReadings: async ({ since }: { since?: string }) =>
    state.readings.filter((r) => !since || r.takenAt >= since),
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
      if (!state.sw) throw new Error("offline");
      return state.sw;
    },
  };
});

const { assessCrewMember } = await import("@/lib/health/assess");
const { evaluateValue, classify, needsEscalation } = await import("@/lib/health/knowledge");
const { flareClass, sLevelFromFlux } = await import("@/lib/sources/swpc");

let seq = 0;
function reading(indicator: IndicatorId, value: number, takenAt: number, source: Reading["source"] = "manual"): Reading {
  return { id: `r${seq++}`, crewId: "cdr", indicator, value, unit: "", takenAt: new Date(takenAt).toISOString(), source };
}

function spaceWeather(p10: number, t: string, freshness: SourceResult<SpaceWeather>["freshness"] = "live"): SourceResult<SpaceWeather> {
  return {
    data: {
      protons: [{ t, p10, p100: null }],
      current: { p10, p100: null, t },
      sLevel: sLevelFromFlux(p10),
      xray: [],
      flareClass: null,
      kp: [],
      forecast: [],
    },
    source: "NOAA",
    freshness,
    fetchedAt: new Date().toISOString(),
  };
}

async function assessmentOf(id: IndicatorId) {
  const a = await assessCrewMember("cdr");
  return a!.assessments.find((x) => x.indicator === id)!;
}

beforeEach(() => {
  state.readings = [];
  state.sw = null;
});

describe("#1/#10 solar particle events reach the dose-rate assessment", () => {
  it("S3 storm on ISS is critical and escalates although the estimated rate is low", async () => {
    const t = new Date(Date.now() - 10 * 60_000).toISOString();
    state.sw = spaceWeather(1500, t);
    const a = await assessmentOf("radiationDoseRate");
    expect(a.value).toBeCloseTo(1.25, 2);
    expect(classify("radiationDoseRate", 1.25)).toBe("nominal");
    expect(a.status).toBe("critical");
    expect(a.escalate).toBe(true);
    expect(a.finding).toContain("S3 solar radiation storm in progress");
    expect(a.takenAt).toBe(new Date(t).toISOString());
  });

  it("S1 is at least caution and escalates", async () => {
    state.sw = spaceWeather(15, new Date().toISOString());
    const a = await assessmentOf("radiationDoseRate");
    expect(a.status).toBe("caution");
    expect(a.escalate).toBe(true);
    expect(a.finding).toContain("S1 solar radiation storm");
  });

  it("quiet sun stays nominal without escalation", async () => {
    state.sw = spaceWeather(0.3, new Date().toISOString());
    const a = await assessmentOf("radiationDoseRate");
    expect(a.status).toBe("nominal");
    expect(a.escalate).toBe(false);
  });

  it("offline snapshot keeps the data time and says it is stale", async () => {
    const t = new Date(Date.now() - 3 * DAY).toISOString();
    state.sw = spaceWeather(0.3, t, "snapshot");
    const a = await assessmentOf("radiationDoseRate");
    expect(a.takenAt).toBe(t);
    expect(a.finding).toMatch(/offline NOAA snapshot from 3 days ago/);
  });

  it("a stale snapshot storm does not override a dosimeter reading, a live one does", async () => {
    state.readings = [reading("radiationDoseRate", 0.4, Date.now() - 60_000, "sensor")];
    state.sw = spaceWeather(1500, new Date(Date.now() - 3 * DAY).toISOString(), "snapshot");
    expect((await assessmentOf("radiationDoseRate")).status).toBe("nominal");
    state.sw = spaceWeather(1500, new Date().toISOString());
    const a = await assessmentOf("radiationDoseRate");
    expect(a.status).toBe("critical");
    expect(a.escalate).toBe(true);
  });
});

describe("#2 future-dated readings", () => {
  it("are ignored for the current value", async () => {
    state.readings = [
      reading("heartRate", 150, Date.now() - 5 * 60_000, "sensor"),
      reading("heartRate", 60, Date.parse("2099-01-01T00:00:00Z"), "sensor"),
      reading("mood", 9, Date.parse("2099-01-01T00:00:00Z")),
      reading("mood", 2, Date.now() - 60_000),
    ];
    const a = await assessCrewMember("cdr");
    const hr = a!.assessments.find((x) => x.indicator === "heartRate")!;
    expect(hr.value).toBe(150);
    expect(hr.status).toBe("critical");
    expect(a!.assessments.find((x) => x.indicator === "mood")!.value).toBe(2);
  });
});

describe("#3/#4 shared evaluation", () => {
  it("rounds before classifying, like the stored value", () => {
    expect(evaluateValue("spo2", 90.6)).toMatchObject({ value: 91, status: "caution", escalate: false });
    expect(evaluateValue("spo2", 90.4)).toMatchObject({ value: 90, status: "critical", escalate: true });
    expect(evaluateValue("bodyTemp", 37.95)).toMatchObject({ value: 38, status: "critical" });
    expect(evaluateValue("bodyMassChange", -5.04)).toMatchObject({ value: -5, status: "caution", escalate: false });
  });

  it("applies the baseline rule and critical => escalate", () => {
    expect(evaluateValue("heartRate", 75, 58)).toMatchObject({ status: "caution", baselineShift: true });
    expect(evaluateValue("heartRate", 75)).toMatchObject({ status: "nominal", baselineShift: false });
    expect(evaluateValue("systolicBP", 150, 118)).toMatchObject({ status: "critical", escalate: true });
    // discrete indicators ignore baselines
    expect(evaluateValue("glucose", 99, 60).status).toBe("nominal");
  });

  it("assessment uses the same evaluation as the form", async () => {
    state.readings = [reading("heartRate", 80, Date.now() - 60_000)];
    const a = await assessmentOf("heartRate");
    const ev = evaluateValue("heartRate", 80, 62);
    expect(a.status).toBe(ev.status);
    expect(a.escalate).toBe(ev.escalate);
  });
});

describe("#5 trend rules", () => {
  const base = Date.now() - 60_000;
  const series = (id: IndicatorId, values: number[]) =>
    values.map((v, i) => reading(id, v, base - (values.length - 1 - i) * DAY, "simulated"));

  it("mood drop of 2 over 3 days is caution", async () => {
    state.readings = series("mood", [7, 7, 6, 5]);
    const a = await assessmentOf("mood");
    expect(classify("mood", 5)).toBe("nominal");
    expect(a.status).toBe("caution");
    expect(a.finding).toContain("down 2 points over 3 days");
  });

  it("small mood dip stays nominal", async () => {
    state.readings = series("mood", [7, 7, 7, 6]);
    expect((await assessmentOf("mood")).status).toBe("nominal");
  });

  it("stress rise of 2 over 3 days is caution", async () => {
    state.readings = series("stress", [2, 3, 3, 4]);
    const a = await assessmentOf("stress");
    expect(a.status).toBe("caution");
    expect(a.finding).toContain("up 2 points");
  });

  it("sleep under 6 h for 7 days is critical and escalates", async () => {
    state.readings = series("sleepHours", [5.5, 5.8, 5.2, 5.9, 5.5, 5.6, 5.5]);
    const a = await assessmentOf("sleepHours");
    expect(a.status).toBe("critical");
    expect(a.escalate).toBe(true);
  });

  it("sleep under 6 h on only 6 of 7 days stays caution", async () => {
    state.readings = series("sleepHours", [6.5, 5.8, 5.2, 5.9, 5.5, 5.6, 5.5]);
    expect((await assessmentOf("sleepHours")).status).toBe("caution");
  });
});

describe("#6/#7 boundaries match the range text", () => {
  it("classifies exact boundary values as the text states", () => {
    expect(classify("radiationCumulative", 480)).toBe("caution");
    expect(classify("radiationCumulative", 481)).toBe("critical");
    expect(classify("wbc", 30)).toBe("caution");
    expect(classify("wbc", 30.1)).toBe("critical");
    expect(classify("radiationDoseRate", 10)).toBe("caution");
    expect(classify("radiationDoseRate", 10.01)).toBe("critical");
    expect(evaluateValue("radiationCumulative", 480).escalate).toBe(false);
    expect(evaluateValue("radiationCumulative", 481).escalate).toBe(true);
  });

  it("escalates any new vision change", () => {
    expect(needsEscalation("visionChange", 0)).toBe(false);
    expect(needsEscalation("visionChange", 1)).toBe(true);
    expect(evaluateValue("visionChange", 1)).toMatchObject({ status: "caution", escalate: true });
  });
});

describe("#12 flareClass", () => {
  it("never yields a multiplier of 10.0 below X", () => {
    expect(flareClass(9.96e-6)).toBe("M1.0");
    expect(flareClass(9.96e-5)).toBe("X1.0");
    expect(flareClass(9.94e-6)).toBe("C9.9");
    expect(flareClass(2.3e-6)).toBe("C2.3");
    expect(flareClass(1.2e-3)).toBe("X12.0");
  });
});
