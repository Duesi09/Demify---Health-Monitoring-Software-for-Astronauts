import { LIVE_HANDLING_S, MESSAGE_HANDLING_S } from '@/domain/consult'
import { HAZARDS } from '@/domain/hazards'
import {
  AU_KM,
  BLACKOUT_DAYS,
  EARTH_RADIUS_KM,
  ISS_ALTITUDE_KM,
  MARS_FARTHEST_AU,
  MARS_NEAREST_AU,
  MARS_SUN_AU,
  MOON_DISTANCE_KM,
  MOON_FROM_EARTH_DEG,
  MOON_RADIUS_KM,
  SPEED_OF_LIGHT_KM_S,
  SUN_RADIUS_KM,
  TRANSIT_ARRIVAL_AU,
  formatAngle,
  formatDuration,
} from '@/domain/missionContext'
import { MISSION_DAYS } from '@/domain/simulator'

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 })

const CONSTANTS: { name: string; value: string }[] = [
  { name: 'Speed of light', value: `${number(SPEED_OF_LIGHT_KM_S)} km/s` },
  { name: 'Astronomical unit', value: `${number(AU_KM)} km` },
  { name: 'Radius of Earth', value: `${number(EARTH_RADIUS_KM)} km` },
  { name: 'Distance of the Moon', value: `${number(MOON_DISTANCE_KM)} km` },
  { name: 'Radius of the Moon', value: `${number(MOON_RADIUS_KM)} km` },
  { name: 'Altitude of the space station', value: `about ${number(ISS_ALTITUDE_KM)} km` },
  { name: 'Distance of Mars from Earth', value: `about ${MARS_NEAREST_AU} to ${MARS_FARTHEST_AU} astronomical units` },
  { name: 'Distance of Mars from the Sun', value: `${MARS_SUN_AU} astronomical units on average` },
  { name: 'Radius of the Sun', value: `${number(SUN_RADIUS_KM)} km` },
]

const link = 'text-ink underline decoration-axis underline-offset-4 hover:decoration-ink'

/** Where the numbers come from, and which parts of the page are made up for the demo. */
export function SourcesBox() {
  return (
    <section
      aria-labelledby="sources-title"
      className="card rise p-6 sm:p-7"
      style={{ '--i': 7 } as React.CSSProperties}
    >
      <h2 id="sources-title" className="text-xl font-semibold tracking-tight">
        Sources and limits
      </h2>

      <div className="mt-5 grid gap-x-10 gap-y-6 @4xl:grid-cols-3">
        <div>
          <h3 className="eyebrow">Constants used</h3>
          <dl className="mt-3 flex flex-col gap-1.5 text-sm">
            {CONSTANTS.map((c) => (
              <div key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-grid pb-1.5">
                <dt className="text-ink-2">{c.name}</dt>
                <dd className="text-ink tabular-nums">{c.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="eyebrow">How the numbers are computed</h3>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink-2">
            <li>
              <span className="text-ink">Signal time</span> is the distance divided by the speed of light. One
              astronomical unit is {formatDuration(AU_KM / SPEED_OF_LIGHT_KM_S)} of light time.
            </li>
            <li>
              <span className="text-ink">Apparent size</span> is 2 x asin(radius / distance to the centre). From
              the Moon outward this equals 2 x atan(radius / distance).
            </li>
            <li>
              <span className="text-ink">The dashed ring</span> is the full Moon seen from Earth, computed the same
              way: {formatAngle(MOON_FROM_EARTH_DEG)}.
            </li>
            <li>
              <span className="text-ink">Earliest answer</span> is the round trip plus the handling time on the
              ground.
            </li>
            <li>
              <a href={HAZARDS.distance.url} target="_blank" rel="noreferrer" className={link}>
                NASA: Distance from Earth, one of the five hazards of human spaceflight
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow">What is illustrative</h3>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink-2">
            <li>
              <span className="text-ink">The transit trajectory.</span> A smooth curve from near zero to{' '}
              {TRANSIT_ARRIVAL_AU} astronomical units on day {MISSION_DAYS}. It is not a computed orbit.
            </li>
            <li>
              <span className="text-ink">The handling time.</span> {formatDuration(LIVE_HANDLING_S)} while a
              conversation is possible, {formatDuration(MESSAGE_HANDLING_S)} once the answer has to be written.
              Real handling times vary.
            </li>
            <li>
              <span className="text-ink">The replies.</span> Every reply from the flight surgeon is simulated and
              written in advance. Nobody on Earth has seen the data.
            </li>
            <li>
              <span className="text-ink">The autonomy scale.</span> Our own five steps to illustrate NASA&apos;s
              concept of Earth-independent medical operations.
            </li>
            <li>
              <span className="text-ink">The blackout.</span> NASA stops sending commands to its Mars missions for
              about two weeks around solar conjunction. The page treats this as {BLACKOUT_DAYS} days without
              contact in either direction.
            </li>
            <li>
              <span className="text-ink">The space station link.</span> Shown as a straight line down. Real links
              pass through relay satellites.
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
