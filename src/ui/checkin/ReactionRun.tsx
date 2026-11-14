'use client'

import { useEffect, useRef } from 'react'
import { fitsInRun, nextWaitMs, type Protocol, type Trial } from '@/domain/reactionTest'
import { quietButton } from './shared'

/** Why a run ended early: the crew member stopped it, or the page went into the background. */
export type StopReason = 'stopped' | 'hidden'

interface Props {
  protocol: Protocol
  onFinish: (trials: Trial[]) => void
  onStop: (reason: StopReason) => void
}

/**
 * One run of the Reaction Self-Test. It exists only while a test is running:
 * mounting it starts the run and unmounting it clears every timer.
 *
 * The screen is written to directly instead of through React state, so that
 * nothing sits between a frame and what is measured in it.
 */
export function ReactionRun({ protocol, onFinish, onStop }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const unit = useRef<HTMLSpanElement>(null)
  const note = useRef<HTMLSpanElement>(null)
  const spoken = useRef<HTMLParagraphElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  // The latest callbacks, so the run never restarts when the page around it renders again.
  const handlers = useRef({ onFinish, onStop })
  useEffect(() => {
    handlers.current = { onFinish, onStop }
  })

  useEffect(() => {
    const boxEl = box.current!
    const counterEl = counter.current!
    const unitEl = unit.current!
    const noteEl = note.current!
    const spokenEl = spoken.current!
    const barEl = bar.current!
    // With reduced motion a still word stands in for the running counter.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const trials: Trial[] = []
    const timers = new Set<number>()
    let frame = 0
    // waiting: nothing on screen | shown: the stimulus is up | frozen: a result is displayed | over: the run has ended
    let state: 'waiting' | 'shown' | 'frozen' | 'over' = 'waiting'
    let onset: number | null = null
    const startedAt = performance.now()

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
    }
    const clearPending = () => {
      timers.forEach((id) => window.clearTimeout(id))
      timers.clear()
      cancelAnimationFrame(frame)
    }

    function show(next: 'waiting' | 'shown' | 'frozen', digits: string, withUnit: boolean, message: string) {
      state = next
      boxEl.dataset.state = next
      counterEl.textContent = digits
      unitEl.hidden = !withUnit
      noteEl.textContent = message
    }

    /** Starts the wait for the next stimulus; the last result stays on screen for `shownMs` first. */
    function wait(shownMs: number) {
      const delay = nextWaitMs(protocol)
      if (!fitsInRun(protocol, performance.now() - startedAt, delay)) {
        later(finish, shownMs)
        return
      }
      if (shownMs > 0) later(() => show('waiting', '', false, ''), shownMs)
      later(present, delay)
    }

    function present() {
      // The counter is put on screen inside a frame callback, and the clock starts
      // with the frame after it: that is when the counter is really visible, not
      // when it was asked for.
      frame = requestAnimationFrame(() => {
        onset = null
        show('shown', still ? 'Now' : '0', !still, '')
        frame = requestAnimationFrame((painted) => {
          onset = painted
          frame = requestAnimationFrame(tick)
        })
      })
    }

    function tick(now: number) {
      if (state !== 'shown' || onset === null) return
      const elapsed = now - onset
      if (elapsed >= protocol.timeoutMs) {
        trials.push({ kind: 'timeout' })
        show('frozen', '', false, 'No response. Counted as a lapse.')
        spokenEl.textContent = 'No response'
        wait(protocol.feedbackMs)
        return
      }
      if (!still) counterEl.textContent = String(Math.round(elapsed))
      frame = requestAnimationFrame(tick)
    }

    function respond(at: number) {
      if (state === 'waiting' || (state === 'shown' && onset === null)) {
        // Nothing was on screen yet, so this cannot be a reaction.
        clearPending()
        trials.push({ kind: 'falseStart' })
        show('frozen', '', false, 'Too early. Wait for the counter.')
        spokenEl.textContent = 'Too early'
        wait(protocol.feedbackMs)
        return
      }
      if (state !== 'shown' || onset === null) return
      cancelAnimationFrame(frame)
      const ms = Math.max(0, at - onset)
      trials.push({ kind: 'response', ms })
      const early = ms < protocol.anticipationMs
      show('frozen', String(Math.round(ms)), true, early ? 'Too fast to be a reaction. Counted as a false start.' : '')
      spokenEl.textContent = `${Math.round(ms)} milliseconds${early ? ', false start' : ''}`
      wait(protocol.feedbackMs)
    }

    function finish() {
      state = 'over'
      clearPending()
      handlers.current.onFinish(trials)
    }

    function stop(reason: StopReason) {
      if (state === 'over') return
      state = 'over'
      clearPending()
      handlers.current.onStop(reason)
    }

    // The event carries the time the press reached the browser, on the same clock
    // as performance.now(). It is used when plausible, since the handler itself
    // may run a little late.
    const pressedAt = (e: Event) => {
      const now = performance.now()
      return e.timeStamp > 0 && e.timeStamp <= now && now - e.timeStamp < 250 ? e.timeStamp : now
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        stop('stopped')
        return
      }
      if (e.key !== ' ' && e.key !== 'Enter') return
      // Space or Enter on another control, such as Stop, belongs to that control.
      if ((e.target as Element | null)?.closest?.('button, a, input, select, textarea, summary')) return
      // Space would scroll the page.
      e.preventDefault()
      // A key held down repeats; only the press itself is a response.
      if (e.repeat) return
      respond(pressedAt(e))
    }

    // pointerdown, not click: a click only arrives when the finger or button is lifted again.
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      boxEl.focus({ preventScroll: true })
      respond(pressedAt(e))
    }

    // In a hidden page frames stop, so nothing measured there would be true.
    function onVisibility() {
      if (document.hidden) stop('hidden')
    }

    const clock = window.setInterval(() => {
      const share = Math.min(1, (performance.now() - startedAt) / protocol.durationMs)
      barEl.style.width = `${share * 100}%`
    }, 1000)

    window.addEventListener('keydown', onKeyDown)
    boxEl.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('visibilitychange', onVisibility)

    show('waiting', '', false, '')
    barEl.style.width = '0%'
    boxEl.focus({ preventScroll: true })
    boxEl.scrollIntoView({ block: 'nearest' })
    wait(0)

    return () => {
      state = 'over'
      clearPending()
      window.clearInterval(clock)
      window.removeEventListener('keydown', onKeyDown)
      boxEl.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [protocol])

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={box}
        role="button"
        tabIndex={0}
        data-state="waiting"
        data-reaction-box
        aria-label="Response area. Press Space or Enter, or tap here, as soon as the counter appears."
        className="relative flex h-72 cursor-pointer touch-none flex-col items-center justify-center rounded-3xl bg-page ring-1 ring-white/20 select-none sm:h-80"
      >
        <p className="flex items-baseline gap-2 text-ink" aria-hidden="true">
          <span ref={counter} className="text-7xl leading-none font-semibold tracking-tight tabular-nums sm:text-8xl" />
          <span ref={unit} hidden className="text-2xl text-ink-2">
            ms
          </span>
        </p>
        <span ref={note} className="mt-3 min-h-6 px-4 text-center text-base text-ink" aria-hidden="true" />
        <span className="absolute inset-x-4 bottom-4 text-center text-sm text-muted" aria-hidden="true">
          Space, Enter or tap as soon as the counter appears
        </span>
      </div>
      <p ref={spoken} className="sr-only" aria-live="polite" />
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-axis" aria-hidden="true">
          <span
            ref={bar}
            className="block h-full w-0 rounded-full bg-ink-2 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          />
        </div>
        <button type="button" onClick={() => onStop('stopped')} className={quietButton}>
          Stop test (Esc)
        </button>
      </div>
    </div>
  )
}
