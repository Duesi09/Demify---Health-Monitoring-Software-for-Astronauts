/**
 * Alarm siren made with WebAudio. Client-only. Every entry point is
 * defensive: browsers without WebAudio, blocked autoplay or a closed context
 * must never throw into the UI.
 *
 * The sound is deliberately shrill and startling, like a building / vehicle
 * alarm, so nobody on board can miss it:
 *  - High priority: a fast "yelp" siren (frequency sweeping 700 -> 1700 Hz
 *    about 4 times per second) for ~3.4 s, repeated every 4 s.
 *  - Medium priority: a two-tone "hi-lo" siren (1300 / 950 Hz) for ~1.6 s,
 *    repeated every 9 s.
 * Two slightly detuned square waves give the harsh, buzzing timbre of a real
 * alarm sounder; a compressor keeps it loud without clipping.
 */

export type AlarmTone = "high" | "medium";

/** Pause between the start of two bursts (s). */
export const BURST_INTERVAL_S: Record<AlarmTone, number> = { high: 4, medium: 9 };

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function audioSupported(): boolean {
  return audioCtor() != null;
}

/**
 * Small WebAudio engine. Create once and keep for the page's lifetime:
 * the AudioContext can only start after a user gesture (autoplay policy).
 */
export class AlarmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listener: ((running: boolean) => void) | null = null;

  /** Called whenever the context starts or gets suspended (e.g. by the OS). */
  onRunningChange(cb: ((running: boolean) => void) | null): void {
    this.listener = cb;
  }

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
        this.ctx.onstatechange = () => this.listener?.(this.ctx?.state === "running");
        const master = this.ctx.createGain();
        master.gain.value = 0.32;
        // Keep it loud but never clipping when bursts overlap.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 8;
        // Cut rumble only: the shrill top end is the point.
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 380;
        master.connect(hp).connect(comp).connect(this.ctx.destination);
        this.master = master;
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx.state === "running";
    } catch {
      return false;
    }
  }

  /** Plays one siren burst of the given priority. No-op when audio is unavailable. */
  playBurst(tone: AlarmTone): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    try {
      const t0 = ctx.currentTime + 0.03;
      const dur = tone === "high" ? 3.4 : 1.6;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + 0.02);
      env.gain.setValueAtTime(1, t0 + dur - 0.05);
      env.gain.linearRampToValueAtTime(0, t0 + dur);
      env.connect(master);

      const oscs = [0, 7].map((detune) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.detune.value = detune * 10; // slight beating = harsher, more "electronic sounder"
        o.connect(env);
        return o;
      });

      for (const o of oscs) {
        const f = o.frequency;
        if (tone === "high") {
          // Yelp: rapid upward sweeps, ~4 per second.
          const period = 0.24;
          for (let t = 0; t < dur; t += period) {
            f.setValueAtTime(700, t0 + t);
            f.exponentialRampToValueAtTime(1700, t0 + t + period * 0.92);
          }
        } else {
          // Hi-lo: alternating two tones.
          const period = 0.4;
          let hi = true;
          for (let t = 0; t < dur; t += period / 2) {
            f.setValueAtTime(hi ? 1300 : 950, t0 + t);
            hi = !hi;
          }
        }
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      }
      oscs[0].onended = () => {
        try {
          for (const o of oscs) o.disconnect();
          env.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    } catch {
      /* never let audio break the alarm UI */
    }
  }

  close(): void {
    this.listener = null;
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
  }
}
