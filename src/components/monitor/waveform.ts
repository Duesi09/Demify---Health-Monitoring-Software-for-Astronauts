import type { LiveVitals, Rhythm } from "@/lib/types";

/**
 * Waveform synthesis for the demo patient monitor.
 *
 * The telemetry only carries numbers (HR, rhythm, ST deviation, PVC rate,
 * ABP, SpO2, resp). Like a monitor simulator, we synthesise plausible
 * waveforms from them: a beat scheduler places R waves, each beat adds a
 * PQRST complex (sum of Gaussians), ABP and pleth pulses follow each
 * perfusing beat with a physiological delay, resp is a sine at the resp rate.
 *
 * Everything here is pure / deterministic given a seed, so it is unit-tested
 * (tests/monitor-waveform.test.ts) and safe to import on server or client.
 * Units: ECG in mV (1 mm = 0.1 mV at standard gain), ABP in mmHg, pleth and
 * resp are normalised (0..1 and -1..1).
 */

export type BeatKind = "sinus" | "pvc" | "vt";

export interface Beat {
  /** Time of the R peak (s). */
  t: number;
  kind: BeatKind;
  /** Nominal RR interval used for this beat (s). */
  rr: number;
  /** Whether the beat ejects blood (produces an ABP / pleth pulse). */
  perfusing: boolean;
}

export interface SynthParams {
  hr: number | null;
  rhythm: Rhythm;
  stMm: number;
  pvcPerMin: number;
  sys: number | null;
  dia: number | null;
  spo2: number | null;
  resp: number | null;
}

export interface WaveSample {
  ecg: number;
  abp: number;
  pleth: number;
  resp: number;
}

/** Delay from R peak to the arterial upstroke (s). */
export const ABP_DELAY_S = 0.15;
/** Delay from R peak to the peripheral pleth upstroke (s). */
export const PLETH_DELAY_S = 0.25;
/** Default ventricular rate when VT is reported without a number. */
export const VT_DEFAULT_RATE = 190;

export function paramsFromVitals(v: LiveVitals): SynthParams {
  return {
    hr: v.hr,
    rhythm: v.rhythm,
    stMm: v.stMm,
    pvcPerMin: v.pvcPerMin,
    sys: v.sys,
    dia: v.dia,
    spo2: v.spo2,
    resp: v.resp,
  };
}

/* ------------------------------------------------------------------------- */
/* Small math helpers                                                         */
/* ------------------------------------------------------------------------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------------- */
/* ECG complexes (dt = seconds relative to the R peak)                        */
/* ------------------------------------------------------------------------- */

/**
 * Normal sinus PQRST on lead II. `stMm` raises the ST segment from the J
 * point into the T wave (and makes T hyperacute), as in an evolving STEMI.
 * QT shortens with rate (Bazett-like sqrt(RR) scaling).
 */
export function sinusComplex(dt: number, rr: number, stMm = 0): number {
  if (dt < -0.3 || dt > 0.7) return 0;
  const q = Math.sqrt(clamp(rr, 0.3, 1.6));
  const tCenter = 0.24 * q + 0.03;
  const st = stMm * 0.1; // mm -> mV
  const p = 0.12 * gauss(dt, -0.16 * Math.min(1, q + 0.05), 0.022);
  const qWave = -0.08 * gauss(dt, -0.028, 0.008);
  const r = 1.1 * gauss(dt, 0, 0.011);
  const s = -0.22 * gauss(dt, 0.028, 0.01);
  const t = (0.28 + Math.max(0, st) * 0.4) * gauss(dt, tCenter, 0.055);
  const stSeg = st * smoothstep(0.02, 0.05, dt) * (1 - smoothstep(tCenter, tCenter + 0.13, dt));
  return p + qWave + r + s + t + stSeg;
}

/** Premature ventricular complex: no P wave, wide bizarre QRS, discordant T. */
export function pvcComplex(dt: number): number {
  if (dt < -0.2 || dt > 0.6) return 0;
  return 1.3 * gauss(dt, 0, 0.035) - 0.55 * gauss(dt, 0.075, 0.035) - 0.4 * gauss(dt, 0.32, 0.07);
}

/** Monomorphic VT complex: wide, regular, fast. */
export function vtComplex(dt: number, rr: number): number {
  if (dt < -0.15 || dt > 0.5) return 0;
  return 1.0 * gauss(dt, 0, 0.04) - 0.7 * gauss(dt, 0.09, 0.045) - 0.25 * gauss(dt, Math.min(0.22, rr * 0.6), 0.05);
}

/**
 * Ventricular fibrillation: chaotic, irregular undulation with no
 * identifiable QRS. Deterministic in t (sum of frequency-modulated sines
 * with a slowly varying envelope), amplitude well below a normal R wave.
 */
export function vfSignal(t: number): number {
  const env = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.23 * t + 0.7 * Math.sin(2 * Math.PI * 0.07 * t));
  const a = 0.32 * Math.sin(2 * Math.PI * 5.1 * t + 1.3 * Math.sin(2 * Math.PI * 0.37 * t));
  const b = 0.18 * Math.sin(2 * Math.PI * 6.7 * t + 2.0 * Math.sin(2 * Math.PI * 0.9 * t));
  const c = 0.1 * Math.sin(2 * Math.PI * 3.3 * t + 0.5);
  return env * (a + b + c);
}

/* ------------------------------------------------------------------------- */
/* Pressure / pleth / resp shapes                                             */
/* ------------------------------------------------------------------------- */

/**
 * Arterial pressure pulse, normalised: 0 = diastolic, ~1 = systolic.
 * dt = seconds since the upstroke, rr = interval to the next beat. Rapid
 * upstroke, systolic peak ~0.1 s, dicrotic notch, diastolic run-off that
 * decays back to 0 at the next beat.
 */
export function abpShape(dt: number, rr: number): number {
  if (dt < 0) return 0;
  const rrC = Math.max(0.25, rr);
  if (dt >= rrC) return 0;
  const rise = smoothstep(0, 0.08, dt);
  const systolic = 0.5 * rise * gauss(Math.max(dt, 0.1), 0.1, 0.07);
  const k = 2.5;
  const tail = Math.max(0, dt - 0.1);
  const end = Math.max(0.05, rrC - 0.1);
  const runoff = (0.5 * rise * (Math.exp(-k * tail) - Math.exp(-k * end))) / (1 - Math.exp(-k * end));
  const notchT = Math.min(0.3, 0.45 * rrC);
  const notch = -0.1 * gauss(dt, notchT, 0.022) * (1 - smoothstep(rrC * 0.85, rrC, dt));
  const dicrotic = 0.08 * gauss(dt, notchT + 0.06, 0.04) * (1 - smoothstep(rrC * 0.85, rrC, dt));
  return clamp(systolic + Math.max(0, runoff) + notch + dicrotic, 0, 1.1);
}

/** Peripheral plethysmogram pulse: smoother, later peak, small dicrotic bump. */
export function plethShape(dt: number, rr: number): number {
  if (dt < 0) return 0;
  const rrC = Math.max(0.25, rr);
  if (dt >= rrC) return 0;
  const tp = Math.min(0.2, 0.32 * rrC);
  const rise = smoothstep(0, tp, dt);
  const peak = 0.5 * rise * gauss(Math.max(dt, tp), tp, 0.13);
  const k = 2.0;
  const tail = Math.max(0, dt - tp);
  const end = Math.max(0.05, rrC - tp);
  const runoff = (0.5 * rise * (Math.exp(-k * tail) - Math.exp(-k * end))) / (1 - Math.exp(-k * end));
  const bump = 0.06 * gauss(dt, Math.min(0.45, 0.62 * rrC), 0.07) * (1 - smoothstep(rrC * 0.85, rrC, dt));
  return clamp(peak + Math.max(0, runoff) + bump, 0, 1.1);
}

/* ------------------------------------------------------------------------- */
/* Beat scheduler                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Places beats in time from the current HR / rhythm. RR = 60/HR with slight
 * (±3 %) variability for sinus; PVCs are inserted at `pvcPerMin` (coupled
 * early at ~0.62 RR, followed by a full compensatory pause); VT is fast and
 * regular; VF and unmeasurable HR produce no beats.
 */
export class BeatScheduler {
  private beats: Beat[] = [];
  private nextT: number | null = null;
  private nextKind: BeatKind = "sinus";
  private compensate = 0;

  constructor(private readonly rand: () => number) {}

  /** All beats kept in the look-back window, oldest first. */
  get recent(): readonly Beat[] {
    return this.beats;
  }

  /** Generate every beat with R time <= t. Returns the new beats. */
  advance(t: number, p: SynthParams): Beat[] {
    const out: Beat[] = [];
    const beating = p.rhythm === "vt" || (p.rhythm !== "vf" && p.hr != null && p.hr > 0);
    if (!beating) {
      this.nextT = null;
      this.nextKind = "sinus";
      this.prune(t);
      return out;
    }
    if (this.nextT == null || t - this.nextT > 10) {
      this.nextT = t;
      this.nextKind = "sinus";
    }
    let guard = 0;
    while (this.nextT != null && this.nextT <= t && guard++ < 1000) {
      const at: number = this.nextT;
      if (p.rhythm === "vt") {
        const rate = clamp(p.hr ?? VT_DEFAULT_RATE, 120, 260);
        const rr = (60 / rate) * (1 + (this.rand() - 0.5) * 0.02);
        const b: Beat = { t: at, kind: "vt", rr, perfusing: p.sys != null };
        this.beats.push(b);
        out.push(b);
        this.nextT = at + rr;
        this.nextKind = "sinus";
        continue;
      }
      const hr = clamp(p.hr ?? 60, 20, 250);
      const baseRr = 60 / hr;
      if (this.nextKind === "pvc") {
        const b: Beat = { t: at, kind: "pvc", rr: baseRr, perfusing: p.sys != null };
        this.beats.push(b);
        out.push(b);
        this.nextT = at + this.compensate;
        this.nextKind = "sinus";
        continue;
      }
      const rr = baseRr * (1 + (this.rand() - 0.5) * 0.06);
      const b: Beat = { t: at, kind: "sinus", rr, perfusing: p.sys != null || p.spo2 != null };
      this.beats.push(b);
      out.push(b);
      const pvcProb = clamp(p.pvcPerMin / hr, 0, 0.5);
      if (pvcProb > 0 && this.rand() < pvcProb) {
        const coupling = 0.62 * rr;
        this.nextT = at + coupling;
        this.compensate = 2 * rr - coupling;
        this.nextKind = "pvc";
      } else {
        this.nextT = at + rr;
      }
    }
    this.prune(t);
    return out;
  }

  private prune(t: number) {
    while (this.beats.length > 0 && this.beats[0].t < t - 5) this.beats.shift();
  }
}

/* ------------------------------------------------------------------------- */
/* Synthesiser                                                                */
/* ------------------------------------------------------------------------- */

/** Beats are scheduled this far ahead so P waves can be drawn before R. */
const LOOKAHEAD_S = 0.4;

/**
 * Stateful multi-channel synthesiser. Call `sample(t)` with non-decreasing
 * times (seconds). `set()` updates the target numbers (once per poll).
 */
export class WaveSynth {
  private readonly rand: () => number;
  private readonly sched: BeatScheduler;
  private params: SynthParams;
  private respPhase = 0;
  private lastT: number | null = null;
  private lastEventT = -Infinity;

  constructor(params: SynthParams, seed = 1) {
    this.rand = mulberry32(seed);
    this.sched = new BeatScheduler(mulberry32(seed * 7919 + 13));
    this.params = params;
  }

  set(params: SynthParams) {
    this.params = params;
  }

  /** Beats whose R peak fell in (previous sample time, t]. */
  private events: Beat[] = [];
  takeBeats(): Beat[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  sample(t: number): WaveSample {
    const p = this.params;
    if (this.lastT != null && t - this.lastT > 5) this.lastT = t; // tab was hidden: skip
    const dtStep = this.lastT == null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;

    this.sched.advance(t + LOOKAHEAD_S, p);
    const beats = this.sched.recent;
    for (const b of beats) {
      if (b.t > this.lastEventT && b.t <= t) {
        this.events.push(b);
        this.lastEventT = b.t;
      }
    }

    const noise = () => (this.rand() - 0.5) * 2;

    // ECG
    let ecg = 0.02 * Math.sin(2 * Math.PI * 0.15 * t) + noise() * 0.008;
    if (p.rhythm === "vf") {
      ecg += vfSignal(t);
    } else {
      for (const b of beats) {
        const dt = t - b.t;
        if (dt < -0.35 || dt > 0.75) continue;
        ecg += b.kind === "sinus" ? sinusComplex(dt, b.rr, p.stMm) : b.kind === "pvc" ? pvcComplex(dt) : vtComplex(dt, b.rr);
      }
    }

    // ABP + pleth: shape of the most recent perfusing beat that has started.
    const abp = this.pulse(t, ABP_DELAY_S, beats, (dt, rr) => abpShape(dt, rr));
    const pl = this.pulse(t, PLETH_DELAY_S, beats, (dt, rr) => plethShape(dt, rr));
    let abpV: number;
    if (p.sys == null || p.dia == null) abpV = 6 + noise() * 0.8;
    else if (abp == null) abpV = p.dia + noise() * 0.4;
    else abpV = p.dia + (p.sys - p.dia) * abp.value * abp.gain + noise() * 0.4;

    let plethV: number;
    if (p.spo2 == null) plethV = 0.05 + noise() * 0.012;
    else if (pl == null) plethV = 0.1 + noise() * 0.006;
    else plethV = 0.1 + 0.8 * pl.value * pl.gain + noise() * 0.006;

    // Resp: phase integrates the current rate; flat line when apnoeic.
    let resp: number;
    if (p.resp == null || p.resp <= 0) {
      resp = noise() * 0.015;
    } else {
      this.respPhase = (this.respPhase + 2 * Math.PI * (p.resp / 60) * dtStep) % (2 * Math.PI);
      resp = 0.85 * Math.sin(this.respPhase) + noise() * 0.01;
    }

    return { ecg, abp: abpV, pleth: plethV, resp };
  }

  private pulse(
    t: number,
    delay: number,
    beats: readonly Beat[],
    shape: (dt: number, rr: number) => number,
  ): { value: number; gain: number } | null {
    for (let i = beats.length - 1; i >= 0; i--) {
      const b = beats[i];
      if (!b.perfusing) continue;
      const start = b.t + delay;
      if (start > t) continue;
      if (t - start > 3) return null;
      let next: Beat | undefined;
      for (let j = i + 1; j < beats.length; j++) {
        if (beats[j].perfusing) {
          next = beats[j];
          break;
        }
      }
      const rr = next ? next.t - b.t : b.rr;
      const gain = b.kind === "pvc" ? 0.45 : b.kind === "vt" ? 0.5 : 1;
      return { value: shape(t - start, rr), gain };
    }
    return null;
  }
}

/** Formats seconds as mm:ss. */
export function mmss(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
