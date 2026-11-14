'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  FAST_FORWARD_RATE,
  addConsult,
  composeConsult,
  consultProgress,
  earliestAnswerS,
  emptyLedger,
  handlingTimeS,
  onboardAdvice,
  openConsult,
  shipNow,
  splitSteps,
  withRate,
  type ConsultPhase,
} from '@/domain/consult'
import { BLACKOUT_DAYS, formatClock, formatDuration, type LinkState } from '@/domain/missionContext'
import type { Evaluation } from '@/domain/types'
import { StatusIcon, TONE } from '../status'
import { LedgerEntry } from './LedgerEntry'
import { useLedger, useReducedMotion } from './useLedger'

/** What a screen reader hears, once, when a consult moves on. */
const ARRIVAL: Record<ConsultPhase, string> = {
  'to-earth': 'Consult sent.',
  handling: 'Your message has reached Earth.',
  'to-ship': 'The answer has left Earth.',
  answered: 'A simulated reply from the flight surgeon has arrived. It is in the ledger.',
}

const quiet =
  'rounded-full bg-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-axis'

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink tabular-nums">
        {value}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </dd>
    </div>
  )
}

/**
 * The light-time ledger: the consult, the on-board answer for the wait, and
 * every consult sent in this browser session with its signal and its reply.
 */
export function LightTimeLedger({ evaluation, link }: { evaluation: Evaluation; link: LinkState }) {
  const reducedMotion = useReducedMotion()
  const { ledger, now, stored, tickMs, update } = useLedger(reducedMotion)
  const [announcement, setAnnouncement] = useState('')
  const consults = ledger?.consults ?? []
  const rate = ledger?.clock.rate ?? 1
  // Once the clock has run fast it is ahead of the real one and must not be called UTC.
  const demoTime = ledger !== null && (ledger.clock.rate !== 1 || Math.abs(ledger.clock.shipAt - ledger.clock.realAt) > 1000)
  const ledgerHeading = useRef<HTMLHeadingElement>(null)

  const top = evaluation.findings[0]
  const findingId = top?.id ?? null
  const pending = now !== null && openConsult(consults, findingId, evaluation.day, link.profile, now) !== undefined
  const sentBefore = consults.some(
    (c) => c.findingId === findingId && c.day === evaluation.day && c.profile === link.profile,
  )
  const earliest = formatDuration(earliestAnswerS(link))
  const steps = splitSteps(onboardAdvice(evaluation))

  // Announce each consult's progress once, when it happens, and never the countdown itself.
  const phases = now === null ? null : consults.map((c) => `${c.id}:${consultProgress(c, now).phase}`).join(' ')
  const heard = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    if (phases === null) return
    const current = new Map(phases.split(' ').filter(Boolean).map((entry) => entry.split(':') as [string, string]))
    const before = heard.current
    heard.current = current
    // Consults that were already in the ledger when the page opened are not news.
    if (!before) return
    for (const [id, phase] of current) {
      if (before.get(id) !== phase) setAnnouncement(ARRIVAL[phase as ConsultPhase])
    }
  }, [phases])

  function send() {
    if (!ledger || pending) return
    const sentAt = shipNow(ledger.clock, Date.now())
    const consult = composeConsult(evaluation, link, sentAt, `c${Math.round(sentAt)}`)
    if (consult) update((current) => addConsult(current, consult))
  }

  function setRate(next: number) {
    update((current) => ({ ...current, clock: withRate(current.clock, Date.now(), next) }))
  }

  return (
    <>
      <div className="grid gap-5 @4xl:grid-cols-2">

        <section
          aria-labelledby="consult-title"
          className="card rise flex flex-col p-6 sm:p-7"
          style={{ '--i': 4 } as React.CSSProperties}
        >
          <h2 id="consult-title" className="text-xl font-semibold tracking-tight">
            Consult the flight surgeon
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {!link.contact
              ? 'From behind the Sun nothing can be sent. This is what would go to the flight surgeon.'
              : top
                ? "Sends today's most urgent finding to the flight surgeon on Earth."
                : 'Nothing is flagged today, so this sends a routine status report.'}
          </p>

          <div key={`${evaluation.day}:${findingId}`} className="swap-in mt-5 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
            <p className="eyebrow text-ink-2">
              {link.contact ? 'Message' : 'Unsent message'} | mission day {evaluation.day}
            </p>
            <p className="mt-2 flex items-start gap-2.5">
              <span className="mt-0.5">
                <StatusIcon tone={top?.status ?? 'nominal'} size={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{top?.title ?? 'Routine status report'}</span>
                <span className="block text-xs text-ink-2">{TONE[top?.status ?? 'nominal'].label}</span>
              </span>
            </p>
          </div>

          {link.contact ? (
            <>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                <Fact label="Reaches Earth after" value={formatDuration(link.oneWayS)} />
                <Fact label="Handling on the ground" value={formatDuration(handlingTimeS(link))} note="Illustrative" />
                <Fact label="Earliest answer after" value={earliest} />
              </dl>
              <div className="mt-auto pt-6">
                {/* Stays focusable while a consult is under way, so keyboard users keep their place. */}
                <button
                  type="button"
                  onClick={send}
                  aria-disabled={pending || !ledger}
                  className={`w-full rounded-full px-5 py-3 text-base font-semibold transition active:scale-[0.98] ${
                    pending
                      ? 'cursor-default bg-raised text-ink-2'
                      : 'bg-action text-white hover:brightness-110'
                  }`}
                >
                  {pending
                    ? 'Consult on its way'
                    : sentBefore
                      ? 'Send again'
                      : top
                        ? 'Send to the flight surgeon'
                        : 'Send status report'}
                </button>
                <p className="mt-2 min-h-10 text-xs text-ink-2">
                  {pending ? (
                    <>
                      No answer can be here sooner. Follow the signal in the{' '}
                      <a href="#ledger" className="underline underline-offset-2 hover:text-ink">
                        ledger below
                      </a>{' '}
                      and act on the on-board advice meanwhile.
                    </>
                  ) : (
                    `No answer can be back sooner than ${earliest}, however urgent the message.`
                  )}
                </p>
              </div>
            </>
          ) : (
            <div className="mt-auto pt-5">
              <div className="flex items-start gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-axis">
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="mt-0.5 shrink-0 text-ink">
                  <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M5.5 5.5l13 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="font-semibold text-ink">No contact with Earth</p>
                  <p className="mt-1 text-sm text-ink-2">
                    Mars is behind the Sun. For about {BLACKOUT_DAYS} days no message can be sent or received.
                  </p>
                  <p className="mt-2 text-sm text-ink">
                    The on-board advice is the plan. Log everything, and the record is sent when the link returns.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="wait-title"
          className="card rise flex flex-col p-6 sm:p-7"
          style={{ '--i': 5 } as React.CSSProperties}
        >
          <h2 id="wait-title" className="text-xl font-semibold tracking-tight">
            {link.contact ? 'While you wait' : 'Until the link returns'}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            The on-board answer. It comes from the rule engine on the ship and needs no link to Earth.
          </p>

          <ol key={`${evaluation.day}:${findingId}`} className="swap-in mt-5 flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-page tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="text-ink">{step}</span>
              </li>
            ))}
          </ol>

          {!link.contact && (
            <p className="mt-4 text-sm text-ink-2">
              Any step that needs Earth has to wait. Do everything else now.
            </p>
          )}

          <dl className="mt-auto grid grid-cols-2 gap-3 pt-6">
            <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
              <dt className="eyebrow text-ink-2">On board</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight @lg:text-2xl">Now</dd>
            </div>
            <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
              <dt className="eyebrow text-ink-2">From Earth</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums @lg:text-2xl">
                {link.contact ? earliest : `${BLACKOUT_DAYS} days`}
                <span className="block text-xs font-normal tracking-normal text-ink-2">
                  {link.contact ? 'at the earliest' : 'about, until contact'}
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">
            <Link href={`/?day=${evaluation.day}`} className="text-ink-2 underline underline-offset-2 hover:text-ink">
              Open today&apos;s findings
            </Link>
          </p>
        </section>
      </div>

      <section
        id="ledger"
        aria-labelledby="ledger-title"
        className="card rise scroll-mt-4 p-6 sm:p-7"
        style={{ '--i': 6 } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h2 id="ledger-title" ref={ledgerHeading} tabIndex={-1} className="rounded-md text-xl font-semibold tracking-tight">
              Light-time ledger
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              Every consult of this session: what the ship had at once, where the signal is, and the earliest
              moment an answer from Earth can be back.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-ink-2">
                Ship clock{' '}
                <span className="font-semibold text-ink tabular-nums">{now === null ? '--:--:--' : formatClock(now)}</span>{' '}
                {demoTime ? 'demo time' : 'UTC'}
              </p>
              <div className="flex gap-1 rounded-full bg-page/60 p-1 ring-1 ring-edge" role="group" aria-label="Clock speed">
                {[
                  { rate: 1, label: 'Real time' },
                  { rate: FAST_FORWARD_RATE, label: `${FAST_FORWARD_RATE} times faster` },
                ].map((option) => (
                  <button
                    key={option.rate}
                    type="button"
                    aria-pressed={rate === option.rate}
                    disabled={!ledger}
                    onClick={() => setRate(option.rate)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      rate === option.rate ? 'bg-ink text-page' : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted sm:text-right">
              {rate === 1
                ? 'Fast-forward is for demonstration: it lets a wait of half an hour pass in half a minute.'
                : `Demonstration: the ship clock is running ${rate} times faster than real time.`}
            </p>
          </div>
        </div>

        {consults.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-white/[0.035] p-5 text-ink-2 ring-1 ring-edge">
            {link.contact
              ? 'No consults yet. Send one above and follow its signal to Earth and back.'
              : 'No consults yet. From behind the Sun, none can be sent.'}
          </p>
        ) : (
          <ol className="@container mt-6 flex flex-col gap-4">
            {consults.map((consult) => (
              <LedgerEntry key={consult.id} consult={consult} now={now} reducedMotion={reducedMotion} tickMs={tickMs} />
            ))}
          </ol>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>
            {stored
              ? 'Kept for this browser session only. Replies from Earth are simulated.'
              : 'Storage is unavailable, so the ledger lasts until you leave this page. Replies from Earth are simulated.'}
          </p>
          {consults.length > 0 && (
            <button type="button" onClick={() => {
                update(() => emptyLedger(Date.now()))
                // This button disappears with the last consult; keep focus in the ledger.
                ledgerHeading.current?.focus()
              }}
              className={quiet}
            >
              Clear the ledger
            </button>
          )}
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </section>
    </>
  )
}
