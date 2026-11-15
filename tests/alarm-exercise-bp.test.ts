import { describe, expect, it } from "vitest";
import { ALARM_LIMITS, computeAlarms } from "@/lib/monitor/alarms";
import { baseState, physioAt } from "@/lib/sources/simulator";
import { listCrew } from "@/lib/store/readings";
import type { CrewMember, LiveVitals, Scenario } from "@/lib/types";

/**
 * Systolic blood pressure rises normally during exercise. The monitor keeps
 * its resting limits (160 / 180 mmHg) at rest and in every drill, and uses
 * exercise-testing limits (210 / 250 mmHg) only during scheduled exercise, so
 * the simulated pilot's workout no longer raises a standing yellow alarm.
 */

function vitals(over: Partial<Omit<LiveVitals, "alarms">>): Omit<LiveVitals, "alarms"> {
  return {
    crewId: "plt",
    crewName: "Pilot",
    t: "2026-11-15T10:00:00.000Z",
    hr: 110,
    rhythm: "sinus-tachycardia",
    stMm: 0,
    pvcPerMin: 0,
    sys: 120,
    dia: 80,
    map: 93,
    spo2: 98,
    resp: 18,
    temp: 36.8,
    source: "simulated",
    activity: "rest",
    scenario: null,
    ...over,
  };
}
const abp = (v: Omit<LiveVitals, "alarms">) => computeAlarms(v).filter((a) => a.indicator === "systolicBP");

describe("systolic blood pressure alarm limits by activity", () => {
  it("at rest: medium above 160, high above 180", () => {
    expect(abp(vitals({ sys: 167 }))).toMatchObject([{ priority: "medium", text: "ABP SYS HIGH 167 > 160" }]);
    expect(abp(vitals({ sys: 185 }))).toMatchObject([{ priority: "high", text: "ABP SYS 185 > 180" }]);
    expect(abp(vitals({ sys: 150 }))).toEqual([]);
  });

  it("during exercise: no alarm for a normal rise, medium above 210, high above 250", () => {
    expect(abp(vitals({ sys: 170, activity: "exercise" }))).toEqual([]);
    expect(abp(vitals({ sys: 205, activity: "exercise" }))).toEqual([]);
    expect(abp(vitals({ sys: 215, activity: "exercise" }))).toMatchObject([
      { priority: "medium", text: `ABP SYS HIGH 215 > ${ALARM_LIMITS.sysExercise.high}` },
    ]);
    expect(abp(vitals({ sys: 255, activity: "exercise" }))).toMatchObject([
      { priority: "high", text: `ABP SYS 255 > ${ALARM_LIMITS.sysExercise.highHigh}` },
    ]);
  });

  it("low pressure alarms are the same in every activity", () => {
    expect(abp(vitals({ sys: 85, activity: "exercise" }))).toMatchObject([{ priority: "medium" }]);
    expect(abp(vitals({ sys: 75, activity: "exercise" }))).toMatchObject([{ priority: "high" }]);
  });
});

describe("simulated crew", () => {
  it("the pilot's scheduled workout raises no high blood pressure alarm, and no crew member has one at rest", async () => {
    const crew = await listCrew();
    const t0 = Date.parse("2026-11-15T00:00:00Z");
    let exerciseMinutes = 0;
    for (const c of crew) {
      for (let t = t0; t < t0 + 7 * 86400_000; t += 60_000) {
        const s = baseState(c, t);
        if (s.activity === "exercise") exerciseMinutes++;
        const v = vitals({ crewId: c.id, sys: s.sys == null ? null : Math.round(s.sys), activity: s.activity });
        const high = abp(v).filter((x) => x.text.includes(">"));
        expect(high, `${c.id} at ${new Date(t).toISOString()} (${s.activity}, sys ${v.sys})`).toEqual([]);
      }
    }
    expect(exerciseMinutes).toBeGreaterThan(0);
  });

  it("a hypertensive crisis drill started during the pilot's workout still raises the red alarm (drills use resting limits)", async () => {
    const plt = (await listCrew()).find((c) => c.id === "plt") as CrewMember;
    const t0 = Date.parse("2026-11-15T00:00:00Z");
    let tEx = t0;
    while (baseState(plt, tEx).activity !== "exercise") tEx += 60_000;
    const scenario: Scenario = { crewId: "plt", type: "hypertensive-crisis", startedAt: new Date(tEx).toISOString() };
    const now = tEx + 180_000;
    const s = physioAt(plt, now, scenario);
    expect(s.activity).toBe("rest");
    const v = vitals({ sys: Math.round(s.sys!), dia: Math.round(s.dia!), activity: s.activity });
    expect(v.sys!).toBeGreaterThan(180);
    expect(abp(v)).toMatchObject([{ priority: "high" }]);
  });
});
