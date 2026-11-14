import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRILL_BUTTONS, SCENARIO_NAME, activeProtocol, buildProtocol } from "@/components/crew/protocols";
import { WaveSynth, paramsFromVitals, type SynthParams } from "@/components/monitor/waveform";
import { LINK_PROFILES } from "@/lib/link";
import { computeAlarms } from "@/lib/monitor/alarms";
import {
  REPORTED_NOT_MEASURED,
  SEIZURE_ACTIVE_S,
  SEIZURE_ALARM_TEXT,
  SEIZURE_ENDED_ALARM_TEXT,
  STROKE_ALARM_TEXT,
  seizureActive,
} from "@/lib/monitor/drills";
import { SCENARIO_LABEL, physioAt } from "@/lib/sources/simulator";
import { SCENARIO_TYPES } from "@/lib/store/scenarios";
import type { CrewMember, LiveVitals, Scenario, ScenarioType } from "@/lib/types";

/**
 * Stroke and seizure training drills (next to STEMI, VF and hypertensive
 * crisis). Medical content only from public first-aid guidance: American
 * Stroke Association F.A.S.T. and CDC "First aid for seizures"; microgravity
 * adaptations are labelled project text. A stroke cannot be recognised from
 * vital signs: the stroke drill is a crew report with a plausible monitor.
 */

const MS2: CrewMember = {
  id: "ms2",
  name: "Mission Specialist 2",
  role: "Flight Engineer",
  baseline: { heartRate: 60, systolicBP: 116, diastolicBP: 74, bodyTemp: 36.7, glucose: 90, spo2: 98 },
};

/** 14:00 UTC: not in ms2's exercise slot, not asleep. */
const T0 = Date.parse("2026-11-15T14:00:00.000Z");

function drill(type: ScenarioType, elapsedS: number): { scenario: Scenario; now: number } {
  return { scenario: { crewId: "ms2", type, startedAt: new Date(T0).toISOString() }, now: T0 + elapsedS * 1000 };
}

/** LiveVitals as src/lib/monitor/live.ts builds them for a drill (the simulator drives the monitor). */
function vitals(type: ScenarioType, elapsedS: number): LiveVitals {
  const { scenario, now } = drill(type, elapsedS);
  const s = physioAt(MS2, now, scenario);
  const base: Omit<LiveVitals, "alarms"> = {
    crewId: "ms2",
    crewName: MS2.name,
    t: new Date(now).toISOString(),
    hr: s.hr == null ? null : Math.round(s.hr),
    rhythm: s.rhythm,
    stMm: Number(s.stMm.toFixed(1)),
    pvcPerMin: s.pvcPerMin,
    ...(s.motion > 0 ? { motionArtifact: Number(s.motion.toFixed(2)) } : {}),
    sys: s.sys == null ? null : Math.round(s.sys),
    dia: s.dia == null ? null : Math.round(s.dia),
    map: s.sys != null && s.dia != null ? Math.round((s.sys + 2 * s.dia) / 3) : null,
    spo2: s.spo2 == null ? null : Math.min(100, Math.round(s.spo2)),
    resp: s.resp == null ? null : Math.round(s.resp),
    temp: Number(s.temp.toFixed(1)),
    source: "simulated",
    activity: s.activity,
    scenario: { ...scenario, elapsedS, label: SCENARIO_LABEL[type] },
  };
  return { ...base, alarms: computeAlarms(base) };
}

const BANNED_IN_BLACKOUT = /immediately|contact the flight surgeon|flight surgeon direction/i;
const WORDING = /\bdetects?\b|\bdiagnoses\b|AI[\s-]+powered|decision[\s-]+support|\bthe (first|only)\b/i;
/** Drug names and amounts (same spirit as tests/clinical-safety.test.ts and tests/library.test.ts). */
const MEDICINE =
  /aspirin|acetylsalicyl|alteplase|clopidogrel|heparin|diazepam|lorazepam|midazolam|levetiracetam|phenytoin|benzodiazepine|anticonvulsant|thromboly|medication|medicine|\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|mL|g|IU|units?)\b/i;

const texts = (type: "stroke" | "seizure", commDelaySeconds: number | null) =>
  buildProtocol(type, { commDelaySeconds, missionName: "Test link" }).steps.flatMap((s) => [s.text, s.detail ?? ""]);

describe("scenario types", () => {
  it("the store, the API validation and both label maps know the two new drills", () => {
    expect(SCENARIO_TYPES).toEqual(["stemi", "vf", "hypertensive-crisis", "stroke", "seizure"]);
    expect(Object.keys(SCENARIO_LABEL).sort()).toEqual([...SCENARIO_TYPES].sort());
    // The client copy matches the server labels.
    expect(SCENARIO_NAME).toEqual(SCENARIO_LABEL);
    expect(DRILL_BUTTONS.map((b) => b.type)).toEqual(SCENARIO_TYPES);
  });

  it("existing drills keep their labels and buttons", () => {
    expect(SCENARIO_LABEL.stemi).toBe("Acute myocardial infarction (STEMI)");
    expect(SCENARIO_LABEL.vf).toBe("Cardiac arrest (ventricular fibrillation)");
    expect(SCENARIO_LABEL["hypertensive-crisis"]).toBe("Hypertensive crisis");
    expect(DRILL_BUTTONS.slice(0, 3).map((b) => b.label)).toEqual([
      "Simulate heart attack (STEMI)",
      "Simulate cardiac arrest (VF)",
      "Simulate hypertensive crisis",
    ]);
  });

  it("the stroke button says the signs are reported by the crew, not measured", () => {
    const stroke = DRILL_BUTTONS.find((b) => b.type === "stroke")!;
    expect(stroke.label).toBe("Simulate stroke signs (F.A.S.T.)");
    expect(stroke.effect).toContain(REPORTED_NOT_MEASURED);
    expect(stroke.effect).toMatch(/face drooping, arm weakness, speech difficulty/);
    const seizure = DRILL_BUTTONS.find((b) => b.type === "seizure")!;
    expect(seizure.label).toBe("Simulate seizure");
    expect(seizure.effect).toMatch(/motion artefact on ECG, pleth and resp/);
  });
});

describe("stroke drill: a crew report with a plausible monitor", () => {
  it("raises a high-priority training alarm from the report, not from a value", () => {
    for (const e of [1, 30, 120, 600]) {
      const v = vitals("stroke", e);
      const alarm = v.alarms.find((a) => a.text === STROKE_ALARM_TEXT);
      expect(alarm, `${e} s`).toMatchObject({ id: "ms2:stroke", priority: "high", drill: true, reported: true });
      expect(alarm!.indicator).toBeUndefined();
      // It comes first, so the monitor and the alarm centre show it first.
      expect(v.alarms[0].text).toBe(STROKE_ALARM_TEXT);
      // Only the report is marked as reported.
      for (const a of v.alarms.filter((x) => x !== alarm)) expect(a.reported).toBeUndefined();
    }
    expect(STROKE_ALARM_TEXT).toBe("Stroke signs reported (F.A.S.T.)");
  });

  it("monitor: raised blood pressure, everything else near baseline", () => {
    const v = vitals("stroke", 180);
    expect(v.sys!).toBeGreaterThan(150);
    expect(v.sys!).toBeLessThanOrEqual(180);
    expect(v.dia!).toBeLessThanOrEqual(110);
    expect(v.hr!).toBeLessThan(100);
    expect(v.spo2!).toBeGreaterThanOrEqual(95);
    expect(v.stMm).toBeLessThan(1);
    expect(v.rhythm).toBe("sinus");
    expect(v.motionArtifact).toBeUndefined();
    // No measured high-priority alarm: the only red one is the crew report.
    expect(v.alarms.filter((a) => a.priority === "high").map((a) => a.text)).toEqual([STROKE_ALARM_TEXT]);
  });

  it("opens the stroke checklist", () => {
    expect(activeProtocol(vitals("stroke", 60))).toEqual({ id: "stroke", alarm: null });
  });
});

describe("seizure drill: bounded convulsions, then recovery values", () => {
  it("lasts a bounded time, under the 5-minute emergency limit", () => {
    expect(SEIZURE_ACTIVE_S).toBeGreaterThanOrEqual(120);
    expect(SEIZURE_ACTIVE_S).toBeLessThanOrEqual(180);
    expect(seizureActive(SEIZURE_ACTIVE_S - 1)).toBe(true);
    expect(seizureActive(SEIZURE_ACTIVE_S)).toBe(false);
  });

  it("while seizing: tachycardia, falling SpO2, motion artefact, high-priority seizure alarm", () => {
    const v = vitals("seizure", 100);
    expect(v.hr!).toBeGreaterThan(120);
    expect(v.spo2!).toBeLessThan(92);
    expect(v.motionArtifact).toBe(1);
    expect(v.alarms[0]).toMatchObject({ id: "ms2:seizure", priority: "high", text: SEIZURE_ALARM_TEXT, drill: true });
    expect(v.alarms[0].reported).toBeUndefined();
    expect(SEIZURE_ALARM_TEXT).toBe("Seizure (training)");
  });

  it("after the seizure: no artefact, recovering values, a medium recovery alarm", () => {
    const during = vitals("seizure", SEIZURE_ACTIVE_S - 5);
    const after = vitals("seizure", SEIZURE_ACTIVE_S + 300);
    expect(after.motionArtifact).toBeUndefined();
    expect(after.hr!).toBeLessThan(during.hr!);
    expect(after.spo2!).toBeGreaterThanOrEqual(95);
    const a = after.alarms.find((x) => x.id === "ms2:seizure")!;
    expect(a).toMatchObject({ priority: "medium", text: SEIZURE_ENDED_ALARM_TEXT, drill: true });
    expect(after.alarms.some((x) => x.text === SEIZURE_ALARM_TEXT)).toBe(false);
  });

  it("the values are continuous where the seizure ends", () => {
    const { scenario } = drill("seizure", 0);
    const at = (e: number) => physioAt(MS2, T0 + e * 1000, scenario);
    const a = at(SEIZURE_ACTIVE_S - 0.05);
    const b = at(SEIZURE_ACTIVE_S + 0.05);
    expect(Math.abs(a.hr! - b.hr!)).toBeLessThan(6);
    expect(Math.abs(a.sys! - b.sys!)).toBeLessThan(8);
    expect(Math.abs(a.spo2! - b.spo2!)).toBeLessThan(2);
  });

  it("opens the seizure checklist, also after the seizure ended", () => {
    expect(activeProtocol(vitals("seizure", 10))?.id).toBe("seizure");
    expect(activeProtocol(vitals("seizure", SEIZURE_ACTIVE_S + 60))?.id).toBe("seizure");
  });
});

describe("existing drills are unchanged", () => {
  it("STEMI, VF and hypertensive crisis raise no stroke or seizure alarm and no artefact", () => {
    for (const type of ["stemi", "vf", "hypertensive-crisis"] as const) {
      for (const e of [5, 60, 240]) {
        const v = vitals(type, e);
        expect(v.motionArtifact, `${type} ${e}`).toBeUndefined();
        expect(v.alarms.some((a) => /Stroke|Seizure/.test(a.text) || a.reported), `${type} ${e}`).toBe(false);
      }
    }
    expect(vitals("vf", 30).alarms[0].text).toBe("VFIB / NO PULSE");
  });
});

describe("checklists", () => {
  it("stroke: F.A.S.T. and the time the symptoms started (American Stroke Association)", () => {
    const p = buildProtocol("stroke", { commDelaySeconds: 0.5, missionName: "ISS" });
    expect(p.title).toBe("Suspected stroke (F.A.S.T.)");
    const by = (id: string) => p.steps.find((s) => s.id === id)!;
    expect(by("fast").text).toMatch(/Face drooping.*Arm weakness.*Speech difficulty/);
    expect(by("time").text).toBe("Note the time the symptoms started, or when the crew member was last known well.");
    expect(by("time").detail).toBe("Reported by the crew, not measured: vital signs cannot show a stroke.");
    expect(by("checklist").detail).toMatch(/“Time to call”/);
    expect(p.steps.map((s) => s.id)).toEqual(["fast", "time", "rest", "checklist", "surgeon", "recheck"]);
  });

  it("seizure: CDC first aid for seizures", () => {
    const p = buildProtocol("seizure", { commDelaySeconds: 0.5, missionName: "ISS" });
    expect(p.title).toBe("Seizure (convulsions)");
    const all = p.steps.map((s) => s.text).join(" ");
    expect(all).toMatch(/Stay with the crew member/);
    expect(all).toMatch(/Time the seizure/);
    expect(all).toMatch(/Keep them safe from injury/);
    expect(all).toMatch(/Do not put anything in their mouth\. Do not hold them down\./);
    expect(all).toMatch(/When the seizure ends, turn them on their side\./);
    expect(all).toMatch(/A first seizure, a seizure longer than 5 minutes, a second seizure, trouble breathing or waking afterwards, or an injury is an emergency/);
  });

  it("microgravity adaptations are labelled as project text; the restraint only as the onboard procedure directs", () => {
    const stroke = buildProtocol("stroke", { commDelaySeconds: 0.5, missionName: "ISS" });
    const seizure = buildProtocol("seizure", { commDelaySeconds: 0.5, missionName: "ISS" });
    for (const s of [...stroke.steps, ...seizure.steps]) {
      const t = `${s.text} ${s.detail ?? ""}`;
      if (/microgravity|drift|Crew Medical Restraint System/i.test(t)) expect(t, s.id).toMatch(/Microgravity \(project text\):/);
    }
    const safe = seizure.steps.find((s) => s.id === "safe")!;
    expect(safe.detail).toContain("keep them from drifting into hardware");
    expect(safe.detail).toContain("without holding them down");
    expect(safe.detail).not.toMatch(/Restraint System/);
  });

  it("live and delayed links contact the flight surgeon", () => {
    for (const delay of [0.5, 750]) {
      expect(texts("stroke", delay)).toContain("Follow the onboard medical checklist for stroke signs.");
      expect(texts("seizure", delay)).toContain(
        "A first seizure, a seizure longer than 5 minutes, a second seizure, trouble breathing or waking afterwards, or an injury is an emergency: follow the onboard medical checklist.",
      );
    }
  });

  it("blackout: act on the onboard procedures and transmit when contact returns", () => {
    for (const commDelaySeconds of [null, LINK_PROFILES.conjunction.oneWayS]) {
      for (const type of ["stroke", "seizure"] as const) {
        const p = buildProtocol(type, { commDelaySeconds, missionName: "Mars solar conjunction" });
        expect(p.mode).toBe("blackout");
        for (const s of p.steps) {
          expect(s.text, `${type}/${s.id}`).not.toMatch(BANNED_IN_BLACKOUT);
          if (s.detail) expect(s.detail, `${type}/${s.id}`).not.toMatch(BANNED_IN_BLACKOUT);
        }
        const all = p.steps.map((s) => `${s.text} ${s.detail ?? ""}`).join(" ");
        expect(all).toContain("act on the onboard procedures; transmit when contact returns");
      }
    }
  });

  it("no medicine, dose or amount and no banned wording in the new texts", () => {
    const strings = [
      ...texts("stroke", 0.5),
      ...texts("stroke", null),
      ...texts("seizure", 0.5),
      ...texts("seizure", null),
      ...DRILL_BUTTONS.slice(3).flatMap((b) => [b.label, b.effect]),
      SCENARIO_LABEL.stroke,
      SCENARIO_LABEL.seizure,
      STROKE_ALARM_TEXT,
      SEIZURE_ALARM_TEXT,
      SEIZURE_ENDED_ALARM_TEXT,
      buildProtocol("stroke", { commDelaySeconds: 0.5, missionName: "ISS" }).title,
      buildProtocol("seizure", { commDelaySeconds: 0.5, missionName: "ISS" }).title,
    ];
    for (const s of strings) {
      expect(s).not.toMatch(MEDICINE);
      expect(s).not.toMatch(WORDING);
    }
  });
});

describe("waveform motion artefact", () => {
  const BASE: SynthParams = { hr: 120, rhythm: "sinus-tachycardia", stMm: 0, pvcPerMin: 0, sys: 150, dia: 90, spo2: 90, resp: 24 };
  function spread(p: SynthParams) {
    const synth = new WaveSynth(p, 3);
    const ch = { ecg: [] as number[], pleth: [] as number[], resp: [] as number[] };
    for (let i = 0; i < 250 * 6; i++) {
      const s = synth.sample(100 + i / 250);
      ch.ecg.push(s.ecg);
      ch.pleth.push(s.pleth);
      ch.resp.push(s.resp);
    }
    const sd = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    return { ecg: sd(ch.ecg), pleth: sd(ch.pleth), resp: sd(ch.resp), raw: ch };
  }

  it("the seizure drill's vitals carry the artefact to the synthesiser", () => {
    expect(paramsFromVitals(vitals("seizure", 60)).motion).toBe(1);
    expect(paramsFromVitals(vitals("stroke", 60)).motion).toBe(0);
  });

  it("an artefact changes ECG, pleth and resp; no artefact leaves the trace exactly as before", () => {
    const still = spread(BASE);
    const zero = spread({ ...BASE, motion: 0 });
    expect(zero.raw).toEqual(still.raw);
    const moving = spread({ ...BASE, motion: 1 });
    expect(moving.ecg).toBeGreaterThan(still.ecg * 1.2);
    // Mean distance from the still trace (same beats: the scheduler has its own random stream).
    const dist = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0) / a.length;
    expect(dist(moving.raw.ecg, still.raw.ecg)).toBeGreaterThan(0.1);
    expect(dist(moving.raw.pleth, still.raw.pleth)).toBeGreaterThan(0.1);
    expect(dist(moving.raw.resp, still.raw.resp)).toBeGreaterThan(0.2);
    for (const v of moving.raw.ecg) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("POST /api/scenarios accepts the new drills (crew ms2, always ended)", () => {
  const HOST = "localhost:3396";
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-drills-"));
    vi.stubEnv("DEMIFY_DATA_DIR", dir);
    vi.stubEnv("DEMIFY_SIMULATE", "false");
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
    delete (globalThis as { __demifyScenarios?: unknown }).__demifyScenarios;
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    delete (globalThis as { __demifyScenarios?: unknown }).__demifyScenarios;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const post = (type: string) =>
    new Request(`http://${HOST}/api/scenarios`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json" },
      body: JSON.stringify({ crewId: "ms2", type }),
    });
  const end = () => new Request(`http://${HOST}/api/scenarios?crewId=ms2`, { method: "DELETE", headers: { host: HOST } });

  it("starts and ends a stroke and a seizure drill; unknown types stay rejected", async () => {
    const { POST, GET, DELETE } = await import("@/app/api/scenarios/route");
    for (const type of ["stroke", "seizure"]) {
      const res = await POST(post(type));
      expect(res.status, type).toBe(201);
      expect(((await res.json()) as { scenario: Scenario }).scenario).toMatchObject({ crewId: "ms2", type });
      const list = (await (await GET()).json()) as { scenarios: Scenario[] };
      expect(list.scenarios.map((s) => `${s.crewId}:${s.type}`)).toEqual([`ms2:${type}`]);
      expect((await DELETE(end())).status).toBe(200);
      expect(((await (await GET()).json()) as { scenarios: Scenario[] }).scenarios).toEqual([]);
    }
    expect((await POST(post("heatstroke"))).status).toBe(400);
  });
});
