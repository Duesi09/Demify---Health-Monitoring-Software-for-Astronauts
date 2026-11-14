import "server-only";
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
  const anomaly = Math.max(0, Math.min(1, (6 - hoursAgo) / 6));
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
      const v = s.value(ctx);
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

const DAILY: DailyDef[] = [
  {
    indicator: "sleepHours", unit: "h", hourUtc: 6.5, decimals: 1,
    value: (c, _d, ago, n) => (c.id === "ms2" ? 7 - Math.max(0, 8 - ago) * 0.25 : 7.3) + 0.5 * n(1),
  },
  {
    indicator: "mood", unit: "/10", hourUtc: 7, decimals: 0,
    value: (c, _d, ago, n) => (c.id === "ms2" && ago < 4 ? 5 : 7) + 1.2 * n(2),
  },
  {
    indicator: "stress", unit: "/10", hourUtc: 7, decimals: 0,
    value: (c, _d, ago, n) => (c.id === "cdr" ? 3 + Math.max(0, 7 - ago) * 0.55 : 3) + 0.8 * n(3),
  },
  {
    indicator: "glucose", unit: "mg/dL", hourUtc: 7.2, decimals: 0,
    value: (c, _d, _a, n) => (c.baseline.glucose ?? 90) + 3 * n(4),
  },
  {
    indicator: "hydration", unit: "L", hourUtc: 20, decimals: 1,
    value: (c, _d, _a, n) => (c.id === "plt" ? 1.9 : 2.7) + 0.3 * n(5),
  },
  {
    indicator: "exerciseMinutes", unit: "min", hourUtc: 20, decimals: 0,
    value: (c, day, _a, n) => (day % 7 === 6 ? 45 : 100) + 12 * n(6),
  },
  {
    indicator: "bodyMassChange", unit: "%", hourUtc: 7.5, decimals: 1,
    value: (c, _d, _a, n) => (c.id === "plt" ? -3.1 : -1.2) + 0.2 * n(7),
  },
  {
    indicator: "visionChange", unit: "/3", hourUtc: 7.5, decimals: 0,
    value: (c) => (c.id === "cdr" ? 1 : 0),
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
      const def = d.value(crew, day, daysAgo, (k) => hash(seed * 3 + day * 17 + k * 7));
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
};

/** Instantaneous physiological state; null = not measurable (no pulse). */
export interface PhysioState {
  activity: "rest" | "exercise" | "sleep";
  hr: number | null;
  rhythm: Rhythm;
  stMm: number;
  pvcPerMin: number;
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
  const hr = val("heartRate") + 2 * jitter(seed, t, 1);
  return {
    activity: ctx.exercising ? "exercise" : ctx.sleeping ? "sleep" : "rest",
    hr,
    rhythm: hr > 100 ? "sinus-tachycardia" : hr < 50 ? "sinus-bradycardia" : "sinus",
    stMm: 0.05 * jitter(seed, t, 7),
    pvcPerMin: 0,
    sys: val("systolicBP") + 2 * jitter(seed, t, 2),
    dia: val("diastolicBP") + 1.5 * jitter(seed, t, 3),
    spo2: Math.min(100, val("spo2") + 0.5 * jitter(seed, t, 4)),
    resp: val("respRate") + jitter(seed, t, 6),
    temp: val("bodyTemp"),
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
  const note = scenario ? `scenario:${scenario.type}` : "live";
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
