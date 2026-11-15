// Fingertip camera pulse estimate (photoplethysmography, PPG).
//
// Pure signal processing: no DOM, no timers. The phone page (app.js) and the
// Node tests import the same file. Camera pulse estimate for a demo, not a
// medical measurement.
//
//   const est = createPpgEstimator();
//   est.push(tMs, meanR, meanG, meanB);   // once per camera frame
//   const out = est.poll(nowMs);         // at most once per second
//   // out = {publishable, bpm, quality, fingerOn, reason, fps, windowSeconds, beat}
//
// Pipeline per poll (recomputed from the buffered frames, so there is no
// filter state to drift): stitch exposure steps -> resample red to 30 Hz ->
// normalise and invert -> detrend (1.5 s moving average) -> 0.7-3.5 Hz
// Butterworth band-pass (zero phase) -> autocorrelation with a harmonic guard,
// cross-checked against a beat count -> median of the last accepted estimates.

export const DEFAULTS = Object.freeze({
  fs: 30, // analysis rate, Hz
  windowS: 8, // analysis window, s
  minGoodS: 6, // continuous finger signal before anything is published, s
  minQuality: 0.5, // autocorrelation peak needed to accept an estimate
  medianN: 5, // published value = median of this many accepted estimates
  minStreak: 3, // consecutive accepted estimates needed before publishing
  maxSpread: 0.12, // ...and they must agree within 12 %
  minBpm: 45,
  maxBpm: 180,
  bandLowHz: 0.7,
  bandHighHz: 3.5,
  detrendS: 1.5,
  fingerRatio: 1.6, // finger: R > ratio*G and R > ratio*B
  minRed: 60, // finger: R above this, else "too dark"
  satRed: 250, // R at or above this counts as clipped
  satFraction: 0.5, // clipped in more than this share of the last 0.5 s: saturated
  stepJump: 0.05, // relative frame-to-frame change treated as an exposure step and stitched
  motionJump: 0.25, // relative frame-to-frame change that means the finger shifted (stitched too, not reset)
  maxStepsIn2s: 2, // more stitched steps than this within 2 s: moving, publishing pauses (window kept)
  movingPauseS: 1, // how long publishing pauses after continuous movement
  lostFingerS: 0.8, // non-finger frames for this long: finger lifted, reset
  agreeTol: 0.1, // autocorrelation and beat count must agree within 10 %
  maxRejects: 3, // this many rejected polls in a row clear the accepted list
  bufferS: 12, // raw frames kept, s
});

/* ------------------------------------------------------------------------- */
/* Small numeric helpers (exported for tests)                                 */
/* ------------------------------------------------------------------------- */

/** RBJ biquad (bilinear transform with pre-warping); Q = 1/sqrt(2) is Butterworth. */
export function biquad(type, f0, fs, q = Math.SQRT1_2) {
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  let b0, b1, b2;
  if (type === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    throw new Error(`unknown biquad type ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Direct form II transposed, starting from the steady state for x[0]. */
function runBiquad(c, x) {
  const y = new Float64Array(x.length);
  if (!x.length) return y;
  // Steady state for a constant input x0 (avoids a start-up jump).
  const x0 = x[0];
  const dcGain = (c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2);
  const y0 = dcGain * x0;
  let z1 = y0 - c.b0 * x0;
  let z2 = c.b2 * x0 - c.a2 * y0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + z1;
    z1 = c.b1 * xi - c.a1 * yi + z2;
    z2 = c.b2 * xi - c.a2 * yi;
    y[i] = yi;
  }
  return y;
}

/** Zero-phase band-pass: high-pass then low-pass, forward and backward, with odd reflection padding. */
export function bandpass(x, fs, lowHz, highHz) {
  const n = x.length;
  if (n < 4) return Float64Array.from(x);
  const pad = Math.min(n - 1, Math.round(fs));
  const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) {
    ext[i] = 2 * x[0] - x[pad - i];
    ext[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i];
  }
  ext.set(x, pad);
  const hp = biquad("highpass", lowHz, fs);
  const lp = biquad("lowpass", highHz, fs);
  const pass = (s) => runBiquad(lp, runBiquad(hp, s));
  let y = pass(ext);
  y.reverse();
  y = pass(y);
  y.reverse();
  return y.slice(pad, pad + n);
}

/** Centred moving average (window w samples, shrinking at the edges). */
export function movingAverage(x, w) {
  const n = x.length;
  const out = new Float64Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];
  const half = Math.floor(w / 2);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    out[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
  }
  return out;
}

/** Linear interpolation of irregular samples (t ms, v) onto a uniform grid. */
export function resample(times, values, fs, tStart, tEnd) {
  const step = 1000 / fs;
  const n = Math.floor((tEnd - tStart) / step) + 1;
  const out = new Float64Array(Math.max(0, n));
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = tStart + i * step;
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const t0 = times[j];
    const t1 = times[j + 1] ?? t0;
    if (t1 === t0 || t <= t0) out[i] = values[j];
    else if (t >= t1) out[i] = values[j + 1];
    else out[i] = values[j] + ((values[j + 1] - values[j]) * (t - t0)) / (t1 - t0);
  }
  return out;
}

export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Normalised autocorrelation for lags kMin..kMax (each lag normalised over its own overlap). */
export function autocorrelation(x, kMin, kMax) {
  const r = new Float64Array(kMax + 2);
  for (let k = Math.max(1, kMin - 1); k <= kMax + 1 && k < x.length - 1; k++) {
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i + k < x.length; i++) {
      sxy += x[i] * x[i + k];
      sxx += x[i] * x[i];
      syy += x[i + k] * x[i + k];
    }
    r[k] = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  }
  return r;
}

/** Vertex of the parabola through (i-1, i, i+1): returns {x, y}. */
function parabolic(arr, i) {
  const a = arr[i - 1];
  const b = arr[i];
  const c = arr[i + 1];
  const den = a - 2 * b + c;
  if (!Number.isFinite(den) || den === 0) return { x: i, y: b };
  const d = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  return { x: i + d, y: b - 0.25 * (a - c) * d };
}

/**
 * Period from the autocorrelation with a harmonic guard. Returns
 * {lag (samples, fractional), r} or null.
 */
export function pickPeriod(r, kMin, kMax) {
  const peaks = [];
  for (let k = Math.max(kMin, 2); k <= kMax; k++) {
    if (r[k] > r[k - 1] && r[k] >= r[k + 1]) peaks.push(k);
  }
  if (!peaks.length) return null;
  // Compare peaks by the vertex of a parabola through each one: at short lags
  // (fast rates) the true peak falls between integer lags and would otherwise
  // lose to its own multiple at a longer lag.
  const h = new Map(peaks.map((k) => [k, parabolic(r, k).y]));
  let best = peaks[0];
  for (const k of peaks) if (h.get(k) > h.get(best)) best = k;
  // Harmonic guard: a periodic signal also correlates at 2x and 3x its period
  // (half and a third of the rate). If a strong peak sits at an integer
  // fraction of the winner, that shorter lag is the fundamental period.
  let chosen = best;
  for (const d of [3, 2]) {
    const target = best / d;
    if (target < kMin - 0.5) continue;
    const tol = Math.max(1, 0.12 * target);
    const near = peaks.filter((k) => Math.abs(k - target) <= tol);
    if (!near.length) continue;
    const k = near.reduce((a, b) => (h.get(b) > h.get(a) ? b : a));
    if (h.get(k) >= 0.7 * h.get(best) && h.get(k) > 0.25) {
      chosen = k;
      break;
    }
  }
  const p = parabolic(r, chosen);
  return { lag: p.x, r: Math.max(0, Math.min(1, p.y)), integerLag: chosen };
}

/** Local maxima above a threshold, at least minDist samples apart; times refined by parabola. */
export function findPeaks(x, minDist, threshold) {
  const idx = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > threshold && x[i] > x[i - 1] && x[i] >= x[i + 1]) {
      const last = idx.at(-1);
      if (last !== undefined && i - last < minDist) {
        if (x[i] > x[last]) idx[idx.length - 1] = i;
      } else idx.push(i);
    }
  }
  return idx.map((i) => parabolic(x, i).x);
}

/**
 * Rate from peak positions (samples): median interval, then the mean of the
 * intervals within 25 % of it (missed or extra peaks are ignored).
 */
export function beatRate(peaks, fs) {
  if (peaks.length < 3) return null;
  const iv = [];
  for (let i = 1; i < peaks.length; i++) iv.push(peaks[i] - peaks[i - 1]);
  const med = median(iv);
  const kept = iv.filter((d) => Math.abs(d - med) <= 0.25 * med);
  if (kept.length < 2) return null;
  const bpm = (60 * fs * kept.length) / kept.reduce((a, b) => a + b, 0);
  return { bpm, keptFraction: kept.length / iv.length };
}

/* ------------------------------------------------------------------------- */
/* Estimator                                                                  */
/* ------------------------------------------------------------------------- */

export function classifyFrame(r, g, b, o = DEFAULTS) {
  const reddish = r > o.fingerRatio * g && r > o.fingerRatio * b;
  if (!reddish) return { finger: false, reason: "no finger" };
  if (r <= o.minRed) return { finger: false, reason: "too dark" };
  return { finger: true, reason: "", sat: r >= o.satRed };
}

export function createPpgEstimator(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // Period search runs on the band-limited signal upsampled 2x: at 30 Hz a
  // fast pulse lasts only ~10 samples, so one sample would be ~10 % of the rate.
  const UP = 2;
  const fsA = o.fs * UP;
  const kMin = Math.floor((60 * fsA) / o.maxBpm);
  const kMax = Math.ceil((60 * fsA) / o.minBpm);

  let seg = []; // {t, v} frames of the current good segment (v = stitched red)
  let segStart = null; // time of the first frame of the current segment
  let gain = 1; // multiplicative stitching for exposure steps
  let lastRaw = null;
  let steps = []; // times of stitched steps
  let movingUntil = -Infinity; // publishing paused until then (finger moving)
  let recent = []; // {t, sat} finger frames of the last 0.5 s
  let frameTimes = []; // all frame times of the last 2 s (fps)
  let lastT = null;
  let badSince = null;
  let badReason = "no finger";
  let resetReason = "";
  let accepted = [];
  let rejects = 0;
  let streak = 0;
  let filtered = new Float64Array(0);
  let lastBeatT = -Infinity;

  function clearSignal(reason) {
    seg = [];
    segStart = null;
    gain = 1;
    lastRaw = null;
    steps = [];
    movingUntil = -Infinity;
    recent = [];
    accepted = [];
    rejects = 0;
    streak = 0;
    filtered = new Float64Array(0);
    resetReason = reason;
  }

  function reset() {
    clearSignal("");
    frameTimes = [];
    lastT = null;
    badSince = null;
    badReason = "no finger";
    lastBeatT = -Infinity;
  }

  function push(t, r, g, b) {
    if (![t, r, g, b].every(Number.isFinite)) return;
    if (lastT !== null && t <= lastT) return; // out of order or duplicate
    lastT = t;
    frameTimes.push(t);
    while (frameTimes.length && frameTimes[0] < t - 2000) frameTimes.shift();

    const c = classifyFrame(r, g, b, o);
    if (!c.finger) {
      if (badSince === null) badSince = t;
      badReason = c.reason;
      if (t - badSince >= o.lostFingerS * 1000 && segStart !== null) clearSignal(c.reason);
      return;
    }
    badSince = null;

    recent.push({ t, sat: c.sat });
    while (recent.length && recent[0].t < t - 500) recent.shift();
    if (recent.length >= 3 && recent.filter((f) => f.sat).length / recent.length > o.satFraction) {
      clearSignal("saturated: press lighter");
      recent = [{ t, sat: true }];
      return;
    }
    if (c.sat) return; // a clipped frame carries no pulse information

    if (lastRaw !== null) {
      const rel = (r - lastRaw) / lastRaw;
      // Forgiving placement: a brightness jump (exposure change, or the finger
      // shifting a little) is stitched over instead of restarting the whole
      // measurement. Only continuous movement pauses publishing, and only a
      // lifted finger (lostFingerS) resets.
      if (Math.abs(rel) > o.stepJump) {
        gain *= lastRaw / r; // stitch: the new level continues the old one
        steps.push(t);
        while (steps.length && steps[0] < t - 2000) steps.shift();
        if (Math.abs(rel) > o.motionJump || steps.length > o.maxStepsIn2s) movingUntil = t + o.movingPauseS * 1000;
      }
    }
    if (segStart === null) {
      segStart = t;
      gain = 1;
    }
    lastRaw = r;
    seg.push({ t, v: r * gain });
    while (seg.length && seg[0].t < t - o.bufferS * 1000) seg.shift();
  }

  function analyse() {
    const tEnd = seg.at(-1).t;
    const tStart = Math.max(seg[0].t, tEnd - (o.windowS + 1.5) * 1000);
    const from = seg.findIndex((f) => f.t >= tStart - 1000 / o.fs);
    const part = seg.slice(Math.max(0, from - 1));
    const times = part.map((f) => f.t);
    const vals = part.map((f) => f.v);
    let x = resample(times, vals, o.fs, tStart, tEnd);
    if (x.length < o.fs * 2) return null;
    // Normalise to the mean level and invert: more blood = darker = higher.
    const level = x.reduce((a, b) => a + b, 0) / x.length;
    x = x.map((v) => -(v / level - 1));
    const trend = movingAverage(x, Math.round(o.detrendS * o.fs));
    x = x.map((v, i) => v - trend[i]);
    const y = bandpass(x, o.fs, o.bandLowHz, o.bandHighHz);
    // Analyse only the last windowS (the extra 1.5 s absorbs filter edges).
    const winN = Math.min(y.length, Math.round(o.windowS * o.fs));
    const w = y.slice(y.length - winN);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const z = w.map((v) => v - mean);
    const sd = Math.sqrt(z.reduce((a, b) => a + b * b, 0) / z.length);

    // Linear 2x upsampling is accurate here: z has nothing above ~3.5 Hz.
    const u = new Float64Array((z.length - 1) * UP + 1);
    for (let i = 0; i < z.length - 1; i++) {
      for (let j = 0; j < UP; j++) u[i * UP + j] = z[i] + ((z[i + 1] - z[i]) * j) / UP;
    }
    u[u.length - 1] = z[z.length - 1];
    const kTop = Math.min(kMax, u.length - 3);
    const ac = autocorrelation(u, kMin, kTop);
    const period = pickPeriod(ac, kMin, kTop);
    let bpmAc = null;
    let q = 0;
    if (period) {
      bpmAc = (60 * fsA) / period.lag;
      q = period.r;
    }
    let bpmBeats = null;
    let keptFraction = 0;
    let peaks = [];
    if (sd > 0) {
      // Peaks at least 0.6 periods apart (0.33 s without a period), so a
      // dicrotic bump is not counted as a beat.
      const minDist = period ? Math.max(2, Math.round(0.6 * period.lag)) : Math.round(0.33 * fsA);
      peaks = findPeaks(u, minDist, 0.2 * sd);
      const br = beatRate(peaks, fsA);
      bpmBeats = br ? br.bpm : null;
      keptFraction = br ? br.keptFraction : 0;
    }
    const tFirst = tEnd - (winN - 1) * (1000 / o.fs);
    return {
      z,
      sd,
      bpmAc,
      q,
      bpmBeats,
      keptFraction,
      peakTimes: peaks.map((p) => tFirst + (p * 1000) / fsA),
      seconds: (tEnd - tStart) / 1000,
    };
  }

  function poll(now) {
    const fps =
      frameTimes.length >= 2
        ? Math.round(((frameTimes.length - 1) * 1000) / (frameTimes.at(-1) - frameTimes[0]))
        : 0;
    const out = {
      publishable: false,
      bpm: null,
      quality: 0,
      fingerOn: false,
      reason: "",
      fps,
      windowSeconds: 0,
      beat: false,
      candidate: null,
    };
    if (lastT === null || now - lastT > 1000) {
      out.reason = "no camera frames";
      if (segStart !== null) clearSignal("no camera frames");
      return out;
    }
    if (badSince !== null) {
      out.reason = badReason;
      return out;
    }
    if (segStart === null || !seg.length) {
      out.fingerOn = !resetReason.startsWith("saturated");
      out.reason = resetReason || "starting";
      return out;
    }
    out.fingerOn = true;
    const goodS = (seg.at(-1).t - segStart) / 1000;
    out.windowSeconds = Math.round(Math.min(goodS, o.windowS) * 10) / 10;
    if (goodS < 2) {
      out.reason = `hold still: ${Math.ceil(o.minGoodS - goodS)} s`;
      return out;
    }
    const a = analyse();
    if (!a) {
      out.reason = `hold still: ${Math.ceil(o.minGoodS - goodS)} s`;
      return out;
    }
    o.debug?.(a);
    filtered = a.sd > 0 ? a.z.map((v) => v / (3 * a.sd)) : a.z;
    const newest = a.peakTimes.filter((t) => t > lastBeatT && t <= now);
    if (newest.length) {
      out.beat = true;
      lastBeatT = newest.at(-1);
    }

    let q = a.q;
    let est = a.bpmAc;
    if (est !== null && a.bpmBeats !== null && Math.abs(a.bpmBeats - est) / est <= o.agreeTol) {
      const disagree = Math.abs(a.bpmBeats - est) / est;
      est = (est + a.bpmBeats) / 2; // both methods agree: average them
      // Soft penalties: the closer the two methods agree and the more regular
      // the beat intervals, the more the estimate is trusted. Noise that
      // happens to correlate is usually irregular.
      q *= 1 - 2 * disagree;
      q *= Math.min(1, 0.4 + 0.6 * a.keptFraction);
    } else {
      q *= 0.5; // disagreement (or no beats found): not trustworthy
    }
    out.quality = Math.round(q * 100) / 100;
    // Rough rate even when it is not trustworthy enough to publish (used by
    // the optional demo hold in hold.js).
    if (est !== null && est >= o.minBpm && est <= o.maxBpm) out.candidate = Math.round(est);

    if (goodS < o.minGoodS) {
      out.reason = `hold still: ${Math.ceil(o.minGoodS - goodS)} s`;
      return out;
    }
    const moving = now < movingUntil;
    if (moving || est === null || q < o.minQuality || est < o.minBpm - 3 || est > o.maxBpm + 3) {
      rejects++;
      streak = 0;
      if (rejects >= o.maxRejects) accepted = [];
      out.reason = moving ? "moving: keep still" : "weak signal: keep still, press lightly";
      return out;
    }
    rejects = 0;
    streak++;
    accepted.push(est);
    if (accepted.length > o.medianN) accepted.shift();
    const lastFew = accepted.slice(-o.minStreak);
    const spread = (Math.max(...lastFew) - Math.min(...lastFew)) / median(lastFew);
    if (streak < o.minStreak || spread > o.maxSpread) {
      out.reason = "locking on";
      return out;
    }
    out.bpm = Math.round(median(accepted));
    out.publishable = true;
    out.reason = "ok";
    return out;
  }

  function filteredTail(n) {
    return Array.from(filtered.slice(Math.max(0, filtered.length - n)));
  }

  return { push, poll, reset, filteredTail, options: o };
}
