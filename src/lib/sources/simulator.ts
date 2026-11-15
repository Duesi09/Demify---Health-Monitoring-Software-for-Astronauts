import "server-only";
import { config } from "../config";
import { SEIZURE_ACTIVE_S } from "../monitor/drills";
import type { CrewMember, IndicatorId, Reading, Rhythm, Scenario, ScenarioType } from "../types";

/**
 * Demo telemetry generator for continuous wearable signals (heart rate, blood
 * pressure, SpO2, temperature, respiration).
 *
 * WHY: there is no public real-time feed of astronaut vitals (crew medical
 * data is protected). Real devices push to POST /api/readings; until they
 * do, this generator produces physiologically plausible, deterministic
 * signals around each crew member's pre-flight baseline. Every value is
 * tagged source="simulated" and labelled in the UI. Disable with
 * DEMIFY_SIMULATE=false.
 *
 * Modelled spaceflight effects (see knowledge base for sources):
 *  - circadian HR/BP/temperature rhythm
 *  - exercise blocks (ARED/treadmill) raise HR
 *  - headward fluid shift: slightly lower systolic BP in microgravity
 *  - one scripted anomaly per crew for demonstration
 */

const STEP_MIN = 10;

// Deterministic pseudo-random noise so charts are stable between reloads.
function hash(n: number): number {
  let x = Math.sin(n * 12.9898) * 43758.5453;
  x -= Math.floor(x);
  return x * 2 - 1; // -1..1
}

function seedOf(id: string) {
  let s = 0;
  for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) % 100_000;
  return s;
}

interface Signal {
  indicator: IndicatorId;
  unit: string;
  value: (ctx: Ctx) => number;
  decimals: number;
}

interface Ctx {
  crew: CrewMember;
  t: number; // epoch ms
  hourUtc: number;
  noise: (k: number) => number;
  exercising: boolean;
  sleeping: boolean;
  anomaly: number; // 0..1 intensity of scripted anomaly for this crew
}

const SIGNALS: Signal[] = [
  {
    indicator: "heartRate",
    unit: "bpm",
    decimals: 0,
    value: (c) => {
      const base = c.crew.baseline.heartRate ?? 62;
      const circ = 5 * Math.sin(((c.hourUtc - 9) / 24) * 2 * Math.PI);
      const ex = c.exercising ? 55 : 0;
      const sleep = c.sleeping ? -8 : 0;
      const anomaly = c.crew.id === "ms1" ? 22 * c.anomaly : 0;
      return base + circ + ex + sleep + anomaly + 3 * c.noise(1);
    },
  },
  {
    indicator: "systolicBP",
    unit: "mmHg",
    decimals: 0,
    value: (c) => {
      const base = (c.crew.baseline.systolicBP ?? 118) - 4; // fluid shift
      const circ = 6 * Math.sin(((c.hourUtc - 10) / 24) * 2 * Math.PI);
      const ex = c.exercising ? 25 : 0;
      const sleep = c.sleeping ? -10 : 0;
      const anomaly = c.crew.id === "plt" ? 24 * c.anomaly : 0;
      return base + circ + ex + sleep + anomaly + 4 * c.noise(2);
    },
  },
  {
    indicator: "diastolicBP",
    unit: "mmHg",
    decimals: 0,
    value: (c) => {
      const base = c.crew.baseline.diastolicBP ?? 76;
      const circ = 4 * Math.sin(((c.hourUtc - 10) / 24) * 2 * Math.PI);
      const sleep = c.sleeping ? -7 : 0;
      const anomaly = c.crew.id === "plt" ? 12 * c.anomaly : 0;
      return base + circ + sleep + anomaly + 3 * c.noise(3);
    },
  },
  {
    indicator: "spo2",
    unit: "%",
    decimals: 0,
    value: (c) => Math.min(100, (c.crew.baseline.spo2 ?? 98) + 0.8 * c.noise(4) - (c.exercising ? 1 : 0)),
  },
  {
    indicator: "bodyTemp",
    unit: "°C",
    decimals: 1,
    value: (c) => {
      const base = c.crew.baseline.bodyTemp ?? 36.7;
      // Core temperature runs ~0.5–1 °C higher in microgravity (Stahn 2017).
      const micro = 0.2;
      const circ = 0.35 * Math.sin(((c.hourUtc - 16) / 24) * 2 * Math.PI);
      const ex = c.exercising ? 0.6 : 0;
      return base + micro + circ + ex + 0.08 * c.noise(5);
    },
  },
  {
    indicator: "respRate",
    unit: "/min",
    decimals: 0,
    value: (c) => 14 + (c.exercising ? 10 : 0) + (c.sleeping ? -2 : 0) + 1.5 * c.noise(6),
  },
  {
    indicator: "stDeviation",
    unit: "mm",
    decimals: 1,
    // Healthy ECG: isoelectric ST segment with small measurement noise.
    value: (c) => 0.1 * c.noise(7),
  },
];

/**
 * Healthy crew (config.healthyCrew): resting and sleeping vital signs stay in
 * the middle of their nominal ranges (knowledge.ts), so noise never tips a
 * value into "caution". Workout values keep their normal rise.
 */
const HEALTHY_VITALS: Partial<Record<IndicatorId, [number, number]>> = {
  heartRate: [56, 92],
  systolicBP: [102, 124],
  diastolicBP: [62, 76],
  spo2: [96, 100],
  bodyTemp: [36.4, 37.6],
  respRate: [13, 18],
};
function healthyVital(indicator: IndicatorId, v: number, exercising: boolean): number {
  const band = config.healthyCrew && !exercising ? HEALTHY_VITALS[indicator] : undefined;
  return band ? Math.min(band[1], Math.max(band[0], v)) : v;
}

function context(crew: CrewMember, t: number): Ctx {
  const seed = seedOf(crew.id);
  const step = Math.floor(t / (STEP_MIN * 60_000));
  const date = new Date(t);
  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60;
  // Each crew exercises 1.5 h/day in a slot offset by crew seed.
  const exStart = 8 + (seed % 8);
  const exercising = hourUtc >= exStart && hourUtc < exStart + 1.5;
  const sleeping = hourUtc >= 21.5 || hourUtc < 6;
  // Scripted anomaly ramps up over the last 6 h.
  const hoursAgo = (Date.now() - t) / 3_600_000;
  const anomaly = config.healthyCrew ? 0 : Math.max(0, Math.min(1, (6 - hoursAgo) / 6));
  return {
    crew,
    t,
    hourUtc,
    exercising,
    sleeping,
    anomaly,
    noise: (k) => hash(seed * 7 + step * 13 + k * 101),
  };
}

/** Simulated readings for one crew member from `from` to `to` (epoch ms). */
export function simulateSeries(
  crew: CrewMember,
  from: number,
  to: number = Date.now(),
): Reading[] {
  const out: Reading[] = [];
  const stepMs = STEP_MIN * 60_000;
  const start = Math.ceil(from / stepMs) * stepMs;
  for (let t = start; t <= to; t += stepMs) {
    const ctx = context(crew, t);
    for (const s of SIGNALS) {
      const v = healthyVital(s.indicator, s.value(ctx), ctx.exercising);
      out.push({
        id: `sim-${crew.id}-${s.indicator}-${t}`,
        crewId: crew.id,
        indicator: s.indicator,
        value: Number(v.toFixed(s.decimals)),
        unit: s.unit,
        takenAt: new Date(t).toISOString(),
        source: "simulated",
        ...(ctx.exercising ? { note: "exercise" } : {}),
      });
    }
  }
  return out;
}

export const SIMULATED_INDICATORS = SIGNALS.map((s) => s.indicator);

/* ------------------------------------------------------------------------- */
/* Daily self-check-in demo data (sleep, mood, nutrition, exercise ...).      */
/* Scripted stories so the demo shows realistic problems:                     */
/*   cdr  – stress creeping up over the last week (workload)                  */
/*   ms2  – accumulating sleep debt                                           */
/*   plt  – under-drinking, mild body-mass loss                               */
/* ------------------------------------------------------------------------- */

interface DailyDef {
  indicator: IndicatorId;
  unit: string;
  hourUtc: number;
  decimals: number;
  value: (crew: CrewMember, day: number, daysAgo: number, n: (k: number) => number) => number;
}

/**
 * Healthy crew (config.healthyCrew): steady daily values in the middle of their
 * nominal ranges (knowledge.ts), with little day-to-day noise, so no trend rule
 * (mood drop, stress rise) fires either.
 */
const HEALTHY_DAILY: Partial<Record<IndicatorId, (c: CrewMember, n: (k: number) => number) => number>> = {
  sleepHours: (_c, n) => 7.9 + 0.3 * n(1),
  mood: (_c, n) => 8 + 0.4 * n(2),
  stress: (_c, n) => 2.4 + 0.4 * n(3),
  glucose: (c, n) => Math.min(94, c.baseline.glucose ?? 90) + 2 * n(4),
  hydration: (_c, n) => 3.0 + 0.2 * n(5),
  exerciseMinutes: (_c, n) => 108 + 8 * n(6),
  bodyMassChange: (_c, n) => -0.8 + 0.2 * n(7),
  visionChange: () => 0,
  boneLoss: (_c, n) => 0.6 + 0.05 * n(8),
  cabinCO2: (_c, n) => 2.0 + 0.1 * n(9),
};

/** A scripted health story for this crew member (off with the healthy crew, config.healthyCrew). */
const story = (c: CrewMember, id: string) => !config.healthyCrew && c.id === id;

const DAILY: DailyDef[] = [
  {
    indicator: "sleepHours", unit: "h", hourUtc: 6.5, decimals: 1,
    value: (c, _d, ago, n) => (story(c, "ms2") ? 7 - Math.max(0, 8 - ago) * 0.25 : 7.3) + 0.5 * n(1),
  },
  {
    indicator: "mood", unit: "/10", hourUtc: 7, decimals: 0,
    value: (c, _d, ago, n) => (story(c, "ms2") && ago < 4 ? 5 : 7) + 1.2 * n(2),
  },
  {
    indicator: "stress", unit: "/10", hourUtc: 7, decimals: 0,
    value: (c, _d, ago, n) => (story(c, "cdr") ? 3 + Math.max(0, 7 - ago) * 0.55 : 3) + 0.8 * n(3),
  },
  {
    indicator: "glucose", unit: "mg/dL", hourUtc: 7.2, decimals: 0,
    value: (c, _d, _a, n) => (c.baseline.glucose ?? 90) + 3 * n(4),
  },
  {
    indicator: "hydration", unit: "L", hourUtc: 20, decimals: 1,
    value: (c, _d, _a, n) => (story(c, "plt") ? 1.9 : 2.7) + 0.3 * n(5),
  },
  {
    indicator: "exerciseMinutes", unit: "min", hourUtc: 20, decimals: 0,
    value: (c, day, _a, n) => (day % 7 === 6 ? 45 : 100) + 12 * n(6),
  },
  {
    indicator: "bodyMassChange", unit: "%", hourUtc: 7.5, decimals: 1,
    value: (c, _d, _a, n) => (story(c, "plt") ? -3.1 : -1.2) + 0.2 * n(7),
  },
  {
    indicator: "visionChange", unit: "/3", hourUtc: 7.5, decimals: 0,
    value: (c) => (story(c, "cdr") ? 1 : 0),
  },
  {
    indicator: "boneLoss", unit: "%/month", hourUtc: 20.5, decimals: 1,
    value: (_c, _d, _a, n) => 0.7 + 0.1 * n(8),
  },
  {
    indicator: "cabinCO2", unit: "mmHg", hourUtc: 12, decimals: 1,
    value: (_c, _d, ago, n) => (ago < 1 ? 2.7 : 2.2) + 0.15 * n(9),
  },
];

export function simulateDaily(crew: CrewMember, from: number, to: number = Date.now()): Reading[] {
  const seed = seedOf(crew.id);
  const out: Reading[] = [];
  const dayMs = 86_400_000;
  for (let dayStart = Math.floor(from / dayMs) * dayMs; dayStart <= to; dayStart += dayMs) {
    const day = Math.floor(dayStart / dayMs);
    const daysAgo = Math.floor((to - dayStart) / dayMs);
    for (const d of DAILY) {
      const t = dayStart + d.hourUtc * 3_600_000;
      if (t < from || t > to) continue;
      const noise = (k: number) => hash(seed * 3 + day * 17 + k * 7);
      const healthy = config.healthyCrew ? HEALTHY_DAILY[d.indicator] : undefined;
      const def = healthy ? healthy(crew, noise) : d.value(crew, day, daysAgo, noise);
      const [lo, hi] = d.indicator === "mood" || d.indicator === "stress" ? [1, 10] : [-100, 1e6];
      const v = Math.min(hi, Math.max(lo, def));
      out.push({
        id: `sim-${crew.id}-${d.indicator}-${t}`,
        crewId: crew.id,
        indicator: d.indicator,
        value: Number(v.toFixed(d.decimals)),
        unit: d.unit,
        takenAt: new Date(t).toISOString(),
        source: "simulated",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Live vitals + emergency training scenarios                                 */
/* ------------------------------------------------------------------------- */

export const SCENARIO_LABEL: Record<ScenarioType, string> = {
  stemi: "Acute myocardial infarction (STEMI)",
  vf: "Cardiac arrest (ventricular fibrillation)",
  "hypertensive-crisis": "Hypertensive crisis",
  stroke: "Stroke signs reported (F.A.S.T.)",
  seizure: "Seizure with convulsions",
};

/** Instantaneous physiological state; null = not measurable (no pulse). */
export interface PhysioState {
  activity: "rest" | "exercise" | "sleep";
  hr: number | null;
  rhythm: Rhythm;
  stMm: number;
  pvcPerMin: number;
  /** Motion artefact on the waveforms, 0..1 (convulsions in the seizure drill). */
  motion: number;
  sys: number | null;
  dia: number | null;
  spo2: number | null;
  resp: number | null;
  temp: number;
}

/** Smooth beat-to-beat variability (a few bpm / mmHg), continuous in time. */
function jitter(seed: number, t: number, k: number): number {
  const s = t / 1000;
  return (
    Math.sin(s * 0.21 + seed * 0.7 + k) * 0.6 +
    Math.sin(s * 0.53 + seed * 1.3 + k * 2.1) * 0.3 +
    Math.sin(s * 1.37 + seed * 0.11 + k * 3.7) * 0.1
  );
}

const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.min(1, Math.max(0, x));
/** 0 -> 1 between t0 and t1 seconds, eased. */
function ramp(elapsed: number, t0: number, t1: number): number {
  const x = Math.min(1, Math.max(0, (elapsed - t0) / (t1 - t0)));
  return x * x * (3 - 2 * x);
}

/** Normal (scenario-free) state for this crew member at time t. */
export function baseState(crew: CrewMember, t: number): PhysioState {
  const ctx = context(crew, t);
  const seed = seedOf(crew.id);
  const val = (id: IndicatorId) => SIGNALS.find((s) => s.indicator === id)!.value(ctx);
  const hv = (id: IndicatorId, v: number) => healthyVital(id, v, ctx.exercising);
  const hr = hv("heartRate", val("heartRate") + 2 * jitter(seed, t, 1));
  return {
    activity: ctx.exercising ? "exercise" : ctx.sleeping ? "sleep" : "rest",
    hr,
    rhythm: hr > 100 ? "sinus-tachycardia" : hr < 50 ? "sinus-bradycardia" : "sinus",
    stMm: 0.05 * jitter(seed, t, 7),
    pvcPerMin: 0,
    motion: 0,
    sys: hv("systolicBP", val("systolicBP") + 2 * jitter(seed, t, 2)),
    dia: hv("diastolicBP", val("diastolicBP") + 1.5 * jitter(seed, t, 3)),
    spo2: hv("spo2", Math.min(100, val("spo2") + 0.5 * jitter(seed, t, 4))),
    resp: hv("respRate", val("respRate") + jitter(seed, t, 6)),
    temp: hv("bodyTemp", val("bodyTemp")),
  };
}

/**
 * Overlays a training scenario on the normal state. Time courses are
 * simplified from typical clinical presentations; they are meant for drills,
 * not as a physiological model.
 */
export function applyScenario(base: PhysioState, scenario: Scenario, t: number, seed = 0): PhysioState {
  const e = Math.max(0, (t - Date.parse(scenario.startedAt)) / 1000);
  const s: PhysioState = { ...base, activity: "rest" };
  switch (scenario.type) {
    case "stemi": {
      // Onset (0-20 s): ST rises, sympathetic surge. Established (20-120 s):
      // ST elevation ~3 mm, sinus tachycardia, PVCs, falling pressure and
      // saturation. After ~3 min: drifting towards cardiogenic shock.
      const a = ramp(e, 0, 20);
      const b = ramp(e, 20, 120);
      const c = ramp(e, 150, 420);
      const hr0 = base.hr ?? 70;
      s.hr = lerp(hr0, 104, a) + (118 - 104) * b + 10 * c + 3 * jitter(seed, t, 11);
      s.stMm = lerp(base.stMm, 1.6, a) + (3.2 - 1.6) * b + 0.15 * jitter(seed, t, 12);
      s.pvcPerMin = Math.round(lerp(0, 4, a) + 6 * b + 6 * c);
      s.sys = lerp(base.sys ?? 115, 108, a) - (108 - 94) * b - 14 * c + 2 * jitter(seed, t, 13);
      s.dia = lerp(base.dia ?? 75, 70, a) - (70 - 61) * b - 8 * c + 1.5 * jitter(seed, t, 14);
      s.spo2 = lerp(base.spo2 ?? 98, 95, a) - (95 - 91) * b - 3 * c + 0.4 * jitter(seed, t, 15);
      s.resp = lerp(base.resp ?? 14, 22, a) + 4 * b + 4 * c + jitter(seed, t, 16);
      s.rhythm = (s.hr ?? 0) > 100 ? "sinus-tachycardia" : "sinus";
      break;
    }
    case "vf": {
      // Collapse within seconds: chaotic rhythm, no cardiac output.
      const a = ramp(e, 0, 6);
      s.rhythm = e < 2 ? "vt" : "vf";
      s.hr = e < 2 ? 190 : null;
      s.stMm = 0;
      s.pvcPerMin = 0;
      s.sys = e < 2 ? lerp(base.sys ?? 115, 60, a) : null;
      s.dia = e < 2 ? lerp(base.dia ?? 75, 35, a) : null;
      s.spo2 = e < 4 ? lerp(base.spo2 ?? 98, 85, a) : null;
      s.resp = e < 20 ? lerp(base.resp ?? 14, 4, ramp(e, 0, 20)) : 0;
      break;
    }
    case "hypertensive-crisis": {
      const a = ramp(e, 0, 45);
      s.sys = lerp(base.sys ?? 118, 196, a) + 3 * jitter(seed, t, 21);
      s.dia = lerp(base.dia ?? 76, 124, a) + 2 * jitter(seed, t, 22);
      s.hr = lerp(base.hr ?? 65, 98, a) + 2 * jitter(seed, t, 23);
      s.resp = lerp(base.resp ?? 14, 20, a) + jitter(seed, t, 24);
      s.rhythm = (s.hr ?? 0) > 100 ? "sinus-tachycardia" : "sinus";
      break;
    }
    case "stroke": {
      // A stroke cannot be recognised from vital signs: the drill is a crew
      // report of F.A.S.T. signs (American Stroke Association). The monitor
      // stays plausible: blood pressure raised, everything else near
      // baseline. The alarm comes from the report (see monitor/alarms.ts).
      const a = ramp(e, 0, 60);
      s.sys = lerp(base.sys ?? 118, 168, a) + 3 * jitter(seed, t, 31);
      s.dia = lerp(base.dia ?? 76, 96, a) + 2 * jitter(seed, t, 32);
      s.hr = lerp(base.hr ?? 65, (base.hr ?? 65) + 8, a) + 2 * jitter(seed, t, 33);
      s.rhythm = (s.hr ?? 0) > 100 ? "sinus-tachycardia" : "sinus";
      break;
    }
    case "seizure": {
      // Convulsions for SEIZURE_ACTIVE_S (bounded, under the 5-minute
      // emergency limit of the CDC first-aid guidance): tachycardia, raised
      // pressure, falling SpO2, irregular breathing and motion artefact on
      // ECG / pleth / resp. Afterwards recovery values: the rate and pressure
      // settle over minutes, SpO2 recovers, breathing is deep and regular.
      const hr0 = base.hr ?? 65;
      const sys0 = base.sys ?? 118;
      const dia0 = base.dia ?? 76;
      const spo20 = base.spo2 ?? 98;
      const resp0 = base.resp ?? 14;
      if (e < SEIZURE_ACTIVE_S) {
        const a = ramp(e, 0, 25);
        const b = ramp(e, 20, SEIZURE_ACTIVE_S);
        s.hr = lerp(hr0, 128, a) + 10 * b + 5 * jitter(seed, t, 41);
        s.sys = lerp(sys0, 150, a) + 6 * b + 4 * jitter(seed, t, 42);
        s.dia = lerp(dia0, 90, a) + 3 * b + 3 * jitter(seed, t, 43);
        s.spo2 = lerp(spo20, 93, a) - (93 - 85) * b + 0.8 * jitter(seed, t, 44);
        s.resp = lerp(resp0, 24, a) + 6 * jitter(seed, t, 45);
        s.motion = ramp(e, 0, 4);
      } else {
        const r = e - SEIZURE_ACTIVE_S;
        const hrEnd = hr0 + 12;
        s.hr = hrEnd + (138 - hrEnd) * Math.exp(-r / 90) + 2 * jitter(seed, t, 41);
        s.sys = sys0 + 8 + (156 - sys0 - 8) * Math.exp(-r / 120) + 3 * jitter(seed, t, 42);
        s.dia = dia0 + 4 + (93 - dia0 - 4) * Math.exp(-r / 120) + 2 * jitter(seed, t, 43);
        s.spo2 = spo20 - 1 - (spo20 - 1 - 85) * Math.exp(-r / 40) + 0.4 * jitter(seed, t, 44);
        s.resp = resp0 + 4 + 8 * Math.exp(-r / 60) + jitter(seed, t, 45);
        s.motion = 1 - ramp(r, 0, 4);
      }
      s.spo2 = Math.min(100, s.spo2);
      s.rhythm = (s.hr ?? 0) > 100 ? "sinus-tachycardia" : "sinus";
      break;
    }
  }
  return s;
}

export function physioAt(crew: CrewMember, t: number, scenario: Scenario | null): PhysioState {
  const base = baseState(crew, t);
  return scenario ? applyScenario(base, scenario, t, seedOf(crew.id)) : base;
}

const LIVE_SIGNALS: Array<[IndicatorId, keyof PhysioState, string, number]> = [
  ["heartRate", "hr", "bpm", 0],
  ["systolicBP", "sys", "mmHg", 0],
  ["diastolicBP", "dia", "mmHg", 0],
  ["spo2", "spo2", "%", 0],
  ["respRate", "resp", "/min", 0],
  ["bodyTemp", "temp", "°C", 1],
  ["stDeviation", "stMm", "mm", 1],
];

/**
 * One "live" sample at time t for every continuous signal, so assessments
 * react within seconds (the 10-minute series alone would hide an acute event).
 * Scenario samples are tagged note="scenario:<type>"; the assessment engine
 * uses them directly instead of the 60-minute median.
 * When there is no pulse (VF) HR is reported as 0 and SpO2 is omitted.
 */
export function simulateLive(crew: CrewMember, t: number, scenario: Scenario | null): Reading[] {
  const st = physioAt(crew, t, scenario);
  // Exercise samples must never be judged as resting vitals (see assess.ts).
  const note = scenario ? `scenario:${scenario.type}` : st.activity === "exercise" ? "exercise" : "live";
  const out: Reading[] = [];
  for (const [indicator, key, unit, decimals] of LIVE_SIGNALS) {
    let v = st[key] as number | null;
    if (v == null) {
      if (indicator === "heartRate") v = 0;
      else if (indicator === "systolicBP" || indicator === "diastolicBP") v = 0;
      else continue;
    }
    out.push({
      id: `live-${crew.id}-${indicator}-${t}`,
      crewId: crew.id,
      indicator,
      value: Number(v.toFixed(decimals)),
      unit,
      takenAt: new Date(t).toISOString(),
      source: "simulated",
      note,
    });
  }
  return out;
}
