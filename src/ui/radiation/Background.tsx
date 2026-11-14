'use client'

import { CAREER_LIMIT_MSV, SOURCES, SOURCE_ORDER, type SourceId } from '@/domain/radiation'
import { SourceLink, link } from './parts'

function Topic({ title, sources, children }: { title: string; sources: SourceId[]; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
      <p className="mt-2 text-xs text-muted">
        {sources.length === 1 ? 'Source: ' : 'Sources: '}
        {sources.map((id, i) => (
          <span key={id}>
            {i > 0 && ' | '}
            <SourceLink source={id} />
          </span>
        ))}
      </p>
    </div>
  )
}

/** The two kinds of space radiation and why the total matters, in plain words. */
export function WhyItMatters() {
  return (
    <section aria-labelledby="why-radiation" className="card rise @container p-6 sm:p-7" style={{ '--i': 5 } as React.CSSProperties}>
      <h2 id="why-radiation" className="text-xl font-semibold tracking-tight">
        Why radiation matters
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Space radiation is the first of the five hazards of human spaceflight that NASA names. Away from Earth it
        comes in two kinds, and they call for different answers.
      </p>
      <div className="mt-5 grid gap-x-8 gap-y-6 @3xl:grid-cols-3">
        <Topic title="Galactic cosmic rays: the steady dose" sources={['zeitlin2013', 'cancerRisk']}>
          Fast particles from outside the solar system. They arrive all the time and from every direction, and they
          pass through the walls of the vehicle. Shielding does little against them. On the way to Mars an
          instrument measured about 1.8 mSv per day. This is the dose of a normal day on this page.
        </Topic>
        <Topic title="Solar particle events: the sudden dose" sources={['storm1972', 'cancerRisk', 'orionShelter']}>
          Bursts of particles after an eruption on the Sun. They are hard to predict and can arrive at short notice.
          Shielding works against them, which is why the crew builds a storm shelter. The solar storm of August 1972
          fell between the Apollo 16 and Apollo 17 missions, when no astronauts were in its path.
        </Topic>
        <Topic title="Why the total matters" sources={['cancerRisk', 'careerLimit', 'acuteSyndrome']}>
          Every day adds to the total, and the total never goes back down. The more radiation a person has received,
          the higher the risk of cancer later in life. NASA therefore limits the dose of a whole career to{' '}
          {CAREER_LIMIT_MSV} mSv. A very large dose within a short time can also cause illness in the hours and days after,
          with nausea among the first signs.
        </Topic>
      </div>
    </section>
  )
}

const LIMITS: { label: string; text: string }[] = [
  {
    label: 'Simulated',
    text: 'The readings on this page come from a simulated mission, not from a dosimeter, except those you enter by hand under Today. The size and the timing of the solar particle event are scenario values.',
  },
  {
    label: 'Projection',
    text: 'The projection continues the average of the most recent quiet days to the end of the mission. It assumes that no further solar particle event occurs.',
  },
  {
    label: 'Illustrative',
    text: 'The dose a shelter avoids is an illustration. Its shielding factor is an assumption you can move, and real values depend on the vehicle, on where the shelter is and on the event.',
  },
  {
    label: 'No live data',
    text: 'This page does not read space weather. The dose inside a vehicle cannot be worked out from public space weather data, because it depends on the shielding around the crew.',
  },
  {
    label: 'Dose quantity',
    text: 'The career limit is set in effective dose. The simulation treats the daily dosimeter reading as effective dose; on a real mission that value is worked out from the readings with a model of the body.',
  },
  {
    label: 'Thresholds',
    text: "The daily thresholds of 3, 10 and 50 mSv per day are defaults of this project, not NASA limits. The career limit of 600 mSv is NASA's.",
  },
  {
    label: 'Procedure',
    text: "The storm shelter checklist is a prototype written for this demo. It follows NASA's published shelter evaluation where it says so. It is not a flight procedure.",
  },
]

/** Every source the section uses, and plainly what is simulated, projected or illustrative. */
export function SourcesAndLimits() {
  return (
    <section aria-labelledby="sources-limits" className="card rise @container p-6 sm:p-7" style={{ '--i': 6 } as React.CSSProperties}>
      <h2 id="sources-limits" className="text-xl font-semibold tracking-tight">
        Sources and limits
      </h2>
      <div className="mt-4 grid gap-x-10 gap-y-7 @4xl:grid-cols-2">
        <div>
          <h3 className="eyebrow">What this page can and cannot tell you</h3>
          <dl className="mt-2 divide-y divide-grid">
            {LIMITS.map((item) => (
              <div key={item.label} className="grid gap-x-4 gap-y-0.5 py-3 @lg:grid-cols-[7.5rem_minmax(0,1fr)]">
                <dt className="text-sm font-semibold text-ink">{item.label}</dt>
                <dd className="text-sm text-ink-2">{item.text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="eyebrow">Sources</h3>
          <ol className="mt-2 divide-y divide-grid">
            {SOURCE_ORDER.map((id) => {
              const source = SOURCES[id]
              return (
                <li key={id} className="py-3">
                  <p className="text-sm text-ink">
                    {source.authors}
                    {'year' in source ? `, ${source.year}` : ''}.{' '}
                    <a href={source.url} target="_blank" rel="noreferrer" className={link}>
                      {source.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-2">{source.usedFor}</p>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
