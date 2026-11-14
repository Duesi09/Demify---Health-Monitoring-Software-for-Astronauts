'use client'

import { useId, useState } from 'react'
import { READINESS_DISCLAIMER, VERDICT_LABEL, readinessForDay, type VerdictLevel } from '@/domain/readiness'
import type { Evaluation, MetricId } from '@/domain/types'
import { tileFor } from './tiles'

interface Props {
  evaluation: Evaluation
  onSelectMetric: (metric: MetricId) => void
  /** Position on the dashboard, for the staggered entrance. */
  order?: number
}

/** Reasons shown before the rest folds away, so the card keeps its height from day to day. */
const VISIBLE_REASONS = 3

const chip =
  'shrink-0 rounded-full bg-raised px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-axis hover:text-ink'

/** Said to screen readers in place of the small icon in front of a reason. */
const EFFECT_WORD: Record<Exclude<VerdictLevel, 'go'>, string> = {
  'no-go': 'Stops the task: ',
  caution: 'Calls for care: ',
}

/**
 * The verdict has shapes of its own, a square plate that is open, striped or
 * closed, and no colour at all. It can never be mistaken for the health
 * status, which owns the circle, triangle, diamond and octagon and the colours.
 */
function VerdictIcon({ level, size }: { level: VerdictLevel; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0 text-ink">
      {level === 'go' && (
        <>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M7 12h9.5M12.5 7.6 16.9 12l-4.4 4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {level === 'caution' && (
        <>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
          {/* Hazard stripes. */}
          <path
            d="M6.2 11.8l5.6-5.6M6.2 17.8 17.8 6.2M12.2 17.8l5.6-5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      )}
      {level === 'no-go' && (
        <>
          <rect x="1" y="1" width="22" height="22" rx="7" fill="currentColor" />
          <rect x="5.5" y="10" width="13" height="4" rx="1" className="fill-surface" />
        </>
      )}
    </svg>
  )
}

const LEVELS: VerdictLevel[] = ['go', 'caution', 'no-go']

/** Where the verdict sits between go and no-go: position says it a third time, after shape and word. */
function VerdictScale({ level }: { level: VerdictLevel }) {
  return (
    <div aria-hidden="true" className="mt-4 grid grid-cols-3 gap-1.5">
      {LEVELS.map((l) => (
        <span key={l} className="flex flex-col gap-1.5">
          <span
            className={`glide h-1.5 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
              l === level ? 'bg-ink' : 'bg-axis'
            }`}
          />
          <span className={`text-xs font-medium ${l === level ? 'text-ink' : 'text-muted'}`}>{VERDICT_LABEL[l]}</span>
        </span>
      ))}
    </div>
  )
}

/** "A", "A and b", "A, b and c". */
function sentenceList(items: string[]): string {
  const text = items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fit for today's task: whether the crew member's health today matches what
 * the task on the plan demands, why, and what to do instead.
 */
export function ReadinessCard({ evaluation, onSelectMetric, order = 2 }: Props) {
  const titleId = useId()
  const verdict = readinessForDay(evaluation)
  const { task, level, reasons, alternative } = verdict
  // Remembers the day the list was opened on, so a new day starts folded again.
  const [openDay, setOpenDay] = useState<number | null>(null)
  const open = openDay === evaluation.day
  const folds = reasons.length > VISIBLE_REASONS
  const shown = folds && !open ? reasons.slice(0, VISIBLE_REASONS - 1) : reasons
  const hidden = reasons.length - shown.length
  // Blood pressure is two indicators and one name.
  const checked = [...new Set(verdict.checked.map((m) => tileFor(m).label.toLowerCase()))]

  return (
    <section
      aria-labelledby={titleId}
      className="card rise @container flex flex-col p-6"
      style={{ '--i': order } as React.CSSProperties}
    >
      {/* Side by side when the card has a full row to itself, stacked in a narrow column or on a phone. */}
      <div className="grid flex-1 gap-x-8 gap-y-5 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col">
          <h2 id={titleId} className="eyebrow">
            Fit for today&apos;s task
          </h2>
          <div key={task.id} className="swap-in">
            <p className="mt-1.5 text-xl font-semibold tracking-tight">{task.label}</p>
            {/* Room for the longest description, so a short one does not pull the verdict up. */}
            <p className="mt-1 min-h-[3lh] text-sm text-ink-2 @xl:min-h-[2lh] @3xl:min-h-[3lh]">{task.demand}</p>
          </div>

          <div key={level} className="swap-in mt-4 flex items-center gap-4">
            <VerdictIcon level={level} size={48} />
            <p className="text-5xl leading-none font-semibold tracking-tight">
              <span className="sr-only">Verdict: </span>
              {verdict.label}
            </p>
          </div>
          <VerdictScale level={level} />
          <p className="mt-3 min-h-[2lh] text-sm text-ink @xl:min-h-[1lh] @3xl:min-h-[2lh]">{verdict.summary}</p>
        </div>

        <div className="flex flex-col">
          <h3 className="eyebrow">{reasons.length > 0 ? 'Why' : 'What was checked'}</h3>
          {/* Room for three reasons; on a phone two of them may run to a second line. */}
          <div className="mt-1 min-h-35 @sm:min-h-27">
            {reasons.length === 0 ? (
              <div className="swap-in flex items-start gap-2.5 py-1.5">
                <span className="mt-px">
                  <VerdictIcon level="go" size={18} />
                </span>
                <p className="text-sm text-ink-2">
                  {checked.length === 0
                    ? 'Nothing to check. A rest day is always possible.'
                    : `${sentenceList(checked)} are up to date, and nothing in them stands in the way.`}
                </p>
              </div>
            ) : (
              <ul>
                {shown.map((reason) => (
                  <li key={reason.id} className="swap-in flex items-center gap-2.5 py-1.5">
                    <VerdictIcon level={reason.effect} size={18} />
                    <p className="min-w-0 flex-1 text-sm text-ink">
                      <span className="sr-only">{EFFECT_WORD[reason.effect]}</span>
                      {reason.text}
                    </p>
                    <button type="button" onClick={() => onSelectMetric(reason.metric)} className={chip}>
                      {tileFor(reason.metric).label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {folds && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenDay(open ? null : evaluation.day)}
                className="mt-1 rounded-full py-1 text-xs font-medium text-ink-2 underline decoration-axis underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                {open ? 'Show fewer reasons' : `Show ${hidden} more ${hidden === 1 ? 'reason' : 'reasons'}`}
              </button>
            )}
          </div>

          {/* Always present, so the card keeps its height when the verdict changes. */}
          <div className="mt-auto pt-3">
            <div
              key={alternative?.text ?? 'none'}
              className="swap-in min-h-28 rounded-2xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-edge @xl:min-h-24 @3xl:min-h-28"
            >
              <h3 className="eyebrow">{alternative ? 'Suggested alternative' : 'No change needed'}</h3>
              <p className="mt-1.5 text-sm text-ink">
                {alternative ? (
                  <>
                    <span className="font-semibold">{alternative.label}. </span>
                    {alternative.text}
                  </>
                ) : (
                  'Go ahead as planned. The advice follows your readings, so log anything that changes.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-grid pt-3 text-xs text-muted">{READINESS_DISCLAIMER}</p>
    </section>
  )
}
