import { describe, expect, it } from "vitest";
import { BODY_REGIONS, CHECK_IN_INDICATORS, INDICATORS, classify, needsEscalation } from "@/lib/health/knowledge";
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
    ["systolicBP", 145, "critical"],
    ["systolicBP", 85, "caution"],
    ["spo2", 98, "nominal"],
    ["spo2", 93, "caution"],
    ["spo2", 89, "critical"],
    ["bodyTemp", 36.8, "nominal"],
    ["bodyTemp", 37.5, "caution"],
    ["bodyTemp", 38.4, "critical"],
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
});
