// Demo hold: makes the stage demo easy.
//
// The strict estimator (ppg.js) only publishes after a long, clean signal,
// which is hard to get on stage. The demo hold locks onto the first rough
// rate it sees (two agreeing rough estimates while the finger is on), then
// keeps showing that value with a small, natural-looking drift. If the strict
// estimator does publish, the held value follows it. Lifting the finger for
// 2 s ends the hold.
//
// Pure logic, no DOM: app.js uses it, test/hold.test.mjs tests it.
// The held value is a smoothed demo value, not a measurement.

export const HOLD_DEFAULTS = Object.freeze({
  minWindowS: 3, // finger signal needed before rough estimates count, s
  minQuality: 0.15, // rough estimates below this are ignored
  agreeN: 2, // this many rough estimates in a row...
  agreeTol: 0.15, // ...within 15 % of each other lock the hold
  fallbackS: 9, // finger on this long without agreement: lock to the median of all rough estimates
  minBpm: 55, // locked base is clamped to a plausible resting range
  maxBpm: 110,
  releaseS: 2, // finger off this long: the hold ends
  driftMax: 4, // drift stays within +/- this many bpm of the base
  followRate: 0.3, // how fast the base follows a real published value per second
});

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function createDemoHold(opts = {}, random = Math.random) {
  const o = { ...HOLD_DEFAULTS, ...opts };
  let base = null; // locked rate, null = not locked
  let drift = 0;
  let phase = random() * Math.PI * 2;
  let rough = []; // recent rough estimates (agreement check)
  let allRough = []; // every rough estimate of this placement (fallback)
  let fingerSince = null;
  let offSince = null;

  function reset() {
    base = null;
    drift = 0;
    rough = [];
    allRough = [];
    fingerSince = null;
    offSince = null;
  }

  /**
   * Called once per second with the estimator output. Returns
   * {held: boolean, bpm: number|null}. held = the value comes from the hold.
   */
  function update(out, nowMs) {
    if (!out.fingerOn) {
      if (offSince === null) offSince = nowMs;
      fingerSince = null;
      rough = [];
      if (base !== null && nowMs - offSince >= o.releaseS * 1000) reset();
      if (base === null) {
        allRough = [];
        return { held: false, bpm: null };
      }
      return { held: true, bpm: current() }; // brief slip: keep showing the value
    }
    offSince = null;
    if (fingerSince === null) fingerSince = nowMs;

    if (base === null) {
      const c = out.candidate;
      if (c != null && out.windowSeconds >= o.minWindowS && out.quality >= o.minQuality) {
        rough.push(c);
        allRough.push(c);
        if (rough.length > o.agreeN) rough.shift();
      }
      if (out.publishable && out.bpm != null) lock(out.bpm);
      else if (rough.length >= o.agreeN) {
        const spread = (Math.max(...rough) - Math.min(...rough)) / median(rough);
        if (spread <= o.agreeTol) lock(median(rough));
      }
      if (base === null && nowMs - fingerSince >= o.fallbackS * 1000) {
        if (out.candidate != null) allRough.push(out.candidate);
        if (allRough.length) lock(median(allRough));
      }
      if (base === null) return { held: false, bpm: null };
      return { held: true, bpm: Math.round(base) };
    }

    // Locked: follow a real published value gently, otherwise drift.
    if (out.publishable && out.bpm != null) base += o.followRate * (out.bpm - base);
    step();
    return { held: true, bpm: current() };
  }

  function lock(v) {
    base = Math.min(o.maxBpm, Math.max(o.minBpm, v));
    drift = 0;
  }

  // Mean-reverting random walk plus a slow wave (breathing-like, ~20 s).
  function step() {
    drift += (random() - 0.5) * 1.6 - 0.15 * drift;
    drift = Math.max(-o.driftMax, Math.min(o.driftMax, drift));
    phase += (2 * Math.PI) / 20;
  }

  function current() {
    const v = base + drift + 1.5 * Math.sin(phase);
    return Math.round(Math.max(base - o.driftMax - 1.5, Math.min(base + o.driftMax + 1.5, v)));
  }

  return { update, reset, get locked() { return base !== null; }, options: o };
}
