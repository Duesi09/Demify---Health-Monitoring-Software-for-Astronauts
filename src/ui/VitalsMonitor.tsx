'use client'

import { useEffect, useRef } from 'react'
import { METRICS } from '@/domain/metrics'
import type { Evaluation, MetricId } from '@/domain/types'
import { AnimatedNumber } from './AnimatedNumber'
import { StatusIcon, TONE } from './status'
import { TILES, tileTone } from './tiles'

const ECG_COLOR = '#3987e5'
const PRESSURE_COLOR = '#f5f5f7'
/** The heartbeat trace takes the Critical status colour during a possible heart attack. */
const ALARM_COLOR = '#d03b3b'
/** Sweep speed of the traces, in pixels per second. */
const SWEEP_SPEED = 110
/** Width of the cleared gap that runs ahead of the traces. */
const SWEEP_GAP = 30
/** Where in the heartbeat cycle the tall spike sits. */
const SPIKE_AT = 0.285

const bump = (x: number, centre: number, width: number) => Math.exp(-(((x - centre) / width) ** 2))

/** One heartbeat as seen on an ECG, from 0 to 1 in time; the spike reaches 1. */
function heartbeat(t: number): number {
  return (
    0.12 * bump(t, 0.16, 0.028) -
    0.13 * bump(t, 0.262, 0.009) +
    1.0 * bump(t, SPIKE_AT, 0.011) -
    0.24 * bump(t, 0.308, 0.01) +
    0.3 * bump(t, 0.5, 0.05)
  )
}

/** One pulse of blood pressure: 0 is the diastolic value, 1 the systolic. */
function pressurePulse(t: number): number {
  // The pressure wave reaches the arteries shortly after the heart contracts.
  const x = (t - 0.33 + 1) % 1
  if (x < 0.11) return Math.sin((x / 0.11) * (Math.PI / 2)) ** 2
  const decay = Math.exp(-(x - 0.11) / 0.33)
  return Math.min(1, decay + 0.13 * bump(x, 0.31, 0.035))
}

interface Live {
  hr: number | null
  sys: number | null
  dia: number | null
  /** True while the engine reports a possible heart attack. */
  alarm: boolean
}

interface Props {
  evaluation: Evaluation
  onSelectMetric: (metric: MetricId) => void
}

/**
 * A bedside-monitor view of the vital signs: a heartbeat trace that beats at
 * the measured heart rate and a pressure wave that swings between the measured
 * diastolic and systolic values. The traces are drawn from the latest readings;
 * they are an illustration, not a live sensor signal.
 */
export function VitalsMonitor({ evaluation, onSelectMetric }: Props) {
  const fresh = (id: MetricId) => {
    const a = evaluation.assessments[id]
    return a.stale ? null : a.value
  }
  const hr = fresh('restingHr')
  const sys = fresh('systolic')
  const dia = fresh('diastolic')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heartRef = useRef<SVGSVGElement>(null)
  // The drawing loop reads the latest values from here without restarting.
  // The engine's heart-attack pattern puts the monitor into its alarm state.
  const cardiac = evaluation.findings.some((f) => f.id === 'pattern:cardiac')

  const live = useRef<Live>({ hr, sys, dia, alarm: cardiac })
  // Set by the drawing effect when motion is reduced, to redraw the still trace.
  const redrawStill = useRef<(() => void) | null>(null)
  useEffect(() => {
    live.current = { hr, sys, dia, alarm: cardiac }
    redrawStill.current?.()
  }, [hr, sys, dia, cardiac])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0

    // The heartbeat lane uses the upper part of the canvas, pressure the lower.
    const ecgY = (phase: number) => {
      const { hr } = live.current
      return height * 0.4 - (hr === null ? 0 : heartbeat(phase)) * height * 0.3
    }
    const pressureY = (phase: number) => {
      const { hr, sys, dia } = live.current
      const known = hr !== null && sys !== null && dia !== null
      return height * 0.93 - (known ? pressurePulse(phase) : 0.5) * height * 0.27
    }

    const ecgColor = () => (live.current.alarm ? ALARM_COLOR : ECG_COLOR)

    function segment(color: string, x0: number, y0: number, x1: number, y1: number) {
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }

    function prepare() {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowBlur = 8
    }

    /** Without motion: one full, still sweep. */
    function drawStill() {
      prepare()
      const beatsPerPixel = (live.current.hr ?? 60) / 60 / SWEEP_SPEED
      for (let px = 1; px < width; px++) {
        const a = ((px - 1) * beatsPerPixel) % 1
        const b = (px * beatsPerPixel) % 1
        segment(ecgColor(), px - 1, ecgY(a), px, ecgY(b))
        segment(PRESSURE_COLOR, px - 1, pressureY(a), px, pressureY(b))
      }
    }

    if (still) {
      drawStill()
      redrawStill.current = drawStill
      const observer = new ResizeObserver(drawStill)
      observer.observe(canvas)
      return () => {
        redrawStill.current = null
        observer.disconnect()
      }
    }

    let x = 0
    let phase = 0
    let last = performance.now()
    let frame = 0
    const observer = new ResizeObserver(() => {
      prepare()
      x = 0
    })
    observer.observe(canvas)

    function tick(now: number) {
      // Cap the step so returning to a hidden tab does not draw a long jump.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const steps = Math.max(1, Math.ceil(dt * SWEEP_SPEED))
      const dx = (dt * SWEEP_SPEED) / steps
      const dPhase = ((live.current.hr ?? 0) / 60) * (dt / steps)

      for (let i = 0; i < steps; i++) {
        const before = phase
        phase += dPhase
        if (Math.floor(phase - SPIKE_AT) > Math.floor(before - SPIKE_AT)) {
          heartRef.current?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
            { duration: 280, easing: 'ease-out' },
          )
        }
        const x1 = x + dx
        ctx.clearRect(x1, 0, SWEEP_GAP, height)
        if (x1 + SWEEP_GAP > width) ctx.clearRect(0, 0, x1 + SWEEP_GAP - width, height)
        segment(ecgColor(), x, ecgY(before % 1), x1, ecgY(phase % 1))
        segment(PRESSURE_COLOR, x, pressureY(before % 1), x1, pressureY(phase % 1))
        x = x1 >= width ? 0 : x1
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const vitals: { label: string; unit: string; tile: string; swatch?: string; beat?: boolean }[] = [
    { label: 'Heart rate', unit: 'bpm', tile: 'restingHr', swatch: cardiac ? ALARM_COLOR : ECG_COLOR, beat: true },
    { label: 'Blood pressure', unit: 'mmHg', tile: 'bloodPressure', swatch: PRESSURE_COLOR },
    { label: 'Blood oxygen', unit: '%', tile: 'spo2' },
    { label: 'Temperature', unit: '°C', tile: 'bodyTemp' },
  ]

  return (
    <section aria-label="Vital signs monitor" className="card rise @container flex flex-col p-6" style={{ '--i': 2 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Vital signs</h2>
          <p className="text-xs text-muted">Drawn from your latest readings</p>
        </div>
        {cardiac && (
          <p role="status" className="alarm flex items-center gap-1.5 rounded-full bg-critical/25 px-3 py-1 text-xs font-semibold text-ink ring-1 ring-critical">
            <StatusIcon tone="critical" size={12} />
            Possible heart attack
          </p>
        )}
      </div>

      <div className="mt-4 grid flex-1 gap-5 @lg:grid-cols-[minmax(0,1fr)_11.5rem]">
        <div
          className={`monitor-grid relative min-h-52 overflow-hidden rounded-2xl bg-page ring-1 transition-shadow duration-500 ${
            cardiac ? 'ring-critical' : 'ring-edge'
          }`}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
          <p className="absolute top-3 left-4 text-[11px] font-medium tracking-wide text-ink-2 uppercase">Heartbeat</p>
          <p className="absolute top-[56%] left-4 text-[11px] font-medium tracking-wide text-ink-2 uppercase">
            Blood pressure wave
          </p>
          {hr === null && (
            <p className="absolute inset-x-0 top-[22%] text-center text-sm text-muted">No recent heart rate reading</p>
          )}
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-1">
          {vitals.map((v) => {
            const tile = TILES.find((t) => t.id === v.tile)!
            const tone = tileTone(tile, evaluation)
            return (
              <li key={v.label}>
                <button
                  type="button"
                  onClick={() => onSelectMetric(tile.metrics[0])}
                  className="-mx-2 flex w-[calc(100%+1rem)] flex-col rounded-xl px-2 py-1 text-left transition-colors hover:bg-raised"
                >
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    {v.beat ? (
                      <svg ref={heartRef} viewBox="0 0 16 16" className="size-3" aria-hidden="true">
                        <path d="M8 14.2 2.3 8.6a3.6 3.6 0 0 1 5.1-5.1l.6.6.6-.6a3.6 3.6 0 0 1 5.1 5.1z" fill={v.swatch} />
                      </svg>
                    ) : (
                      v.swatch && (
                        <span className="h-0.5 w-3 rounded-full" style={{ background: v.swatch }} aria-hidden="true" />
                      )
                    )}
                    {v.label}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-tight tabular-nums">
                      {tile.metrics.map((m, i) => (
                        <span key={m}>
                          {i > 0 && '/'}
                          <AnimatedNumber value={fresh(m)} decimals={METRICS[m].decimals} />
                        </span>
                      ))}
                    </span>
                    <span className="text-xs text-ink-2">{v.unit}</span>
                    <span className="ml-auto self-center">
                      <StatusIcon tone={tone} size={14} />
                      <span className="sr-only">{TONE[tone].label}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
