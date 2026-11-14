import { describe, expect, it } from "vitest";
import {
  BODY_REGIONS,
  CHECK_IN_INDICATORS,
  INDICATORS,
  classify,
  escalationFlags,
  evaluateValue,
  needsEscalation,
} from "@/lib/health/knowledge";
import type { IndicatorId } from "@/lib/types";

describe("knowledge base integrity", () => {
  it("defines ascending thresholds for every indicator", () => {
    for (const def of Object.values(INDICATORS)) {
      const uppers = def.steps.map(([u]) => u);
      expect(uppers, def.id).toEqual([...uppers].sort((a, b) => a - b));
      expect(def.sources.length, `${def.id} needs a source`).toBeGreaterThan(0);
      expect(def.inputRange[0]).toBeLessThan(def.inputRange[1]);
    }
  });

  it("maps every body region to known indicators", () => {
    for (const r of Object.values(BODY_REGIONS)) {
      for (const i of r.indicators) expect(INDICATORS[i], `${r.id} -> ${i}`).toBeDefined();
    }
    for (const i of CHECK_IN_INDICATORS) expect(INDICATORS[i]).toBeDefined();
  });
});

describe("classify", () => {
  const cases: Array<[IndicatorId, number, string]> = [
    ["heartRate", 62, "nominal"],
    ["heartRate", 45, "caution"],
    ["heartRate", 35, "critical"],
    ["heartRate", 140, "critical"],
    ["systolicBP", 118, "nominal"],
    ["systolicBP", 135, "caution"],
    // AHA stage 2 (140-180) is caution: re-check in 15 minutes.
    ["systolicBP", 145, "caution"],
    ["systolicBP", 180, "caution"],
    ["systolicBP", 181, "critical"],
    ["systolicBP", 85, "caution"],
    ["diastolicBP", 95, "caution"],
    ["diastolicBP", 120, "caution"],
    ["diastolicBP", 121, "critical"],
    ["spo2", 98, "nominal"],
    ["spo2", 93, "caution"],
    ["spo2", 89, "critical"],
    // NEWS2 bands
    ["bodyTemp", 36.8, "nominal"],
    ["bodyTemp", 37.5, "nominal"],
    ["bodyTemp", 38.4, "caution"],
    ["bodyTemp", 39.5, "critical"],
    ["glucose", 85, "nominal"],
    ["glucose", 60, "caution"],
    ["glucose", 50, "critical"],
    ["glucose", 300, "critical"],
    ["sleepHours", 8, "nominal"],
    ["sleepHours", 6, "caution"],
    ["sleepHours", 4, "critical"],
    ["mood", 8, "nominal"],
    ["mood", 2, "critical"],
    ["stress", 3, "nominal"],
    ["stress", 6, "caution"],
    ["stress", 9, "critical"],
    ["radiationCumulative", 120, "nominal"],
    ["radiationCumulative", 400, "caution"],
    ["radiationCumulative", 550, "critical"],
    ["cabinCO2", 2.0, "nominal"],
    ["cabinCO2", 2.8, "caution"],
    ["cabinCO2", 3.5, "critical"],
    ["hydration", 2.8, "nominal"],
    ["hydration", 2.0, "caution"],
    ["hydration", 1.0, "critical"],
  ];
  it.each(cases)("%s = %d is %s", (id, value, expected) => {
    expect(classify(id, value)).toBe(expected);
  });

  it("returns unknown for non-finite values", () => {
    expect(classify("heartRate", Number.NaN)).toBe("unknown");
  });
});

describe("needsEscalation", () => {
  it("flags hypertensive crisis and severe hypoglycaemia", () => {
    expect(needsEscalation("systolicBP", 185)).toBe(true);
    expect(needsEscalation("systolicBP", 150)).toBe(false);
    expect(needsEscalation("glucose", 50)).toBe(true);
    expect(needsEscalation("spo2", 89)).toBe(true);
  });

  it("keeps a single-value glucose ceiling above 400 mg/dL next to the 2-day rule", () => {
    expect(needsEscalation("glucose", 400)).toBe(false);
    expect(needsEscalation("glucose", 401)).toBe(true);
    expect(evaluateValue("glucose", 300)).toMatchObject({ status: "critical", escalate: false, repeatRule: "> 250 mg/dL on 2 days in a row" });
  });

  it("escalates every NEWS2-critical temperature, low and high", () => {
    expect(needsEscalation("bodyTemp", 35.0)).toBe(true);
    expect(needsEscalation("bodyTemp", 35.1)).toBe(false);
    expect(needsEscalation("bodyTemp", 39.0)).toBe(false);
    expect(needsEscalation("bodyTemp", 39.1)).toBe(true);
  });

  it("does not escalate on a critical band alone", () => {
    expect(evaluateValue("stress", 9)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("mood", 1)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("sleepHours", 4)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("hydration", 1)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("exerciseMinutes", 10)).toMatchObject({ status: "critical", escalate: false });
    expect(evaluateValue("glucose", 300)).toMatchObject({ status: "critical", escalate: false });
  });
});

describe("escalationFlags", () => {
  it("describes every automatic rule from the rule fields", () => {
    expect(escalationFlags(INDICATORS.systolicBP)).toEqual(["< 80 mmHg", "> 180 mmHg"]);
    expect(escalationFlags(INDICATORS.bodyTemp)).toEqual(["Any value ≤ 35.0 °C or ≥ 39.1 °C", "≥ 38.1 °C persisting 24 h"]);
    expect(escalationFlags(INDICATORS.glucose)).toEqual(["< 54 mg/dL", "> 400 mg/dL", "> 250 mg/dL on 2 days in a row"]);
    expect(escalationFlags(INDICATORS.stress)).toEqual(["≥ 8 /10 on 2 days in a row"]);
    expect(escalationFlags(INDICATORS.spo2)).toEqual(["Any value ≤ 90 %"]);
    expect(escalationFlags(INDICATORS.stDeviation)).toEqual(["Any value ≥ 1 mm elevation or > 2 mm depression"]);
    expect(escalationFlags(INDICATORS.visionChange)).toEqual(["Any value ≥ 1 /3"]);
    expect(escalationFlags(INDICATORS.radiationDoseRate)).toEqual(["> 10 mSv/day", "Any current S1+ solar radiation storm"]);
    expect(escalationFlags(INDICATORS.hydration)).toEqual([]);
  });
});
