import { describe, expect, it } from "vitest";
import {
  PulseTracker,
  estimatePulse,
  looksLikeFinger,
  resample,
  type PulseSample,
} from "@/lib/pulse/estimator";

/** Deterministic pseudo-random numbers (LCG), so the tests never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Synthetic fingertip PPG: a systolic peak plus a dicrotic wave per beat,
 * slow drift (pressure, auto exposure), frame noise and jittered frame times
 * like a real phone camera (about 30 fps, not exact).
 */
function ppg(opts: {
  bpm: number;
  seconds: number;
  fps?: number;
  noise?: number;
  drift?: number;
  seed?: number;
  amplitude?: number;
}): PulseSample[] {
  const { bpm, seconds, fps = 30, noise = 0.3, drift = 3, seed = 1, amplitude = 1.5 } = opts;
  const rand = rng(seed);
  const out: PulseSample[] = [];
  let t = 1000;
  const period = 60_000 / bpm;
  while (t < 1000 + seconds * 1000) {
    const phase = ((t % period) / period) * 2 * Math.PI;
    const beat = Math.exp(-((phase - 1) ** 2) / 0.25) + 0.35 * Math.exp(-((phase - 3) ** 2) / 0.3);
    const red =
      200 -
      amplitude * beat +
      drift * Math.sin((2 * Math.PI * t) / 7000) +
      noise * (rand() - 0.5) * 2;
    out.push({ t, red, green: 40 });
    t += (1000 / fps) * (0.85 + 0.3 * rand());
  }
  return out;
}

describe("camera pulse estimator", () => {
  it.each([48, 60, 72, 90, 110, 140, 170])("finds %i bpm in a noisy synthetic PPG within 3 bpm", (bpm) => {
    const e = estimatePulse(ppg({ bpm, seconds: 10, seed: bpm }));
    expect(e).not.toBeNull();
    expect(Math.abs(e!.bpm - bpm)).toBeLessThanOrEqual(3);
    expect(e!.quality).toBeGreaterThan(0.6);
  });

  it("copes with a lower and irregular frame rate (15 fps)", () => {
    const e = estimatePulse(ppg({ bpm: 75, seconds: 10, fps: 15, seed: 7 }));
    expect(e).not.toBeNull();
    expect(Math.abs(e!.bpm - 75)).toBeLessThanOrEqual(3);
  });

  it("gives nothing for pure noise (no rhythm)", () => {
    const rand = rng(42);
    const samples: PulseSample[] = [];
    for (let i = 0; i < 300; i++) samples.push({ t: i * 33.3, red: 200 + (rand() - 0.5) * 6 });
    expect(estimatePulse(samples)).toBeNull();
  });

  it("gives nothing for a flat signal", () => {
    const samples: PulseSample[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 33.3, red: 180 }));
    expect(estimatePulse(samples)).toBeNull();
  });

  it("waits for at least 5 s of signal", () => {
    expect(estimatePulse(ppg({ bpm: 72, seconds: 3 }))).toBeNull();
    expect(estimatePulse(ppg({ bpm: 72, seconds: 6 }))).not.toBeNull();
  });

  it("resamples irregular frames onto a uniform grid", () => {
    const x = resample(
      [
        { t: 0, red: 0 },
        { t: 50, red: 50 },
        { t: 100, red: 100 },
      ],
      100,
    );
    expect(x).toHaveLength(11);
    expect(x[5]).toBeCloseTo(50);
    expect(x[10]).toBeCloseTo(100);
  });

  it("detects a lit fingertip, not a room", () => {
    expect(looksLikeFinger(220, 40)).toBe(true);
    expect(looksLikeFinger(255, 150)).toBe(true); // torch, red clipped
    expect(looksLikeFinger(120, 120)).toBe(false); // grey wall
    expect(looksLikeFinger(40, 10)).toBe(false); // dark, torch off
  });
});

describe("clipped red channel (strong torch)", () => {
  it("falls back to the green channel when red sits at 255", () => {
    const rand = rng(9);
    const samples = ppg({ bpm: 84, seconds: 10, seed: 9 }).map((s) => ({
      t: s.t,
      red: 255,
      // Green carries the pulse: 200 - red pulse shape scaled, plus noise.
      green: 60 - (200 - s.red) * 0.8 + (rand() - 0.5) * 0.4,
    }));
    const e = estimatePulse(samples);
    expect(e).not.toBeNull();
    expect(e!.channel).toBe("green");
    expect(Math.abs(e!.bpm - 84)).toBeLessThanOrEqual(3);
  });

  it("uses red when red is the clearer channel", () => {
    const e = estimatePulse(ppg({ bpm: 72, seconds: 10, seed: 5 }));
    expect(e!.channel).toBe("red");
  });
});

describe("PulseTracker", () => {
  it("smooths to the true rate and resets when the finger is lifted", () => {
    const tracker = new PulseTracker();
    let last = null;
    for (const s of ppg({ bpm: 66, seconds: 14, seed: 3 })) {
      tracker.add(s);
      if (Math.round(s.t) % 1000 < 34) last = tracker.estimate() ?? last;
    }
    expect(last).not.toBeNull();
    expect(Math.abs(last!.bpm - 66)).toBeLessThanOrEqual(3);
    expect(tracker.waveform().length).toBeGreaterThan(60);

    tracker.add({ t: 20_000, red: 90, green: 90 }); // finger lifted: room light
    expect(tracker.size).toBe(0);
    expect(tracker.estimate()).toBeNull();
  });
});
