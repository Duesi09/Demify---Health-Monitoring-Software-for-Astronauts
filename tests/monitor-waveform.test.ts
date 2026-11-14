import { describe, expect, it } from "vitest";
import {
  ABP_DELAY_S,
  BeatScheduler,
  PLETH_DELAY_S,
  WaveSynth,
  abpShape,
  mmss,
  mulberry32,
  plethShape,
  pvcComplex,
  sinusComplex,
  vfSignal,
  type Beat,
  type SynthParams,
} from "@/components/monitor/waveform";

const NORMAL: SynthParams = {
  hr: 60,
  rhythm: "sinus",
  stMm: 0,
  pvcPerMin: 0,
  sys: 120,
  dia: 80,
  spo2: 98,
  resp: 12,
};

const SR = 250;

function run(p: SynthParams, seconds: number, seed = 1) {
  const synth = new WaveSynth(p, seed);
  const out: { t: number; ecg: number; abp: number; pleth: number; resp: number }[] = [];
  const beats: Beat[] = [];
  for (let i = 0; i <= seconds * SR; i++) {
    const t = 100 + i / SR;
    out.push({ t, ...synth.sample(t) });
    beats.push(...synth.takeBeats());
  }
  return { out, beats };
}

describe("ECG complexes", () => {
  it("sinus PQRST has a dominant R peak at dt=0 and an isoelectric ST segment", () => {
    const r = sinusComplex(0, 1);
    expect(r).toBeGreaterThan(1);
    for (let dt = -0.3; dt <= 0.7; dt += 0.005) expect(sinusComplex(dt, 1)).toBeLessThanOrEqual(r + 1e-9);
    expect(Math.abs(sinusComplex(0.09, 1))).toBeLessThan(0.05);
    // P wave precedes QRS.
    expect(sinusComplex(-0.16, 1)).toBeGreaterThan(0.08);
  });

  it("raises the ST segment by stMm (1 mm = 0.1 mV)", () => {
    for (const st of [1, 2, 3]) {
      const lift = sinusComplex(0.09, 1, st) - sinusComplex(0.09, 1, 0);
      expect(lift).toBeGreaterThan(st * 0.1 * 0.85);
      expect(lift).toBeLessThan(st * 0.1 * 1.25);
    }
  });

  it("PVC is wide with no P wave", () => {
    expect(Math.abs(pvcComplex(-0.16))).toBeLessThan(0.01);
    // Still large 25 ms from the peak (a narrow sinus R is already gone there).
    expect(pvcComplex(0.025)).toBeGreaterThan(0.5);
    expect(sinusComplex(0.025, 1)).toBeLessThan(0.1);
  });

  it("VF is chaotic, smaller than an R wave, and never flat", () => {
    let max = 0;
    let crossings = 0;
    let prev = vfSignal(0);
    for (let t = 0.004; t < 10; t += 0.004) {
      const v = vfSignal(t);
      max = Math.max(max, Math.abs(v));
      if (Math.sign(v) !== Math.sign(prev)) crossings++;
      prev = v;
    }
    expect(max).toBeLessThan(0.9);
    expect(max).toBeGreaterThan(0.2);
    // ~4-7 Hz undulation => many zero crossings, irregular.
    expect(crossings).toBeGreaterThan(60);
  });
});

describe("pressure shapes", () => {
  it("ABP pulse starts at diastole, peaks early and returns to diastole", () => {
    expect(abpShape(0, 1)).toBeCloseTo(0, 5);
    expect(abpShape(0.1, 1)).toBeGreaterThan(0.9);
    expect(abpShape(0.99, 1)).toBeLessThan(0.02);
    let max = 0;
    for (let dt = 0; dt < 1; dt += 0.002) max = Math.max(max, abpShape(dt, 1));
    expect(max).toBeLessThanOrEqual(1.1);
  });

  it("ABP shows a dicrotic notch (local minimum after the peak)", () => {
    const vals: number[] = [];
    for (let dt = 0.15; dt < 0.5; dt += 0.002) vals.push(abpShape(dt, 1));
    let localMin = false;
    for (let i = 1; i < vals.length - 1; i++) if (vals[i] < vals[i - 1] && vals[i] < vals[i + 1]) localMin = true;
    expect(localMin).toBe(true);
  });

  it("pleth peaks later than ABP", () => {
    let abpPeak = 0;
    let plPeak = 0;
    let a = 0;
    let p = 0;
    for (let dt = 0; dt < 1; dt += 0.002) {
      if (abpShape(dt, 1) > a) [a, abpPeak] = [abpShape(dt, 1), dt];
      if (plethShape(dt, 1) > p) [p, plPeak] = [plethShape(dt, 1), dt];
    }
    expect(plPeak + PLETH_DELAY_S).toBeGreaterThan(abpPeak + ABP_DELAY_S);
  });
});

describe("beat scheduler", () => {
  it("places sinus beats at 60/HR with slight variability", () => {
    const s = new BeatScheduler(mulberry32(3));
    const beats: Beat[] = [];
    for (let t = 0; t <= 60; t += 0.01) beats.push(...s.advance(t, NORMAL));
    expect(beats.length).toBeGreaterThanOrEqual(58);
    expect(beats.length).toBeLessThanOrEqual(62);
    for (let i = 1; i < beats.length; i++) {
      const rr = beats[i].t - beats[i - 1].t;
      expect(rr).toBeGreaterThan(0.95);
      expect(rr).toBeLessThan(1.05);
    }
    expect(beats.every((b) => b.kind === "sinus")).toBe(true);
  });

  it("inserts PVCs early with a full compensatory pause", () => {
    const s = new BeatScheduler(mulberry32(5));
    const beats: Beat[] = [];
    for (let t = 0; t <= 120; t += 0.01) beats.push(...s.advance(t, { ...NORMAL, pvcPerMin: 10 }));
    const pvcIdx = beats.map((b, i) => (b.kind === "pvc" ? i : -1)).filter((i) => i > 0 && i < beats.length - 1);
    expect(pvcIdx.length).toBeGreaterThan(8);
    for (const i of pvcIdx) {
      const before = beats[i].t - beats[i - 1].t;
      const after = beats[i + 1].t - beats[i].t;
      expect(before).toBeLessThan(0.75); // premature
      expect(before + after).toBeCloseTo(2 * beats[i - 1].rr, 5); // compensatory
      expect(beats[i + 1].kind).toBe("sinus");
    }
  });

  it("VT is fast and regular, VF has no beats", () => {
    const vt = new BeatScheduler(mulberry32(1));
    const beats: Beat[] = [];
    for (let t = 0; t <= 10; t += 0.005) beats.push(...vt.advance(t, { ...NORMAL, rhythm: "vt", hr: 190 }));
    expect(beats.length).toBeGreaterThan(29);
    expect(beats.every((b) => b.kind === "vt")).toBe(true);
    const rr = (beats.at(-1)!.t - beats[0].t) / (beats.length - 1);
    expect(rr).toBeCloseTo(60 / 190, 2);

    const vf = new BeatScheduler(mulberry32(1));
    const none: Beat[] = [];
    for (let t = 0; t <= 10; t += 0.01) none.push(...vf.advance(t, { ...NORMAL, rhythm: "vf", hr: null, sys: null, dia: null, spo2: null }));
    expect(none).toHaveLength(0);
  });
});

describe("WaveSynth", () => {
  it("is deterministic for a given seed", () => {
    const a = run(NORMAL, 3, 9).out.map((s) => s.ecg);
    const b = run(NORMAL, 3, 9).out.map((s) => s.ecg);
    expect(a).toEqual(b);
  });

  it("ABP swings between dia and sys, peaking ~150-300 ms after R", () => {
    const { out, beats } = run(NORMAL, 10);
    const abp = out.map((s) => s.abp);
    expect(Math.max(...abp)).toBeGreaterThan(115);
    expect(Math.max(...abp)).toBeLessThan(128);
    expect(Math.min(...abp.slice(SR * 2))).toBeGreaterThan(77);
    const b = beats.find((x) => x.t > 102)!;
    let peakT = 0;
    let peak = -Infinity;
    for (const s of out) if (s.t > b.t && s.t < b.t + 0.6 && s.abp > peak) [peak, peakT] = [s.abp, s.t];
    expect(peakT - b.t).toBeGreaterThan(0.15);
    expect(peakT - b.t).toBeLessThan(0.35);
  });

  it("reports one beat event per R peak, at about HR per minute", () => {
    const { beats } = run({ ...NORMAL, hr: 120 }, 30);
    expect(beats.length).toBeGreaterThanOrEqual(58);
    expect(beats.length).toBeLessThanOrEqual(62);
  });

  it("flattens ABP and pleth without a pulse (VF), but ECG keeps undulating", () => {
    const { out, beats } = run({ ...NORMAL, rhythm: "vf", hr: null, sys: null, dia: null, spo2: null }, 5);
    expect(beats).toHaveLength(0);
    const abp = out.map((s) => s.abp);
    expect(Math.max(...abp) - Math.min(...abp)).toBeLessThan(3);
    const pleth = out.map((s) => s.pleth);
    expect(Math.max(...pleth) - Math.min(...pleth)).toBeLessThan(0.05);
    const ecg = out.map((s) => s.ecg);
    expect(Math.max(...ecg) - Math.min(...ecg)).toBeGreaterThan(0.3);
  });

  it("STEMI raises the ST segment on the synthesised trace", () => {
    const base = run(NORMAL, 6, 2);
    const stemi = run({ ...NORMAL, stMm: 3 }, 6, 2);
    const at = (r: ReturnType<typeof run>) => {
      const b = r.beats.find((x) => x.t > 102)!;
      return r.out.find((s) => s.t >= b.t + 0.09)!.ecg;
    };
    expect(at(stemi) - at(base)).toBeGreaterThan(0.25);
  });

  it("resp follows the rate and is flat in apnoea", () => {
    const { out } = run({ ...NORMAL, resp: 12 }, 30);
    // Count inspirations with hysteresis so sample noise is not counted.
    let ups = 0;
    let armed = false;
    for (const s of out) {
      if (s.resp < -0.5) armed = true;
      else if (armed && s.resp > 0.5) {
        ups++;
        armed = false;
      }
    }
    expect(ups).toBeGreaterThanOrEqual(5);
    expect(ups).toBeLessThanOrEqual(7);
    const apnea = run({ ...NORMAL, resp: 0 }, 10).out.map((s) => s.resp);
    expect(Math.max(...apnea.map(Math.abs))).toBeLessThan(0.05);
  });
});

describe("mmss", () => {
  it("formats elapsed drill time", () => {
    expect(mmss(0)).toBe("00:00");
    expect(mmss(65.9)).toBe("01:05");
    expect(mmss(-3)).toBe("00:00");
  });
});
