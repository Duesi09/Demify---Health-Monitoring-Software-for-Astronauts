'use client'

import { useLayoutEffect, useRef } from 'react'

const DURATION_MS = 450

interface Props {
  value: number | null
  decimals: number
}

const format = (value: number | null, decimals: number) =>
  value === null ? '--' : value.toFixed(decimals)

/** A number that glides to its new value instead of jumping. */
export function AnimatedNumber({ value, decimals }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  // What is on screen right now, so a change mid-glide continues from there.
  const shown = useRef(value)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (value === null || from === null || from === value || still) {
      shown.current = value
      el.textContent = format(value, decimals)
      return
    }
    // React has already written the new value; put the old one back before paint.
    el.textContent = format(from, decimals)
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const current = from + (value - from) * (1 - Math.pow(1 - t, 3))
      shown.current = current
      el.textContent = format(current, decimals)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, decimals])

  return <span ref={ref}>{format(value, decimals)}</span>
}
