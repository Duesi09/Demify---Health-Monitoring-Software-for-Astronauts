/**
 * Alarm tones in the spirit of IEC 60601-1-8 (medical alarm systems), made
 * with WebAudio. Client-only. Every entry point is defensive: browsers
 * without WebAudio, blocked autoplay or a closed context must never throw
 * into the UI.
 *
 *  - High priority: a burst of 10 pulses, "3 + 2, pause, 3 + 2", repeated
 *    about every 6.5 s.
 *  - Medium priority: 3 pulses, repeated about every 15 s.
 *
 * Pulses are short tones (fundamental 523 Hz / 659 Hz / 784 Hz with four
 * decaying harmonics so they are easy to localise), with a fast attack and
 * decay and a moderate master volume.
 */

export type AlarmTone = "high" | "medium";

/** Pause between the start of two bursts (s). */
export const BURST_INTERVAL_S: Record<AlarmTone, number> = { high: 6.5, medium: 15 };

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function audioSupported(): boolean {
  return audioCtor() != null;
}

/** Offsets (s) of each pulse inside one burst. */
function pattern(tone: AlarmTone): { at: number; freq: number; dur: number }[] {
  // C5 / E5 / G5: a bright triad-like contour, like the IEC "general" melodies.
  const C = 523.25;
  const E = 659.25;
  const G = 783.99;
  if (tone === "medium") {
    const dur = 0.2;
    return [
      { at: 0, freq: C, dur },
      { at: 0.32, freq: E, dur },
      { at: 0.64, freq: G, dur },
    ];
  }
  // High priority: x x x _ x x ____ x x x _ x x  (10 pulses)
  const dur = 0.14;
  const step = 0.2;
  const half = [0, step, step * 2, step * 2 + 0.38, step * 3 + 0.38];
  const freqs = [C, E, G, G, C];
  const second = 1.0 + half[4] + 0.12;
  return [
    ...half.map((at, i) => ({ at, freq: freqs[i], dur })),
    ...half.map((at, i) => ({ at: second + at, freq: freqs[i], dur })),
  ];
}

/**
 * Small WebAudio engine. Create once and keep for the page's lifetime:
 * the AudioContext can only start after a user gesture (autoplay policy).
 */
export class AlarmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wave: PeriodicWave | null = null;

  /** True once an AudioContext exists and is running. */
  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /**
   * Create (if needed) and resume the context. Call from a user gesture to
   * unlock audio. Resolves to whether audio can play now.
   */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const C = audioCtor();
        if (!C) return false;
        this.ctx = new C();
        const master = this.ctx.createGain();
        master.gain.value = 0.16;
        // Gentle low-pass so the harmonics are present but not harsh.
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 5200;
        master.connect(lp).connect(this.ctx.destination);
        this.master = master;
        // Fundamental + 4 harmonics (IEC asks for >= 4 harmonics in the 300-4000 Hz band).
        const real = new Float32Array([0, 0, 0, 0, 0, 0]);
        const imag = new Float32Array([0, 1, 0.55, 0.35, 0.22, 0.14]);
        this.wave = this.ctx.createPeriodicWave(real, imag);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "running";
    } catch {
      return false;
    }
  }

  /** Plays one burst of the given priority. No-op when audio is unavailable. */
  playBurst(tone: AlarmTone): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    try {
      const t0 = ctx.currentTime + 0.03;
      for (const p of pattern(tone)) {
        const osc = ctx.createOscillator();
        if (this.wave) osc.setPeriodicWave(this.wave);
        else osc.type = "triangle";
        osc.frequency.value = p.freq;
        const env = ctx.createGain();
        const start = t0 + p.at;
        const attack = 0.018;
        const release = 0.045;
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(1, start + attack);
        env.gain.setValueAtTime(1, start + p.dur - release);
        env.gain.linearRampToValueAtTime(0, start + p.dur);
        osc.connect(env).connect(master);
        osc.start(start);
        osc.stop(start + p.dur + 0.02);
        osc.onended = () => {
          try {
            osc.disconnect();
            env.disconnect();
          } catch {
            /* already disconnected */
          }
        };
      }
    } catch {
      /* never let audio break the alarm UI */
    }
  }

  close(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.wave = null;
  }
}
