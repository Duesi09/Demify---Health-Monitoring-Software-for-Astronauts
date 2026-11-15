// Synthetic fingertip camera frames for the estimator tests.
// Deterministic (seeded) so a failing case can be rerun exactly.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(1e-12, next());
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}

/**
 * Blood volume over one beat, phase 0..1: a systolic peak plus a dicrotic
 * wave (gives the strong 2nd harmonic real PPG has). Roughly 0..1.
 */
export function pulseShape(phase, dicrotic = 0.5) {
  const g = (mu, s) => Math.exp(-0.5 * ((phase - mu) / s) ** 2) + Math.exp(-0.5 * ((phase - 1 - mu) / s) ** 2);
  return g(0.18, 0.07) + dicrotic * g(0.48, 0.08);
}

/**
 * Generates frames {t, r, g, b}.
 *   bpm: number or function(tSec) -> bpm
 *   fps, seconds, amp (relative pulse amplitude), noise (sd in red units),
 *   jitter (relative frame interval jitter), drop (frame drop probability),
 *   steps: [{at: s, factor}], baseline, drift (red units, slow sine),
 *   dicrotic, finger: function(tSec) -> boolean, seed, startMs
 */
export function synthFrames(o) {
  const {
    bpm = 72,
    fps = 30,
    seconds = 20,
    amp = 0.01,
    noise = 0.1,
    jitter = 0.15,
    drop = 0.04,
    steps = [{ at: 2.5, factor: 1.08 }],
    baseline = 180,
    drift = 6,
    dicrotic = 0.5,
    finger = () => true,
    seed = 1,
    startMs = 1000,
    pureNoise = false,
  } = o;
  const R = rng(seed);
  const bpmAt = typeof bpm === "function" ? bpm : () => bpm;
  const frames = [];
  let t = 0;
  let phase = R.next();
  let prevT = 0;
  while (t < seconds) {
    const dt = t - prevT;
    phase = (phase + (bpmAt(t) / 60) * dt) % 1;
    prevT = t;
    if (R.next() >= drop) {
      let level = baseline + drift * Math.sin((2 * Math.PI * t) / 23);
      for (const s of steps) if (t >= s.at) level *= s.factor;
      const pulse = pureNoise ? 0 : amp * pulseShape(phase, dicrotic) / (1 + dicrotic * 0.2);
      const r = level * (1 - pulse) + noise * R.gauss();
      const onFinger = finger(t);
      frames.push({
        t: startMs + t * 1000,
        r: onFinger ? r : 200 + R.gauss(),
        g: onFinger ? r * 0.25 + R.gauss() * 0.5 : 190 + R.gauss(),
        b: onFinger ? r * 0.2 + R.gauss() * 0.5 : 185 + R.gauss(),
      });
    }
    t += (1 / fps) * (1 + jitter * (2 * R.next() - 1));
  }
  return frames;
}

/** Feeds frames to an estimator and polls once per second. Returns [{tSec, ...pollResult}]. */
export function run(est, frames, startMs = 1000) {
  const out = [];
  let nextPoll = startMs + 1000;
  for (const f of frames) {
    while (f.t >= nextPoll) {
      out.push({ tSec: (nextPoll - startMs) / 1000, ...est.poll(nextPoll) });
      nextPoll += 1000;
    }
    est.push(f.t, f.r, f.g, f.b);
  }
  return out;
}
