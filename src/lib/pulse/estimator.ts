/**
 * Camera pulse estimate (photoplethysmography, PPG) for the phone demo.
 *
 * A fingertip held over the phone's main camera with the torch on looks red;
 * its brightness rises and falls a little with every heartbeat, because the
 * blood volume in the skin changes. The phone page samples the mean red value
 * of each video frame and this module turns that brightness series into a
 * pulse rate:
 *
 *   1. resample the frames (irregular timing) onto a uniform 30 Hz grid,
 *   2. remove the slow drift (finger pressure, auto exposure) and smooth the
 *      frame noise,
 *   3. find the repetition period with a normalised autocorrelation between
 *      40 and 180 bpm.
 *
 * The autocorrelation peak height doubles as a signal quality (0..1): a calm,
 * well-covered finger gives 0.7 and more, noise or movement gives little.
 * This is a training demo, not a medical measurement.
 *
 * Pure functions, no browser APIs, so it is unit-tested with synthetic signals.
 */

export interface PulseSample {
  /** Frame time in ms (performance.now() or Date.now()). */
  t: number;
  /** Mean red brightness of the sampled area, 0..255. */
  red: number;
  /** Mean green brightness (finger detection), 0..255. */
  green?: number;
}

export interface PulseEstimate {
  bpm: number;
  /** Autocorrelation peak, 0..1. */
  quality: number;
  /** Seconds of signal the estimate is based on. */
  windowS: number;
  /** Colour channel the estimate came from (red is clipped under a strong torch). */
  channel: "red" | "green";
}

export const PULSE_MIN_BPM = 40;
export const PULSE_MAX_BPM = 180;
/** Below this quality the estimate is not shown or sent. */
export const PULSE_MIN_QUALITY = 0.5;
/** Signal needed before the first estimate. */
export const PULSE_MIN_WINDOW_S = 5;
/** Signal used per estimate (older samples are ignored). */
export const PULSE_WINDOW_S = 10;

const RATE_HZ = 30;

/**
 * True when the frame looks like a fingertip lit by the torch: bright red and
 * much redder than green. A table, a wall or the room give neither.
 */
export function looksLikeFinger(red: number, green: number): boolean {
  return red >= 80 && red >= green * 1.4;
}

/** Linear interpolation of the samples onto a uniform grid (rateHz) between the first and last sample. */
export function resample(
  samples: readonly PulseSample[],
  rateHz = RATE_HZ,
  channel: "red" | "green" = "red",
): number[] {
  if (samples.length < 2) return [];
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const step = 1000 / rateHz;
  const out: number[] = [];
  let j = 0;
  for (let t = t0; t <= t1; t += step) {
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1];
    const span = b.t - a.t;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    const va = channel === "red" ? a.red : (a.green ?? 0);
    const vb = channel === "red" ? b.red : (b.green ?? 0);
    out.push(va + (vb - va) * f);
  }
  return out;
}

/** Centred moving average with a window of n samples (shrinks at the edges). */
function movingAverage(x: readonly number[], n: number): number[] {
  const half = Math.floor(n / 2);
  const prefix = [0];
  for (const v of x) prefix.push(prefix[prefix.length - 1] + v);
  return x.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(x.length, i + half + 1);
    return (prefix[hi] - prefix[lo]) / (hi - lo);
  });
}

/** Drift removed (1.5 s average subtracted) and frame noise smoothed (~5 samples). */
export function bandpass(x: readonly number[], rateHz = RATE_HZ): number[] {
  const trend = movingAverage(x, Math.round(rateHz * 1.5));
  const detrended = x.map((v, i) => v - trend[i]);
  return movingAverage(detrended, Math.max(3, Math.round(rateHz / 6)));
}

/** Normalised autocorrelation at one lag (Pearson correlation of the series with its shifted copy). */
function correlationAt(x: readonly number[], lag: number): number {
  const n = x.length - lag;
  if (n < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += x[i];
    sb += x[i + lag];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - ma;
    const b = x[i + lag] - mb;
    num += a * b;
    da += a * a;
    db += b * b;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

/** Period of one evenly sampled, band-passed series: { bpm, quality } or null. */
function periodOf(x: readonly number[]): { bpm: number; quality: number } | null {
  const minLag = Math.floor((RATE_HZ * 60) / PULSE_MAX_BPM);
  const maxLag = Math.ceil((RATE_HZ * 60) / PULSE_MIN_BPM);
  if (x.length < maxLag + RATE_HZ) return null;

  const r: number[] = [];
  for (let lag = 0; lag <= maxLag + 1; lag++) r.push(lag >= minLag - 1 ? correlationAt(x, lag) : 0);

  // Local maxima in the allowed range.
  const peaks: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (r[lag] > 0 && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) peaks.push(lag);
  }
  if (peaks.length === 0) return null;
  const best = Math.max(...peaks.map((l) => r[l]));
  // The shortest lag that is almost as good as the best one is the period;
  // longer lags with a similar peak are its multiples (2, 3 beats).
  const lag = peaks.find((l) => r[l] >= best * 0.9) ?? peaks[0];
  const quality = r[lag];

  // Parabolic interpolation around the peak for sub-sample precision.
  const y0 = r[lag - 1];
  const y1 = r[lag];
  const y2 = r[lag + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  const bpm = (60 * RATE_HZ) / (lag + shift);
  if (bpm < PULSE_MIN_BPM || bpm > PULSE_MAX_BPM) return null;
  return { bpm, quality: Math.min(1, quality) };
}

/** Channels worth analysing: red unless it is clipped (torch too bright), green when recorded and not dark. */
function usableChannels(samples: readonly PulseSample[]): ("red" | "green")[] {
  const mean = (f: (s: PulseSample) => number) => samples.reduce((a, s) => a + f(s), 0) / samples.length;
  const out: ("red" | "green")[] = [];
  if (mean((s) => s.red) < 250) out.push("red");
  if (samples.every((s) => s.green !== undefined) && mean((s) => s.green ?? 0) >= 4) out.push("green");
  return out;
}

/**
 * Pulse rate of the last PULSE_WINDOW_S seconds of samples, or null when
 * there is too little signal or no clear rhythm (quality < PULSE_MIN_QUALITY).
 * Analyses the red and the green channel and keeps the clearer one: with a
 * strong torch the red channel is often clipped at 255, green still pulses.
 */
export function estimatePulse(samples: readonly PulseSample[]): PulseEstimate | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1].t;
  const recent = samples.filter((s) => s.t >= end - PULSE_WINDOW_S * 1000);
  if (recent.length < 2) return null;
  const windowS = (end - recent[0].t) / 1000;
  if (windowS < PULSE_MIN_WINDOW_S) return null;

  let best: { bpm: number; quality: number; channel: "red" | "green" } | null = null;
  for (const channel of usableChannels(recent)) {
    const p = periodOf(bandpass(resample(recent, RATE_HZ, channel)));
    if (p && (!best || p.quality > best.quality)) best = { ...p, channel };
  }
  if (!best || best.quality < PULSE_MIN_QUALITY) return null;
  return { ...best, windowS };
}

/**
 * Keeps the recent samples and smooths the shown value: the median of the
 * last few accepted estimates, so one bad window does not make the number jump.
 */
export class PulseTracker {
  private samples: PulseSample[] = [];
  private estimates: number[] = [];
  private channel: "red" | "green" = "red";

  /** Adds a frame. Frames without a finger reset the tracker (the signal is gone). */
  add(sample: PulseSample): void {
    if (sample.green !== undefined && !looksLikeFinger(sample.red, sample.green)) {
      this.reset();
      return;
    }
    this.samples.push(sample);
    const cutoff = sample.t - (PULSE_WINDOW_S + 1) * 1000;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Number of samples currently kept. */
  get size(): number {
    return this.samples.length;
  }

  /** Seconds of continuous finger signal kept. */
  get seconds(): number {
    if (this.samples.length < 2) return 0;
    return (this.samples[this.samples.length - 1].t - this.samples[0].t) / 1000;
  }

  /** Recent band-passed signal for drawing a waveform (last seconds of samples). */
  waveform(seconds = 4): number[] {
    if (this.samples.length < 2) return [];
    const end = this.samples[this.samples.length - 1].t;
    const recent = this.samples.filter((s) => s.t >= end - (seconds + 1.5) * 1000);
    const x = bandpass(resample(recent, RATE_HZ, this.channel));
    return x.slice(Math.max(0, x.length - seconds * RATE_HZ));
  }

  /** Current smoothed estimate, or null. Call about once per second. */
  estimate(): PulseEstimate | null {
    const e = estimatePulse(this.samples);
    if (!e) {
      this.estimates = [];
      return null;
    }
    this.channel = e.channel;
    this.estimates.push(e.bpm);
    if (this.estimates.length > 5) this.estimates.shift();
    const sorted = [...this.estimates].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { ...e, bpm: median };
  }

  reset(): void {
    this.samples = [];
    this.estimates = [];
  }
}
