import {
  PHASE_LABEL,
  STANCE_LABEL,
  consultProgress,
  milestones,
  replyFor,
  type Consult,
  type ConsultPhase,
  type ConsultProgress,
} from '@/domain/consult'
import { PROFILES, formatClock, formatCountdown, formatDuration } from '@/domain/missionContext'
import { StatusIcon, TONE } from '../status'

/** Each state has its own sign as well as its own words. */
function PhaseIcon({ phase }: { phase: ConsultPhase }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0">
      {phase === 'to-earth' && <path d="M2 8h11M9 4l4 4-4 4" {...line} />}
      {phase === 'handling' && (
        <>
          <circle cx="8" cy="8" r="6.2" {...line} />
          <path d="M8 4.6V8l2.3 1.5" {...line} />
        </>
      )}
      {phase === 'to-ship' && <path d="M14 8H3M7 4L3 8l4 4" {...line} />}
      {phase === 'answered' && (
        <>
          <circle cx="8" cy="8" r="6.2" {...line} />
          <path d="M5 8.3l2.1 2.1L11.2 6" {...line} />
        </>
      )}
    </svg>
  )
}

const WAITING: Record<Exclude<ConsultPhase, 'answered'>, string> = {
  'to-earth': 'Your message is on its way. Earth does not know yet.',
  handling: 'Your message has arrived. The ground is reading your data and preparing an answer.',
  'to-ship': 'The answer has left Earth and is on its way to you.',
}

/** The signal between ship and Earth: out on the upper lane, back on the lower one. */
function Track({ progress, tickMs }: { progress: ConsultProgress; tickMs: number }) {
  const { phase, phaseDone } = progress
  const out = phase === 'to-earth' ? phaseDone : 1
  const back = phase === 'to-ship' ? phaseDone : phase === 'answered' ? 1 : 0
  // Each move lasts exactly one clock tick, so the signal never stops between ticks.
  const glide = { transitionDuration: `${tickMs}ms`, transitionTimingFunction: 'linear' }
  const dot = 'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left]'

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3" aria-hidden="true">
      <div className="flex w-10 flex-col items-center gap-1 text-xs text-ink-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-raised ring-1 ring-edge">
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 1.5c2.2 1.8 3.2 4.2 3.2 6.8v3.2H4.8V8.3c0-2.6 1-5 3.2-6.8z" fill="var(--color-ink)" />
            <path d="M4.8 9.5 2.5 12.8h2.3zM11.2 9.5l2.3 3.3h-2.3z" fill="var(--color-ink-2)" />
          </svg>
        </span>
        Ship
      </div>

      <div className="relative h-16">
        <span className="absolute top-0 left-0 text-[11px] text-ink-2">Message to Earth</span>
        <span className="absolute right-0 bottom-0 text-[11px] text-ink-2">Answer to the ship</span>

        <span className="absolute inset-x-0 top-6 h-px bg-axis" />
        <span
          className="absolute top-6 left-0 h-0.5 -translate-y-1/2 rounded-full bg-series-1 transition-[width]"
          style={{ width: `${out * 100}%`, ...glide }}
        />
        <span className="absolute inset-x-0 top-10 h-px bg-axis" />
        <span
          className="absolute top-10 right-0 h-0.5 -translate-y-1/2 rounded-full bg-ink transition-[width]"
          style={{ width: `${back * 100}%`, ...glide }}
        />

        {phase === 'to-earth' && (
          <span
            className={`${dot} top-6 bg-series-1 shadow-[0_0_14px_var(--color-series-1)]`}
            style={{ left: `${out * 100}%`, ...glide }}
          />
        )}
        {phase === 'to-ship' && (
          <span
            className={`${dot} top-10 bg-ink shadow-[0_0_14px_rgb(255_255_255/0.7)]`}
            style={{ left: `${(1 - back) * 100}%`, ...glide }}
          />
        )}
      </div>

      <div className="flex w-10 flex-col items-center gap-1 text-xs text-ink-2">
        <span className="relative flex size-8 items-center justify-center">
          {phase === 'handling' && (
            <span className="absolute inset-0 animate-ping rounded-full bg-series-1/40 motion-reduce:animate-none" />
          )}
          <span className="relative size-6 rounded-full bg-[radial-gradient(circle_at_35%_30%,#b9dcff,#3d7fd6_45%,#0c2f72)]" />
        </span>
        Earth
      </div>
    </div>
  )
}

interface Props {
  consult: Consult
  /** Ship time, or null before the clock has started in the browser. */
  now: number | null
  /** With reduced motion the travelling signal is left out and the numbers carry the entry. */
  reducedMotion: boolean
  tickMs: number
}

/** One consult in the ledger: what the ship had at once, and what Earth sent, and when. */
export function LedgerEntry({ consult, now, reducedMotion, tickMs }: Props) {
  const times = milestones(consult)
  const progress = consultProgress(consult, now ?? consult.sentAt)
  const { phase } = progress
  const answered = phase === 'answered'
  const reply = replyFor(consult.findingId)
  const waited = formatDuration((times.answerAt - times.sentAt) / 1000)

  const steps: { label: string; at: number; reached: boolean }[] = [
    { label: 'Sent', at: times.sentAt, reached: true },
    { label: 'Reaches Earth', at: times.earthAt, reached: phase !== 'to-earth' },
    { label: 'Answer leaves Earth', at: times.replySentAt, reached: phase === 'to-ship' || answered },
    { label: 'Earliest answer back', at: times.answerAt, reached: answered },
  ]

  return (
    <li className="swap-in rounded-3xl bg-white/[0.035] p-5 ring-1 ring-edge sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1">
            <StatusIcon tone={consult.status} size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink">{consult.subject}</h3>
            <p className="mt-0.5 text-sm text-ink-2">
              Mission day {consult.day} | {PROFILES[consult.profile].label} | {TONE[consult.status].label}
            </p>
          </div>
        </div>
        <p
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ring-1 ring-edge ${
            answered ? 'bg-ink text-page' : 'bg-raised text-ink'
          }`}
        >
          <PhaseIcon phase={phase} />
          {PHASE_LABEL[phase]}
          {answered && ` after ${waited}`}
        </p>
      </div>

      {/* Once the answer is in, the signal has nothing left to show. */}
      {!reducedMotion && !answered && (
        <div className="mt-5">
          <Track progress={progress} tickMs={tickMs} />
        </div>
      )}

      <ol className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 @2xl:grid-cols-4">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-2">
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="mt-1 shrink-0 text-ink">
              {step.reached ? (
                <>
                  <circle cx="6" cy="6" r="6" fill="currentColor" />
                  <path d="M3.4 6.2l1.8 1.8 3.4-3.7" fill="none" stroke="var(--color-page)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <circle cx="6" cy="6" r="5" fill="none" stroke="var(--color-muted)" strokeWidth="1.4" />
              )}
            </svg>
            <p className="min-w-0 text-xs text-ink-2">
              {step.label}
              <span className="sr-only">{step.reached ? ', done' : ', still to come'}</span>
              <span className="block text-sm font-medium text-ink tabular-nums">{formatClock(step.at)}</span>
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
          <p className="eyebrow text-ink-2">On board | at once</p>
          <p className="mt-2 text-sm text-ink">{consult.onboardAction}</p>
        </div>

        <div className="rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
          {answered ? (
            <div className="swap-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow text-ink-2">From Earth | after {waited}</p>
                <p className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-page">
                  Simulated reply
                </p>
              </div>
              <p className="mt-2 text-sm text-ink">{reply.text}</p>
              <p className="mt-2 text-xs text-ink-2">Flight surgeon, mission control | {STANCE_LABEL[reply.stance]}</p>
            </div>
          ) : (
            <>
              <p className="eyebrow text-ink-2">From Earth | not before {formatClock(times.answerAt)}</p>
              <p className="mt-1 flex items-baseline gap-2">
                {/* A timer is silent for screen readers unless asked; state changes are announced once, elsewhere. */}
                <span role="timer" aria-live="off" className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
                  {formatCountdown(progress.remainingMs)}
                </span>
                <span className="text-sm text-ink-2">until the earliest answer</span>
              </p>
              <p className="mt-2 text-sm text-ink-2">{WAITING[phase]}</p>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
