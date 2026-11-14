'use client'

import { useEffect, useRef } from 'react'
import { describeAge, type RoutineStep } from '@/domain/checkin'
import type { Evaluation } from '@/domain/types'
import { StatusIcon } from '../status'
import { enteredByHand, sourceText, stepTone, stepValue } from './shared'

interface Props {
  steps: RoutineStep[]
  activeId: string | null
  evaluation: Evaluation
  manualKeys: ReadonlySet<string>
  onSelect: (id: string) => void
}

function detail(step: RoutineStep, evaluation: Evaluation, manualKeys: ReadonlySet<string>): string {
  if (step.state === 'done') {
    return `${stepValue(step, evaluation)} | ${sourceText(enteredByHand(step, evaluation, manualKeys))}`
  }
  const age = describeAge(step.daysSinceReading)
  return step.daysSinceReading === null ? age : `last measured ${age}`
}

/**
 * Every step of today's routine with its state, most urgent first. Any step
 * can be opened at any time. A column beside the open step on wide screens, a
 * row to swipe through on narrow ones.
 */
export function StepList({ steps, activeId, evaluation, manualKeys, onSelect }: Props) {
  const list = useRef<HTMLOListElement>(null)

  // On narrow screens the list is a row: bring the open step into it. Only the
  // row itself is moved, never the page.
  useEffect(() => {
    const row = list.current
    const item = row?.querySelector<HTMLElement>('[aria-current="step"]')?.parentElement
    if (!row || !item || row.scrollWidth <= row.clientWidth) return
    const left = item.offsetLeft - row.offsetLeft
    if (left < row.scrollLeft || left + item.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - 16)
    }
  }, [activeId])

  return (
    <nav aria-labelledby="steps-heading" className="card rise min-w-0 p-4 @4xl:p-5" style={{ '--i': 2 } as React.CSSProperties}>
      <h2 id="steps-heading" className="eyebrow px-2 pt-1">
        All steps
      </h2>
      <ol
        ref={list}
        className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pt-0.5 pb-2 @4xl:flex-col @4xl:overflow-visible @4xl:pb-0"
      >
        {steps.map((step, i) => {
          const active = step.id === activeId
          const { tone, label } = stepTone(step, evaluation)
          return (
            <li key={step.id} className="w-60 shrink-0 @4xl:w-auto">
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
                className={`flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                  active ? 'bg-raised ring-1 ring-white/25' : 'hover:bg-white/[0.06]'
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium tabular-nums ring-1 ${
                    active ? 'bg-ink text-page ring-ink' : 'bg-page text-ink-2 ring-edge'
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{step.label}</span>
                  <span className="block truncate text-xs text-ink-2">{detail(step, evaluation, manualKeys)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
                  <StatusIcon tone={tone} />
                  {step.state === 'open' ? 'Open' : label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
