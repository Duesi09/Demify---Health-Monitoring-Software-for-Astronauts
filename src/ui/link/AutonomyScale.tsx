import { AUTONOMY_STEPS, type LinkState } from '@/domain/missionContext'

/**
 * Who holds medical authority at this distance, as five steps from the ground
 * deciding to the crew deciding.
 */
export function AutonomyScale({ link }: { link: LinkState }) {
  return (
    <section
      aria-labelledby="autonomy-title"
      className="card rise flex flex-col p-6 sm:p-7"
      style={{ '--i': 2 } as React.CSSProperties}
    >
      <h2 id="autonomy-title" className="text-xl font-semibold tracking-tight">
        Who decides
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        The farther you are from Earth, the more medical authority moves from the ground to the crew.
      </p>

      {/* The same scale as one bar, for a glance. The list below says it in words. */}
      <div className="mt-5 flex items-center gap-3 text-xs text-ink-2" aria-hidden="true">
        <span>Ground</span>
        <span className="flex flex-1 gap-1">
          {AUTONOMY_STEPS.map((step) => (
            <span
              key={step.level}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
                step.level <= link.autonomy ? 'bg-ink' : 'bg-axis'
              }`}
            />
          ))}
        </span>
        <span>Crew</span>
      </div>

      <ol className="mt-4 flex flex-col gap-1">
        {AUTONOMY_STEPS.map((step) => {
          const current = step.level === link.autonomy
          return (
            <li
              key={step.level}
              aria-current={current ? 'step' : undefined}
              className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-500 motion-reduce:transition-none ${
                current ? 'bg-white/[0.07] ring-1 ring-edge' : ''
              }`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                  current ? 'bg-ink text-page' : 'text-ink-2 ring-1 ring-axis'
                }`}
                aria-hidden="true"
              >
                {step.level}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={current ? 'font-semibold text-ink' : 'text-ink-2'}>{step.title}</span>
                  {current && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold tracking-wide text-page uppercase">
                      You are here
                    </span>
                  )}
                </p>
                {/* On the lighter row the muted grey would be too faint to read. */}
                <p className={`text-xs ${current ? 'text-ink-2' : 'text-muted'}`}>{step.when}</p>
                {current && <p className="swap-in mt-1.5 text-sm text-ink">{step.detail}</p>}
              </div>
            </li>
          )
        })}
      </ol>

      <p className="mt-auto pt-5 text-xs text-muted">
        Illustration of NASA&apos;s concept of Earth-independent medical operations. The five steps and their
        limits are ours, not NASA&apos;s.
      </p>
    </section>
  )
}
