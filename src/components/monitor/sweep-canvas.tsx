"use client";

import { useEffect, useRef } from "react";
import type { LiveVitals } from "@/lib/types";
import { WaveSynth, paramsFromVitals, type Beat, type WaveSample } from "./waveform";

export type ChannelKey = keyof WaveSample;

export interface ChannelSpec {
  key: ChannelKey;
  /** Small-caps label drawn top-left (HTML overlay). */
  label: string;
  /** Optional second label, e.g. "x1" gain or "mmHg". */
  sublabel?: string;
  color: string;
  /** Vertical range in channel units [bottom, top]. */
  range: [number, number];
  /** Relative height. */
  weight: number;
  /** Dashed scale lines with labels (e.g. ABP 0 / 80 / 160). */
  scale?: number[];
}

/** Synth sample rate (Hz). */
const SR = 200;

/**
 * Stacked sweeping waveform channels on <canvas> (keynote styling: smooth
 * glowing line, fading trail instead of a hard erase bar, faint baseline).
 *
 * One requestAnimationFrame loop drives all channels from a shared
 * synthesiser, so ECG, ABP and pleth stay in sync. Each canvas is DPR-scaled
 * and resized with a ResizeObserver. `frozen` (stale data) stops the sweep
 * and keeps the last trace; `reducedMotion` draws a static strip that is
 * refreshed once per second instead of sweeping.
 */
export function SweepCanvas({
  vitals,
  channels,
  frozen,
  reducedMotion,
  pxPerSecond,
  onBeat,
  showLabels = true,
  seed = 1,
  className = "",
}: {
  vitals: LiveVitals;
  channels: ChannelSpec[];
  frozen: boolean;
  reducedMotion: boolean;
  /** Sweep speed in CSS px / s. Defaults to ~25 mm/s (94 px/s), slower when narrow. */
  pxPerSecond?: number;
  onBeat?: (b: Beat) => void;
  showLabels?: boolean;
  seed?: number;
  className?: string;
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const synthRef = useRef<WaveSynth | null>(null);
  const live = useRef({ channels, frozen, reducedMotion, pxPerSecond, onBeat });

  useEffect(() => {
    live.current = { channels, frozen, reducedMotion, pxPerSecond, onBeat };
  });

  // Feed new numbers into the synthesiser (create it lazily on first effect).
  useEffect(() => {
    const p = paramsFromVitals(vitals);
    if (!synthRef.current) synthRef.current = new WaveSynth(p, seed);
    else synthRef.current.set(p);
  }, [vitals, seed]);

  const channelCount = channels.length;

  useEffect(() => {
    const canvases = canvasRefs.current.slice(0, channelCount).filter((c): c is HTMLCanvasElement => c != null);
    if (canvases.length === 0) return;

    // Ring buffers, one per channel; NaN = not yet written.
    let n = 0;
    let bufs: Float32Array[] = [];
    let write = 0;
    let clock: number | null = null; // synth time of the next sample (s)
    let lastStatic = 0;
    let frozenDrawn = false;
    let cssW = 0;
    const cssH: number[] = canvases.map(() => 0);
    const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

    const speed = () => {
      const s = live.current.pxPerSecond;
      if (s) return s;
      return cssW < 520 ? 62 : 94;
    };

    const allocate = () => {
      const want = Math.max(16, Math.ceil((cssW / speed()) * SR));
      if (want === n) return;
      n = want;
      bufs = canvases.map(() => new Float32Array(n).fill(Number.NaN));
      write = 0;
    };

    const resize = () => {
      const r = dpr();
      canvases.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        if (i === 0) cssW = rect.width;
        cssH[i] = rect.height;
        const w = Math.max(1, Math.round(rect.width * r));
        const h = Math.max(1, Math.round(rect.height * r));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      });
      allocate();
      draw();
    };

    const draw = () => {
      const { channels: specs, reducedMotion: rm, frozen: fz } = live.current;
      const r = dpr();
      const pxPerSample = cssW / n;
      const gap = Math.ceil(14 / Math.max(pxPerSample, 0.01)); // erase gap ahead of the pen (~14 px)
      canvases.forEach((c, ci) => {
        const ctx = c.getContext("2d");
        const spec = specs[ci];
        if (!ctx || !spec) return;
        const h = cssH[ci];
        ctx.setTransform(r, 0, 0, r, 0, 0);
        ctx.clearRect(0, 0, cssW, h);
        const [lo, hi] = spec.range;
        const padT = 6;
        const padB = 6;
        const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);

        // Faint baseline / scale lines.
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        if (spec.scale) {
          ctx.setLineDash([2, 6]);
          for (const s of spec.scale) {
            const yy = Math.round(y(s)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, yy);
            ctx.lineTo(cssW - 24, yy);
            ctx.stroke();
          }
        } else {
          const base = spec.key === "ecg" ? 0 : spec.key === "resp" ? 0 : lo;
          const yy = Math.round(y(base)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(cssW, yy);
          ctx.stroke();
        }
        ctx.restore();

        // Scale labels sit above the trace on a small dark plate.
        const drawScaleLabels = () => {
          if (!spec.scale) return;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
          ctx.font = "500 9px -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif";
          ctx.textAlign = "right";
          for (const s of spec.scale) {
            const yy = Math.round(y(s)) + 0.5;
            const label = String(s);
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(5,5,6,0.88)";
            ctx.fillRect(cssW - tw - 6, yy - 6, tw + 6, 12);
            ctx.fillStyle = "rgba(255,255,255,0.34)";
            ctx.fillText(label, cssW - 2, yy + 3);
          }
          ctx.restore();
        };

        const buf = bufs[ci];
        if (!buf || n === 0) {
          drawScaleLabels();
          return;
        }

        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = spec.color;
        ctx.shadowColor = spec.color;

        if (rm) {
          // Static strip: oldest on the left, newest on the right, no fade.
          ctx.shadowBlur = 4;
          ctx.globalAlpha = fz ? 0.55 : 1;
          ctx.beginPath();
          let pen = false;
          for (let k = 0; k < n; k++) {
            const v = buf[(write + k) % n];
            if (Number.isNaN(v)) {
              pen = false;
              continue;
            }
            const xx = k * pxPerSample;
            if (pen) ctx.lineTo(xx, y(v));
            else ctx.moveTo(xx, y(v));
            pen = true;
          }
          ctx.stroke();
          ctx.restore();
          drawScaleLabels();
          return;
        }

        // Sweep: newest sample sits at index write-1; draw from oldest to
        // newest in chunks whose opacity fades with age.
        const CHUNKS = 14;
        const visible = Math.max(0, n - gap);
        const chunk = Math.max(2, Math.ceil(visible / CHUNKS));
        for (let start = 0; start < visible; start += chunk) {
          const end = Math.min(visible, start + chunk + 1);
          const age = 1 - (start + chunk / 2) / visible; // 1 = oldest, 0 = newest
          const alpha = (fz ? 0.5 : 1) * (1 - 0.72 * Math.pow(age, 1.15));
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = 3 + 6 * (1 - age);
          ctx.beginPath();
          let pen = false;
          for (let k = start; k < end; k++) {
            const idx = (write + gap + k) % n;
            const v = buf[idx];
            if (Number.isNaN(v) || (pen && idx === 0)) {
              // NaN or wrap from right edge back to x=0: lift the pen.
              pen = false;
              if (Number.isNaN(v)) continue;
            }
            const xx = idx * pxPerSample;
            if (pen) ctx.lineTo(xx, y(v));
            else ctx.moveTo(xx, y(v));
            pen = true;
          }
          ctx.stroke();
        }

        // Soft glowing pen head at the newest sample.
        const headIdx = (write - 1 + n) % n;
        const hv = buf[headIdx];
        if (!fz && !Number.isNaN(hv)) {
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 12;
          ctx.fillStyle = spec.color;
          ctx.beginPath();
          ctx.arc(headIdx * pxPerSample, y(hv), 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        drawScaleLabels();
      });
    };

    const pump = (tNow: number) => {
      const synth = synthRef.current;
      if (!synth || n === 0) return;
      if (clock == null || tNow - clock > 3) clock = tNow - 1 / SR;
      while (clock <= tNow) {
        const s = synth.sample(clock);
        canvases.forEach((_, ci) => {
          const key = live.current.channels[ci]?.key;
          if (key && bufs[ci]) bufs[ci][write] = s[key];
        });
        write = (write + 1) % n;
        clock += 1 / SR;
      }
      const beats = synth.takeBeats();
      const cb = live.current.onBeat;
      // After a long frame gap (tab hidden) only the latest beat is signalled.
      if (cb) for (const b of beats) if (b.t > tNow - 0.3) cb(b);
    };

    let raf = 0;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      const t = ms / 1000;
      const { frozen: fz, reducedMotion: rm } = live.current;
      if (fz) {
        clock = null; // resume from "now" when data returns
        if (!frozenDrawn) draw(); // one dimmed redraw, then hold the last trace
        frozenDrawn = true;
        return;
      }
      frozenDrawn = false;
      if (rm) {
        if (t - lastStatic < 1) return;
        lastStatic = t;
        pump(t);
        draw();
        return;
      }
      pump(t);
      draw();
    };

    const ro = new ResizeObserver(resize);
    canvases.forEach((c) => ro.observe(c));
    resize();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [channelCount]);

  const total = channels.reduce((s, c) => s + c.weight, 0);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {channels.map((c, i) => (
        <div key={c.key} className="relative min-h-0" style={{ flex: `${c.weight / total} 1 0%` }}>
          {showLabels && (
            <div className="pointer-events-none absolute left-0 top-0.5 z-10 flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.16em]">
              <span style={{ color: c.color }}>{c.label}</span>
              {c.sublabel && <span className="text-white/40 normal-case tracking-[0.08em]">{c.sublabel}</span>}
            </div>
          )}
          <canvas
            ref={(el) => {
              canvasRefs.current[i] = el;
            }}
            className="absolute inset-0 h-full w-full"
            aria-hidden
          />
        </div>
      ))}
    </div>
  );
}
