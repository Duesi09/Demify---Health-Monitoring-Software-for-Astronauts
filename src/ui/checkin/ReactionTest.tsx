'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PROTOCOLS,
  SOURCES,
  protocolRules,
  scoreTrials,
  type ScoreResult,
  type TestLength,
  type Trial,
} from '@/domain/reactionTest'
import type { Evaluation, MetricAssessment, Reading } from '@/domain/types'
import { StatusIcon } from '../status'
import { ReactionResult } from './ReactionResult'
import { ReactionRun, type StopReason } from './ReactionRun'
import { primaryButton, quietButton, quietFocus } from './shared'

type Phase =
  | { name: 'intro' }
  | { name: 'ready' }
  | { name: 'running' }
  | { name: 'stopped'; reason: StopReason }
  | { name: 'result'; result: ScoreResult; before: MetricAssessment; beforeManual: boolean }

interface Props {
  day: number
  evaluation: Evaluation
  /** Whether the latest reaction time reading was typed in or saved from a test. */
  latestManual: boolean
  onSaved: (readings: Reading[]) => void
  onContinue: () => void
}

const LENGTHS: { id: TestLength; title: string; detail: string }[] = [
  {
    id: 'standard',
    title: 'Standard test | 3 minutes',
    detail: 'The length used on the International Space Station. Use it for a reading you rely on.',
  },
  {
    id: 'demo',
    title: 'Demo | 30 seconds',
    detail: 'Shows how the test works. Too short to say how alert you are.',
  },
]

const STEPS = [
  'Use the device you always use, and hold or place it the way you always do.',
  'Watch the dark box. After a wait of 1 to 4 seconds a millisecond counter starts in it.',
  'As soon as the counter starts, press Space or Enter, or tap the box. The counter stops and shows your time.',
  'Do not press before the counter starts. That is a false start: it is counted and not timed.',
]

/**
 * The Reaction Self-Test from instructions to result. Starting takes two
 * deliberate steps (get ready, then begin), so a stray key press cannot start it.
 */
export function ReactionTest({ day, evaluation, latestManual, onSaved, onContinue }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const [length, setLength] = useState<TestLength>('standard')
  const protocol = PROTOCOLS[length]
  const root = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  // After each change of phase, put the focus on what the crew member needs next.
  useEffect(() => {
    if (!moved.current) return
    root.current?.querySelector<HTMLElement>('[data-phase-focus]')?.focus({ preventScroll: phase.name === 'running' })
  }, [phase.name])

  function go(next: Phase) {
    moved.current = true
    setPhase(next)
  }

  const finish = useCallback(
    (trials: Trial[]) => {
      moved.current = true
      setPhase({
        name: 'result',
        result: scoreTrials(trials, protocol),
        // The comparison must not move when the new reading is saved.
        before: evaluation.assessments.reactionMs,
        beforeManual: latestManual,
      })
    },
    [protocol, evaluation, latestManual],
  )
  const stop = useCallback((reason: StopReason) => {
    moved.current = true
    setPhase({ name: 'stopped', reason })
  }, [])

  return (
    <div ref={root} className="@container rounded-2xl bg-white/[0.05] p-5 ring-1 ring-edge sm:p-6">
      {phase.name === 'intro' && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 tabIndex={-1} data-phase-focus style={quietFocus} className="rounded-md text-xl font-semibold tracking-tight">
              Reaction Self-Test
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-ink-2">
              A browser version of the brief psychomotor vigilance test (PVT-B), the 3-minute test that crews on the
              International Space Station run as the Reaction Self-Test. It measures how fast you respond to a counter
              that appears at moments you cannot predict. The mean of your times becomes today&apos;s reaction time
              reading.
            </p>
            <p className="mt-2 max-w-3xl text-xs text-ink-2">
              Protocol after Basner, Mollicone and Dinges, Acta Astronautica, 2011. The rules, the project defaults and
              the sources are listed at the end of this panel.
            </p>
          </div>

          <div className="grid gap-6 @2xl:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-ink">What to do</h4>
              <ol className="mt-2 flex flex-col gap-2 text-sm">
                {STEPS.map((text, i) => (
                  <li key={text} className="flex gap-3 text-ink-2">
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-xs font-medium text-ink tabular-nums"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="sr-only">Step {i + 1}: </span>
                      {text}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 hidden text-sm text-ink-2 motion-reduce:block">
                Your system asks for reduced motion, so the word Now appears instead of a running counter. Your time is
                shown once you have responded.
              </p>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <h4 className="font-semibold text-ink">What the result can and cannot tell you</h4>
              <p className="flex items-start gap-2 text-ink-2">
                <span className="mt-0.5">
                  <StatusIcon tone="nominal" />
                </span>
                <span>
                  <span className="font-semibold text-ink">Good for: </span>
                  comparing you with your own baseline and your own earlier results, taken on the same device.
                </span>
              </p>
              <p className="flex items-start gap-2 text-ink-2">
                <span className="mt-0.5">
                  <StatusIcon tone="stale" />
                </span>
                <span>
                  <span className="font-semibold text-ink">Not for: </span>
                  a diagnosis, or a comparison with other people, other devices or published values. A browser is not a
                  medical instrument: screen, keyboard and browser each add a delay of their own.
                </span>
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-ink">Length</legend>
            <div className="mt-2 grid gap-3 @2xl:grid-cols-2">
              {LENGTHS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl bg-page/60 p-4 ring-1 ring-edge transition-shadow has-checked:ring-2 has-checked:ring-white/60"
                >
                  <input
                    type="radio"
                    name="test-length"
                    value={option.id}
                    checked={length === option.id}
                    onChange={() => setLength(option.id)}
                    className="mt-1 size-4 shrink-0 accent-white"
                  />
                  <span>
                    <span className="block font-medium text-ink">{option.title}</span>
                    <span className="block text-sm text-ink-2">{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => go({ name: 'ready' })} className={primaryButton}>
              Get ready
            </button>
            <p className="text-sm text-ink-2">Nothing is timed yet. The next screen lets you begin.</p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer rounded-md text-ink-2 hover:text-ink">
              How the test is scored, and where the numbers come from
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left">
                <caption className="sr-only">Rules of the {protocol.label.toLowerCase()}</caption>
                <thead className="text-xs text-ink-2">
                  <tr>
                    <th scope="col" className="py-1.5 pr-4 font-normal">
                      Rule
                    </th>
                    <th scope="col" className="py-1.5 pr-4 font-normal">
                      In this test
                    </th>
                    <th scope="col" className="py-1.5 font-normal">
                      Comes from
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {protocolRules(protocol).map((r) => (
                    <tr key={r.rule} className="border-t border-grid align-top">
                      <th scope="row" className="py-1.5 pr-4 font-normal text-ink">
                        {r.rule}
                      </th>
                      <td className="py-1.5 pr-4 text-ink-2">{r.value}</td>
                      <td className="py-1.5 text-ink-2">{r.basis === 'published' ? 'PVT-B' : 'Project default'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-ink-2">
              Reported are the mean and the median reaction time, the mean of the slowest tenth, the number of lapses
              and the number of false starts. Reaction times are taken from valid responses only. The published values
              come from the description of the PVT-B; they were not checked against the flight software.
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-ink-2">
              {SOURCES.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {phase.name === 'ready' && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">
              Ready for the {length === 'demo' ? 'demo' : 'standard test'}?
            </h3>
            <p className="mt-1 text-sm text-ink-2">
              The test starts when you press Begin and lasts {length === 'demo' ? '30 seconds' : '3 minutes'}. The
              first counter appears 1 to 4 seconds later. You can stop at any time with Esc or the Stop button.
            </p>
          </div>
          <div className="flex h-72 flex-col items-center justify-center gap-5 rounded-3xl bg-page px-4 text-center ring-1 ring-white/20 sm:h-80">
            <p className="text-ink-2">The counter will appear here.</p>
            <button
              type="button"
              data-phase-focus
              // A key still held down from the last screen repeats; it must not begin the test.
              onKeyDown={(e) => {
                if (e.repeat) e.preventDefault()
              }}
              onClick={() => go({ name: 'running' })}
              className={primaryButton}
            >
              Begin test
            </button>
          </div>
          <div>
            <button type="button" onClick={() => go({ name: 'intro' })} className={quietButton}>
              Back to the instructions
            </button>
          </div>
        </div>
      )}

      {phase.name === 'running' && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold tracking-tight">
            {length === 'demo' ? 'Demo running' : 'Test running'}
          </h3>
          <ReactionRun protocol={protocol} onFinish={finish} onStop={stop} />
        </div>
      )}

      {phase.name === 'stopped' && (
        <div className="flex flex-col gap-4">
          <div role="status">
            <h3 tabIndex={-1} data-phase-focus style={quietFocus} className="rounded-md text-xl font-semibold tracking-tight">
              Test stopped
            </h3>
            <p className="mt-1 text-sm text-ink-2">
              {phase.reason === 'hidden'
                ? 'The page went into the background, where timing is not reliable, so the test was stopped. Nothing was saved.'
                : 'Nothing was saved.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => go({ name: 'ready' })} className={primaryButton}>
              Start again
            </button>
            <button type="button" onClick={() => go({ name: 'intro' })} className={quietButton}>
              Back to the instructions
            </button>
          </div>
        </div>
      )}

      {phase.name === 'result' &&
        (phase.result.ok ? (
          <ReactionResult
            score={phase.result.score}
            protocol={protocol}
            day={day}
            before={phase.before}
            beforeManual={phase.beforeManual}
            evaluation={evaluation}
            onSaved={onSaved}
            onAgain={() => go({ name: 'ready' })}
            onDiscard={() => go({ name: 'intro' })}
            onContinue={onContinue}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h3 tabIndex={-1} data-phase-focus style={quietFocus} className="rounded-md text-xl font-semibold tracking-tight">
                No result this time
              </h3>
              <p className="mt-2 flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5">
                  <StatusIcon tone="watch" />
                </span>
                {phase.result.reason}
              </p>
              <p className="mt-2 text-sm text-ink-2">
                {phase.result.falseStarts > 0
                  ? `${phase.result.falseStarts} ${phase.result.falseStarts === 1 ? 'press was a false start' : 'presses were false starts'}. Wait until the counter starts before you respond. `
                  : ''}
                Nothing was saved.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => go({ name: 'ready' })} className={primaryButton}>
                Try again
              </button>
              <button type="button" onClick={() => go({ name: 'intro' })} className={quietButton}>
                Back to the instructions
              </button>
            </div>
          </div>
        ))}
    </div>
  )
}
