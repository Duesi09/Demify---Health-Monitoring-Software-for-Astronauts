import { AnimatedNumber } from './AnimatedNumber'

interface Props {
  /** What is counted, for example "Mission dose". */
  label: string
  /** Accumulated dose in mSv. */
  dose: number
  /** The NASA limit it is measured against, in mSv. */
  limit: number
  /** What the limit applies to, for example "career limit". */
  limitName: string
}

/**
 * An accumulated radiation dose as a share of a NASA exposure limit. Dose and
 * limit are both effective dose in mSv, so they can share one bar.
 */
export function DoseBar({ label, dose, limit, limitName }: Props) {
  const share = Math.min(1, dose / limit)
  const percent = Math.floor((dose / limit) * 100)
  return (
    <span
      className="block"
      role="img"
      aria-label={`${label}: ${dose} mSv, ${percent}% of NASA's ${limit} mSv ${limitName}`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        <span className="text-ink">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            <AnimatedNumber value={dose} decimals={0} />
          </span>
          <span className="ml-1 text-sm text-ink-2">of {limit} mSv</span>
        </span>
      </span>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-axis">
        <span
          className="glide block h-full rounded-full bg-ink transition-[width] duration-500 ease-(--ease-soft)"
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="mt-1.5 block text-xs text-muted">
        {percent}% of NASA&apos;s {limitName}
      </span>
    </span>
  )
}
