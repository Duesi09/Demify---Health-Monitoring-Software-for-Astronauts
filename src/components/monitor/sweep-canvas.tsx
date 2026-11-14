"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveVitals } from "@/lib/types";
import { WaveSynth, paramsFromVitals, type Beat, type WaveSample } from "./waveform";

export type ChannelKey = keyof WaveSample;

export interface ChannelSpec {
  key: ChannelKey;
  /** Small-caps label drawn top-left (HTML overlay). */
  label: string;
  /** Optional second label, e.g. "mmHg". */
  sublabel?: string;
  /** Append the real sweep speed ("25 mm/s") to the sublabel. */
  showSpeed?: boolean;
  color: string;
  /** Vertical range in channel units [bottom, top]. */
  range: [number, number];
  /** Relative height. */
  weight: number;
  /** Dashed scale lines with labels in the right gutter (e.g. ABP 0 / 80 / 160). */
  scale?: number[];
  /** Calibration pulse drawn in the right gutter (ECG: 1 mV). */
  cal?: { value: number; label: string };
}

/** Synth sample rate (Hz). */
const SR = 200;
/** CSS px per mm (CSS reference pixel: 96 px per inch). */
const PX_PER_MM = 96 / 25.4;
/** Standard sweep (25 mm/s) on wide canvases, slower on phones so a few beats fit. */
const SPEED_WIDE_MM_S = 25;
const SPEED_NARROW_MM_S = 16;
/** Right-hand gutter for scale labels and the calibration pulse (px). */
const GUTTER = 28;
/** Samples per ink stroke (~3 frames' worth at 60 fps). */
const INK_CHUNK = 4;

/** "#rrggbb" -> "rgba(r,g,b,a)". */
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/**
 * Stacked sweeping waveform channels on <canvas> (keynote styling: smooth
 * glowing line, fading trail instead of a hard erase bar, faint baseline).
 *
 * One requestAnimationFrame loop drives all channels from a shared
 * synthesiser, so ECG, ABP and pleth stay in sync. Each canvas is DPR-scaled
 * and resized with a ResizeObserver. `frozen` (stale data) stops the sweep
 * and keeps the last trace; `reducedMotion` draws a static strip that is
 * refreshed once per second instead of sweeping.
 *
 * Performance: the blurred glow is cached. Each channel keeps an offscreen
 * "ink" canvas onto which only the newly arrived segment is stroked (with
 * shadowBlur) every frame; the visible canvas is then one drawImage plus a
 * gradient mask (destination-out) for the age fade. Scale labels live in a
 * right-hand gutter, so they never cover the trace.
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
  /** Sweep speed in CSS px / s. Defaults to 25 mm/s, 16 mm/s when narrow. */
  pxPerSecond?: number;
  onBeat?: (b: Beat) => void;
  showLabels?: boolean;
  seed?: number;
  className?: string;
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const synthRef = useRef<WaveSynth | null>(null);
  const live = useRef({ channels, frozen, reducedMotion, pxPerSecond, onBeat });
  /** Actual sweep speed in mm/s, reported by the resize observer. */
  const [speedMm, setSpeedMm] = useState<number | null>(null);

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
    // Offscreen "ink" layer per channel: the glowing trace is stroked once,
    // incrementally, as samples arrive (cached glow), then composited each
    // frame with an age-fade mask.
    const inks = canvases.map(() => document.createElement("canvas"));

    // Ring buffers, one per channel; NaN = not yet written. Sample number m
    // (counted from allocation) lives at ring index m % n.
    let n = 0;
    let bufs: Float32Array[] = [];
    let written = 0;
    let clock: number | null = null; // synth time of the next sample (s)
    let lastStatic = 0;
    let frozenDrawn = false;
    let cssW = 0;
    let plotW = 0;
    const cssH: number[] = canvases.map(() => 0);
    /** Samples already inked per channel (-1 = redraw the whole ink layer). */
    const inked: number[] = canvases.map(() => -1);
    const inkKey: string[] = canvases.map(() => "");
    const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
    const gutter = () => (live.current.channels.some((c) => c.scale || c.cal) ? GUTTER : 0);

    const speed = () => {
      const s = live.current.pxPerSecond;
      if (s) return s;
      return (cssW < 520 ? SPEED_NARROW_MM_S : SPEED_WIDE_MM_S) * PX_PER_MM;
    };

    const allocate = () => {
      const want = Math.max(16, Math.ceil((plotW / speed()) * SR));
      if (want === n) return;
      n = want;
      bufs = canvases.map(() => new Float32Array(n).fill(Number.NaN));
      written = 0;
      inked.fill(-1);
    };

    /** px per sample and the erase gap ahead of the pen (in samples, ~14 px). */
    const geom = () => {
      const pps = plotW / Math.max(1, n);
      return { pps, gap: Math.ceil(14 / Math.max(pps, 0.01)) };
    };
    const yFor = (ci: number, spec: ChannelSpec) => {
      const h = cssH[ci];
      const [lo, hi] = spec.range;
      return (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (h - 12);
    };

    const resize = (report = false) => {
      const r = dpr();
      canvases.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        if (i === 0) {
          cssW = rect.width;
          plotW = Math.max(1, cssW - gutter());
        }
        cssH[i] = rect.height;
        const w = Math.max(1, Math.round(rect.width * r));
        const h = Math.max(1, Math.round(rect.height * r));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        if (inks[i].width !== w || inks[i].height !== h) {
          inks[i].width = w;
          inks[i].height = h;
          inked[i] = -1;
        }
      });
      allocate();
      draw();
      // Only from the observer callback, never synchronously in the effect.
      if (report && cssW > 0) setSpeedMm(Math.round((speed() / PX_PER_MM) * 10) / 10);
    };

    /** Path through samples [from, to) by sample number; pen lifts at the wrap and at NaN. */
    const tracePath = (ctx: CanvasRenderingContext2D, buf: Float32Array, from: number, to: number, y: (v: number) => number) => {
      const { pps } = geom();
      ctx.beginPath();
      let pen = false;
      for (let m = from; m < to; m++) {
        const idx = m % n;
        const v = buf[idx];
        if (Number.isNaN(v) || (pen && idx === 0)) {
          pen = false;
          if (Number.isNaN(v)) continue;
        }
        const xx = idx * pps;
        if (pen) ctx.lineTo(xx, y(v));
        else ctx.moveTo(xx, y(v));
        pen = true;
      }
    };
    const traceStyle = (ctx: CanvasRenderingContext2D, color: string, blur: number) => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
    };

    /**
     * Brings channel ci's ink layer up to date. Ink is laid down in fixed
     * chunks of INK_CHUNK samples (also on a full redraw), so the overlapping
     * glow of neighbouring chunks builds up the same way in both cases.
     */
    const updateInk = (ci: number, spec: ChannelSpec) => {
      const ictx = inks[ci].getContext("2d");
      const buf = bufs[ci];
      if (!ictx || !buf || n === 0) return;
      const r = dpr();
      const { pps, gap } = geom();
      const y = yFor(ci, spec);
      const h = cssH[ci];
      const key = `${spec.range[0]},${spec.range[1]},${spec.color},${h},${plotW},${n}`;
      ictx.setTransform(r, 0, 0, r, 0, 0);
      traceStyle(ictx, spec.color, 7 * r);
      // Neighbouring chunks' glows overlap, so each one is kept faint.
      ictx.shadowColor = rgba(spec.color, 0.6);
      const strokeChunks = (from: number, to: number) => {
        let m = from;
        for (; m + INK_CHUNK <= to; m += INK_CHUNK) {
          tracePath(ictx, buf, Math.max(0, m - 1), m + INK_CHUNK, y);
          ictx.stroke();
        }
        return m;
      };
      if (inked[ci] < 0 || key !== inkKey[ci] || written - inked[ci] >= n - gap - INK_CHUNK) {
        ictx.clearRect(0, 0, cssW, h);
        inked[ci] = strokeChunks(Math.max(0, written - (n - gap)), written);
        inkKey[ci] = key;
        return;
      }
      const target = inked[ci] + Math.floor((written - inked[ci]) / INK_CHUNK) * INK_CHUNK;
      if (target === inked[ci]) return;
      // Erase the sweep gap just ahead of the new pen position (wrapping at
      // the right edge), then ink the new chunks. Normally the new chunks lie
      // inside the gap erased on the previous frame. After a long frame
      // (scroll jank, a busy main thread) the pen jumps further than that gap,
      // so the erase starts where the previous one ended: otherwise last
      // sweep's trace stays under the new one (double beats, holes).
      const from = Math.min(target - 1, inked[ci] - 1 + gap);
      const x0 = (from % n) * pps + 1.5;
      const end = Math.min(x0 + (target - 1 + gap - from) * pps, x0 + plotW);
      ictx.clearRect(x0, 0, (end > plotW ? cssW : end) - x0, h);
      if (end > plotW) ictx.clearRect(0, 0, end - plotW, h);
      inked[ci] = strokeChunks(inked[ci], target);
    };

    /** Baseline / dashed scale lines (plot area) and gutter labels + calibration pulse. */
    const drawGrid = (ctx: CanvasRenderingContext2D, spec: ChannelSpec, h: number, y: (v: number) => number) => {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      if (spec.scale) {
        ctx.setLineDash([2, 6]);
        for (const s of spec.scale) {
          const yy = Math.round(y(s)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(plotW, yy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = "500 9px 'IBM Plex Sans', -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.36)";
        for (const s of spec.scale) ctx.fillText(String(s), plotW + 5, Math.min(h - 5, Math.max(5, y(s))));
      } else {
        const base = spec.key === "ecg" || spec.key === "resp" ? 0 : spec.range[0];
        const yy = Math.round(y(base)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(plotW, yy);
        ctx.stroke();
      }
      if (spec.cal) {
        // Square calibration pulse (e.g. 1 mV), as printed on ECG strips.
        const x0 = plotW + 7;
        const y0 = Math.round(y(0)) + 0.5;
        const y1 = Math.round(y(spec.cal.value)) + 0.5;
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.beginPath();
        ctx.moveTo(x0 - 3, y0);
        ctx.lineTo(x0, y0);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x0 + 7, y1);
        ctx.lineTo(x0 + 7, y0);
        ctx.lineTo(x0 + 10, y0);
        ctx.stroke();
        ctx.font = "500 8px 'IBM Plex Sans', -apple-system, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255,255,255,0.36)";
        ctx.fillText(spec.cal.label, x0 + 4, Math.min(h - 9, y0 + 4));
      }
      ctx.restore();
    };

    const draw = () => {
      const { channels: specs, reducedMotion: rm, frozen: fz } = live.current;
      const r = dpr();
      const { pps, gap } = geom();
      const baseAlpha = fz ? 0.5 : 1;
      canvases.forEach((c, ci) => {
        const ctx = c.getContext("2d");
        const spec = specs[ci];
        if (!ctx || !spec) return;
        const h = cssH[ci];
        const y = yFor(ci, spec);
        const buf = bufs[ci];
        ctx.setTransform(r, 0, 0, r, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cssW, h);

        let pen: { x: number; y: number } | null = null;
        if (buf && n > 0 && rm) {
          // Static strip (refreshed once per second): oldest left, newest right.
          ctx.save();
          traceStyle(ctx, spec.color, 4);
          ctx.globalAlpha = fz ? 0.55 : 1;
          ctx.beginPath();
          let down = false;
          for (let k = 0; k < n; k++) {
            const v = buf[(written + k) % n];
            if (Number.isNaN(v)) {
              down = false;
              continue;
            }
            if (down) ctx.lineTo(k * pps, y(v));
            else ctx.moveTo(k * pps, y(v));
            down = true;
          }
          ctx.stroke();
          ctx.restore();
          inked[ci] = -1; // rebuild the sweep ink if motion is re-enabled
        } else if (buf && n > 0) {
          updateInk(ci, spec);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(inks[ci], 0, 0);
          ctx.restore();
          // Age fade: destination-out removes (1 - alpha(age)) of the ink.
          const visPx = Math.max(1, plotW - gap * pps);
          const penIdx = (written - 1 + n) % n;
          const penX = written > 0 ? penIdx * pps : 0;
          const keep = (age: number) => baseAlpha * (1 - 0.72 * Math.pow(Math.min(1, Math.max(0, age)), 1.15));
          ctx.globalCompositeOperation = "destination-out";
          const fade = (xa: number, xb: number, ageA: number, ageB: number) => {
            if (xb - xa < 0.5) return;
            const g = ctx.createLinearGradient(xa, 0, xb, 0);
            for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, `rgba(0,0,0,${(1 - keep(ageA + (i / 4) * (ageB - ageA))).toFixed(3)})`);
            ctx.fillStyle = g;
            ctx.fillRect(xa, 0, xb - xa, h);
          };
          fade(0, penX + 2, penX / visPx, 0);
          const gapEnd = penX + gap * pps;
          if (gapEnd < plotW) fade(gapEnd, plotW + 2, 1, penX / visPx);
          ctx.globalCompositeOperation = "source-over";
          ctx.clearRect(plotW + 2, 0, cssW - plotW, h); // glow bleed into the gutter
          const hv = buf[penIdx];
          if (!fz && written > 0 && !Number.isNaN(hv)) pen = { x: penX, y: y(hv) };
        }

        // Grid and labels go underneath the trace.
        ctx.globalCompositeOperation = "destination-over";
        drawGrid(ctx, spec, h, y);
        ctx.globalCompositeOperation = "source-over";

        // Soft glowing pen head at the newest sample (radial gradient, no blur).
        if (pen) {
          const g = ctx.createRadialGradient(pen.x, pen.y, 0, pen.x, pen.y, 8);
          g.addColorStop(0, rgba(spec.color, 0.55));
          g.addColorStop(1, rgba(spec.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(pen.x, pen.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = spec.color;
          ctx.beginPath();
          ctx.arc(pen.x, pen.y, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    const pump = (tNow: number) => {
      const synth = synthRef.current;
      if (!synth || n === 0) return;
      if (clock == null || tNow - clock > 3) clock = tNow - 1 / SR;
      while (clock <= tNow) {
        const s = synth.sample(clock);
        const idx = written % n;
        canvases.forEach((_, ci) => {
          const key = live.current.channels[ci]?.key;
          if (key && bufs[ci]) bufs[ci][idx] = s[key];
        });
        written++;
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

    const ro = new ResizeObserver(() => resize(true));
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
            <div className="pointer-events-none absolute left-0 top-0.5 z-10 flex items-baseline gap-2 text-[10px] font-medium">
              <span style={{ color: c.color }}>{c.label}</span>
              {(c.sublabel || (c.showSpeed && speedMm != null)) && (
                <span className="normal-case tracking-[0.08em] text-white/40">
                  {[c.sublabel, c.showSpeed && speedMm != null ? `${speedMm % 1 === 0 ? speedMm : speedMm.toFixed(1)} mm/s` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
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
