import { BLACKOUT_DAYS, formatDuration, type LinkState } from '@/domain/missionContext'
import type { Evaluation } from '@/domain/types'
import { INCOMPLETE, StatusIcon, TRIAGE, type Tone } from '../status'

function Screen({
  where,
  age,
  tone,
  headline,
  note,
  dim = false,
}: {
  where: string
  age: string
  tone: Tone
  headline: string
  note: string
  dim?: boolean
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-edge">
      <p className="eyebrow text-ink-2">{where}</p>
      <p className="mt-0.5 text-xs text-ink-2">{age}</p>
      <p className={`mt-3 flex items-center gap-2.5 ${dim ? 'opacity-70' : ''}`}>
        <StatusIcon tone={tone} size={26} />
        <span className="text-xl leading-tight font-semibold tracking-tight">{headline}</span>
      </p>
      <p className="mt-2 text-sm text-ink-2">{note}</p>
    </div>
  )
}

/**
 * Earth's picture of the crew member is as old as the light time. The two
 * screens show the same status: on board as it is, on Earth as it was.
 */
export function EarthKnows({ evaluation, link }: { evaluation: Evaluation; link: LinkState }) {
  // Out-of-date readings cannot vouch for the crew member, so nominal is not claimed.
  const incomplete = evaluation.status === 'nominal' && evaluation.reminders.length > 0
  const tone: Tone = incomplete ? 'stale' : evaluation.status
  const headline = incomplete ? INCOMPLETE.headline : TRIAGE[evaluation.status].headline
  const top = evaluation.findings[0]
  const age = formatDuration(link.oneWayS)
  const live = link.autonomy === 1

  const lead = !link.contact
    ? 'Earth cannot see you at all.'
    : live
      ? 'Earth sees you as you are now.'
      : `Earth sees you as you were ${age} ago.`

  return (
    <section
      aria-labelledby="earth-knows-title"
      className="card rise @container flex flex-1 flex-col p-6 sm:p-7"
      style={{ '--i': 3 } as React.CSSProperties}
    >
      <h2 id="earth-knows-title" className="eyebrow">
        What Earth knows right now
      </h2>
      <p className="mt-2 text-2xl leading-tight font-semibold tracking-tight">{lead}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 @md:grid-cols-2">
        <Screen
          where="On board"
          age="Now"
          tone={tone}
          headline={headline}
          note={top ? top.title : incomplete ? "No findings in today's data" : 'No findings today'}
        />
        {link.contact ? (
          <Screen
            where="On Earth"
            age={live ? 'Live' : `${capitalise(age)} old`}
            tone={tone}
            headline={headline}
            note={live ? 'The same picture, at the same moment.' : `This status left the ship ${age} ago.`}
            dim={!live}
          />
        ) : (
          <Screen
            where="On Earth"
            age={`Up to ${BLACKOUT_DAYS} days old`}
            tone="stale"
            headline="No picture"
            note="The last status Earth received is from before the blackout."
          />
        )}
      </div>

      <p className="mt-auto pt-5 text-sm text-ink-2">
        {!link.contact
          ? 'Nothing you measure now reaches Earth until the link returns. Keep logging: the record is sent then.'
          : live
            ? `The delay is ${age}: too short to notice. The flight surgeon can follow along as it happens.`
            : `Whatever changes now reaches Earth ${age} from now. Until then the ground works with the older picture.`}
      </p>
    </section>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
