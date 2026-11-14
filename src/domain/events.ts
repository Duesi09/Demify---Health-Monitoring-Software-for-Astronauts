/**
 * Evidence notes for the scripted mission. The simulator writes health events
 * into the 180 day transit; this file ties each of them to what has really
 * been observed in spaceflight or in ground studies, and says plainly where
 * an event is only a scenario.
 *
 * Every citation here was checked against search results for authors or body,
 * year, publication and URL. Add a source only after the same check, and keep
 * each finding to what the source itself reports.
 */

export const STRENGTHS = ['observed in spaceflight', 'observed in a ground or analog study', 'scenario'] as const

/** How strongly reality backs a finding or an event. */
export type Strength = (typeof STRENGTHS)[number]

export interface Evidence {
  /** What was observed, in one plain sentence. */
  finding: string
  /** Authors or the body that published the source. */
  authors: string
  year: number
  /** Journal, report series or publisher. */
  publication: string
  url: string
  /** A cited source is an observation, so this is never `scenario`. */
  strength: Exclude<Strength, 'scenario'>
}

/** Something the simulation does, with the evidence behind it. */
export interface EvidenceNote {
  id: string
  title: string
  /** What happens in the simulation. */
  story: string
  /**
   * How well the event as a whole is grounded. A scenario may still list
   * related evidence, because knowing what has been seen near it is useful.
   */
  basis: Strength
  evidence: Evidence[]
  /** What is not known, or which part of the event is a scenario. Required for a scenario. */
  note?: string
}

export interface MissionEvent extends EvidenceNote {
  firstDay: number
  lastDay: number
}

/** The source of an evidence item as one line of text. */
export function citation(e: Evidence): string {
  return `${e.authors}, ${e.year}, ${e.publication}`
}

/** "Day 153" or "Days 28 to 46". */
export function dayRange(event: MissionEvent): string {
  return event.firstDay === event.lastDay ? `Day ${event.firstDay}` : `Days ${event.firstDay} to ${event.lastDay}`
}

// Sources used by more than one note are defined once, so a correction lands everywhere.

const BARGER_2014: Evidence = {
  finding:
    'Astronauts slept about 6 hours a night on space station missions although 8.5 hours were scheduled, and about three in four took sleep medication at some point.',
  authors: 'Barger and colleagues',
  year: 2014,
  publication: 'The Lancet Neurology',
  url: 'https://doi.org/10.1016/S1474-4422(14)70122-X',
  strength: 'observed in spaceflight',
}

const LAW_2014: Evidence = {
  finding:
    'On the space station, each rise of 1 mmHg in cabin CO₂ about doubled the odds that a crew member reported a headache. Cabin levels ranged from 1 to 9 mmHg.',
  authors: 'Law and colleagues',
  year: 2014,
  publication: 'Journal of Occupational and Environmental Medicine',
  url: 'https://journals.lww.com/joem/Abstract/2014/05000/Relationship_Between_Carbon_Dioxide_Levels_and.4.aspx',
  strength: 'observed in spaceflight',
}

const NASA_CO2_BRIEF: Evidence = {
  finding:
    'NASA limits the one hour average of cabin CO₂ to 3 mmHg, a limit it ties to headache reports from station crews. Earlier requirements accepted 3.8 to 7.5 mmHg.',
  authors: 'NASA Office of the Chief Health and Medical Officer',
  year: 2023,
  publication: 'Technical brief OCHMO-TB-004, Carbon Dioxide',
  url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf',
  strength: 'observed in spaceflight',
}

const ZEITLIN_2013_DAILY_DOSE: Evidence = {
  finding:
    'On the cruise to Mars, an instrument inside the spacecraft that carried the Curiosity rover (no crew on board) measured an average of 1.8 mSv a day from galactic cosmic rays.',
  authors: 'Zeitlin and colleagues',
  year: 2013,
  publication: 'Science',
  url: 'https://doi.org/10.1126/science.1235989',
  strength: 'observed in spaceflight',
}

// The same three sources back both heart attack events.
const HEART_EVIDENCE: Evidence[] = [
  {
    finding:
      'A crew member on the Mir station had a short run of ventricular tachycardia, a fast abnormal heart rhythm, recorded in the second month of the flight. It caused no symptoms.',
    authors: 'Fritsch-Yelle and colleagues',
    year: 1998,
    publication: 'The American Journal of Cardiology',
    url: 'https://pubmed.ncbi.nlm.nih.gov/9631987/',
    strength: 'observed in spaceflight',
  },
  {
    finding:
      'In January 2026 a station astronaut suddenly could not speak for about 20 minutes. The station ultrasound was used, doctors later ruled out a heart attack, and the crew returned to Earth early.',
    authors: 'Associated Press',
    year: 2026,
    publication: 'news report carried by PBS NewsHour',
    url: 'https://www.pbs.org/newshour/science/he-suddenly-couldnt-speak-in-space-nasa-astronaut-says-his-medical-scare-remains-unsolved',
    strength: 'observed in spaceflight',
  },
  {
    finding:
      'Among 310 NASA astronauts followed through their careers, the long-term risk of cardiovascular disease was similar to that of other NASA employees.',
    authors: 'Ade and colleagues',
    year: 2017,
    publication: 'Journal of the American Heart Association',
    url: 'https://doi.org/10.1161/JAHA.117.005564',
    strength: 'observed in a ground or analog study',
  },
]

const HEART_NOTE =
  'We found no documented heart attack during a spaceflight, so this event is a scenario. What has been recorded in flight are heart rhythm disturbances and one sudden illness in which a heart attack was ruled out.'

/** The scripted events of the simulated mission, in order of their first day. */
export const MISSION_EVENTS: MissionEvent[] = [
  {
    id: 'workload',
    firstDay: 28,
    lastDay: 46,
    title: 'Heavy workload with shifted sleep',
    story: 'A busy stretch moves sleep to odd hours. Sleep and mood fall, and reactions slow.',
    basis: 'observed in spaceflight',
    evidence: [
      BARGER_2014,
      {
        finding:
          'When work schedules moved sleep away from the body clock, station crew members slept less and used more sleep medication.',
        authors: 'Flynn-Evans and colleagues',
        year: 2016,
        publication: 'npj Microgravity',
        url: 'https://doi.org/10.1038/npjmgrav.2015.19',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'On the Reaction Self-Test, a 3 minute reaction time test used on the station, astronauts responded more slowly and rated their stress higher after nights of 6 hours of sleep or less.',
        authors: 'Jones and colleagues',
        year: 2022,
        publication: 'Sleep',
        url: 'https://doi.org/10.1093/sleep/zsac006',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'In Mars-500, a 520 day simulated Mars mission on the ground, the crew of six became less active as the mission went on, and the length and timing of their sleep changed.',
        authors: 'Basner and colleagues',
        year: 2013,
        publication: 'Proceedings of the National Academy of Sciences',
        url: 'https://doi.org/10.1073/pnas.1212646110',
        strength: 'observed in a ground or analog study',
      },
    ],
  },
  {
    id: 'scrubber',
    firstDay: 36,
    lastDay: 44,
    title: 'CO₂ scrubber degrades',
    story: 'A CO₂ scrubber loses performance. Cabin CO₂ rises and sleep suffers.',
    basis: 'observed in spaceflight',
    evidence: [
      LAW_2014,
      NASA_CO2_BRIEF,
      {
        finding:
          'In a chamber study, 22 astronaut-like volunteers showed no clear dose-response loss of decision making or cognition during short exposures to CO₂ of up to 5000 ppm (about 3.8 mmHg).',
        authors: 'Scully and colleagues',
        year: 2019,
        publication: 'npj Microgravity',
        url: 'https://doi.org/10.1038/s41526-019-0071-6',
        strength: 'observed in a ground or analog study',
      },
    ],
    note: 'Headaches are the effect seen in flight at these CO₂ levels. We found no flight study that links raised CO₂ to shorter sleep, so the sleep loss here is a scenario choice.',
  },
  {
    id: 'air-fault',
    firstDay: 54,
    lastDay: 58,
    title: 'Life-support fault',
    story: 'The degraded scrubber fails. Cabin CO₂ climbs far too high and blood oxygen drops.',
    basis: 'observed in spaceflight',
    evidence: [
      {
        finding:
          'On Apollo 13, after the oxygen tank failure, CO₂ in the lunar module cabin was allowed to climb to an indicated 14.9 mmHg. The crew later adapted command module canisters to keep it low for the trip home.',
        authors: 'NASA Manned Spacecraft Center',
        year: 1970,
        publication: 'Apollo 13 Mission Report (MSC-02680)',
        url: 'https://ntrs.nasa.gov/citations/19710003598',
        strength: 'observed in spaceflight',
      },
      NASA_CO2_BRIEF,
    ],
    note: 'High cabin CO₂ after a life-support failure has a real precedent. We found no published case of crew blood oxygen falling because of a cabin fault, so the low blood oxygen is a scenario.',
  },
  {
    id: 'infection',
    firstDay: 70,
    lastDay: 77,
    title: 'Infection with fever',
    story: 'An infection with fever. Temperature and heart rate rise, and exercise and sleep drop.',
    basis: 'observed in spaceflight',
    evidence: [
      {
        finding:
          'Medical records of 46 station crew members show 3.4 reported events per flight year across infectious disease, allergy and rash symptoms. Skin rashes and upper respiratory symptoms were the most common.',
        authors: 'Crucian and colleagues',
        year: 2016,
        publication: 'International Journal of General Medicine',
        url: 'https://doi.org/10.2147/IJGM.S114188',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'Dormant viruses (Epstein-Barr, varicella-zoster and cytomegalovirus) reactivated more often and at higher levels in station crew members on 60 to 180 day stays than on short flights.',
        authors: 'Mehta and colleagues',
        year: 2017,
        publication: 'npj Microgravity',
        url: 'https://doi.org/10.1038/s41526-017-0015-y',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'A review of NASA records counted 29 infectious disease incidents among 742 crew members on 106 space shuttle flights.',
        authors: 'Mermel',
        year: 2012,
        publication: 'Clinical Infectious Diseases',
        url: 'https://doi.org/10.1093/cid/cis861',
        strength: 'observed in spaceflight',
      },
    ],
    note: 'These sources count infections and symptoms in flight but do not report how often fever occurred. The fever and its size are scenario details.',
  },
  {
    id: 'skipped-bp',
    firstDay: 86,
    lastDay: 90,
    title: 'Blood pressure measurements skipped',
    story: 'The crew member skips blood pressure measurements for five days, so the monitor has no recent data.',
    basis: 'scenario',
    evidence: [
      {
        finding:
          'A NASA evidence review notes that some astronauts have been reluctant to share health information when they thought it could put their flight status at risk.',
        authors: 'Slack, Williams and colleagues, NASA Human Research Program',
        year: 2016,
        publication: 'Evidence Report: Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders',
        url: 'https://ntrs.nasa.gov/citations/20160004365',
        strength: 'observed in spaceflight',
      },
    ],
    note: 'We found no study of crew members skipping scheduled self-measurements. This event is a scenario that shows how the monitor handles missing data. The related evidence is about under-reporting of symptoms.',
  },
  {
    id: 'heart-attack-1',
    firstDay: 97,
    lastDay: 103,
    title: 'Heart attack',
    story:
      'A heart attack on day 97. Heart rate and blood pressure shoot up and blood oxygen drops, followed by about a week of after-effects.',
    basis: 'scenario',
    evidence: HEART_EVIDENCE,
    note: HEART_NOTE,
  },
  {
    id: 'exercise-outage',
    firstDay: 105,
    lastDay: 140,
    title: 'Exercise device out of service',
    story: 'The exercise device is out of service. Resting heart rate climbs and blood pressure rises.',
    basis: 'observed in a ground or analog study',
    evidence: [
      {
        finding:
          'In 70 days of bed rest, volunteers who did not exercise lost about 10 percent of their peak oxygen uptake, while those who exercised kept theirs.',
        authors: 'Ploutz-Snyder and colleagues',
        year: 2018,
        publication: 'Medicine and Science in Sports and Exercise',
        url: 'https://doi.org/10.1249/MSS.0000000000001618',
        strength: 'observed in a ground or analog study',
      },
      {
        finding:
          'After 60 days of head-down bed rest, the resting heart rate of 24 volunteers was about 8 beats a minute higher.',
        authors: 'Hoffmann and colleagues',
        year: 2020,
        publication: 'ESC Heart Failure',
        url: 'https://doi.org/10.1002/ehf2.13103',
        strength: 'observed in a ground or analog study',
      },
      {
        finding:
          'In 14 station astronauts, peak oxygen uptake was 17 percent lower by flight day 15. It rose again during the flight but on average did not return to the preflight level.',
        authors: 'Moore and colleagues',
        year: 2014,
        publication: 'Journal of Applied Physiology',
        url: 'https://doi.org/10.1152/japplphysiol.01251.2013',
        strength: 'observed in spaceflight',
      },
      {
        finding: 'In station astronauts, blood pressure measured over 24 hours was 8 to 10 mmHg lower in flight than on Earth.',
        authors: 'Norsk and colleagues',
        year: 2015,
        publication: 'The Journal of Physiology',
        url: 'https://doi.org/10.1113/jphysiol.2014.284869',
        strength: 'observed in spaceflight',
      },
    ],
    note: 'Loss of fitness and a faster resting heart are as observed in bed rest without exercise. The rise in blood pressure is a scenario choice: the flight study we found measured lower blood pressure in space.',
  },
  {
    id: 'solar-particle-event',
    firstDay: 148,
    lastDay: 149,
    title: 'Solar particle event',
    story: 'A solar particle event. The daily radiation dose jumps for two days.',
    basis: 'observed in spaceflight',
    evidence: [
      {
        finding:
          'On the cruise to Mars, an instrument inside the spacecraft that carried the Curiosity rover (no crew on board) recorded five solar particle events on top of the steady cosmic ray dose. They made up about 5 percent of the total dose.',
        authors: 'Zeitlin and colleagues',
        year: 2013,
        publication: 'Science',
        url: 'https://doi.org/10.1126/science.1235989',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'The intense solar storm of August 1972 fell between the Apollo 16 and Apollo 17 missions, when no astronauts were in its path.',
        authors: 'NASA (L. Tran)',
        year: 2019,
        publication: 'How NASA Will Protect Astronauts From Space Radiation at the Moon',
        url: 'https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon',
        strength: 'observed in spaceflight',
      },
      {
        finding:
          'Calculations for the August 1972 storm give dose rates to skin, eye lens and bone marrow for a crew in deep space that are much higher than for the large storms of 1989.',
        authors: 'Parsons and Townsend',
        year: 2000,
        publication: 'Radiation Research',
        url: 'https://pubmed.ncbi.nlm.nih.gov/10825747/',
        strength: 'observed in a ground or analog study',
      },
      {
        finding:
          'In a test on the ground, engineers checked how an Orion crew would build a shelter from stowage bags within about an hour of a warning and stay in it for up to 24 hours.',
        authors: 'NASA',
        year: 2016,
        publication: 'Scientists and Engineers Evaluate Orion Radiation Protection Plan',
        url: 'https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/',
        strength: 'observed in a ground or analog study',
      },
    ],
    note: 'Solar particle events have been measured in deep space, but the August 1972 storm found no crew there, so doses to people from a large event are calculated, not measured. The size of the dose jump in the simulation is a scenario value.',
  },
  {
    id: 'low-blood-sugar',
    firstDay: 153,
    lastDay: 153,
    title: 'Low blood sugar after a missed meal',
    story: 'A meal is missed before the morning measurement, and fasting blood sugar reads low.',
    basis: 'scenario',
    evidence: [
      {
        finding:
          'In eight astronauts on 6 month station missions, an index of insulin resistance rose during the flight.',
        authors: 'Hughson and colleagues',
        year: 2016,
        publication: 'American Journal of Physiology: Heart and Circulatory Physiology',
        url: 'https://doi.org/10.1152/ajpheart.00802.2015',
        strength: 'observed in spaceflight',
      },
    ],
    note: 'We found no published case of low blood sugar in a healthy astronaut in flight. This event is a scenario. What has been measured in flight points the other way, toward insulin resistance.',
  },
  {
    id: 'heart-attack-2',
    firstDay: 168,
    // The simulator gives both heart attacks the same after-effects.
    lastDay: 174,
    title: 'Second heart attack',
    story: 'A second heart attack on day 168, again followed by about a week of after-effects.',
    basis: 'scenario',
    evidence: HEART_EVIDENCE,
    note: HEART_NOTE,
  },
]

/** Slow changes that run through the whole mission, so they belong to no single day. */
export const BACKGROUND: EvidenceNote[] = [
  {
    id: 'background-sleep',
    title: 'Sleep a little shorter',
    story: 'Sleep settles about half an hour below the pre-flight average.',
    basis: 'observed in spaceflight',
    evidence: [BARGER_2014],
  },
  {
    id: 'background-temperature',
    title: 'Body temperature slightly up',
    story: 'Body temperature settles a few tenths of a degree above the pre-flight average.',
    basis: 'observed in spaceflight',
    evidence: [
      {
        finding:
          'In station astronauts, core body temperature at rest rose gradually over about two and a half months to about 1 °C above the preflight level.',
        authors: 'Stahn and colleagues',
        year: 2017,
        publication: 'Scientific Reports',
        url: 'https://doi.org/10.1038/s41598-017-15560-w',
        strength: 'observed in spaceflight',
      },
    ],
    note: 'The simulated rise is smaller than the one measured on the station.',
  },
  {
    id: 'background-co2',
    title: 'Cabin CO₂ far above Earth levels',
    story: 'Cabin CO₂ stays at a few mmHg all mission. Outdoor air on Earth holds about 0.3 mmHg.',
    basis: 'observed in spaceflight',
    evidence: [LAW_2014, NASA_CO2_BRIEF],
  },
  {
    id: 'background-radiation',
    title: 'Steady deep-space radiation',
    story: 'The crew member receives about 1.8 mSv of radiation a day from galactic cosmic rays.',
    basis: 'observed in spaceflight',
    evidence: [ZEITLIN_2013_DAILY_DOSE],
  },
]

/** The scripted events active on a mission day, earliest first. Empty on a quiet day. */
export function eventsOn(day: number): MissionEvent[] {
  return MISSION_EVENTS.filter((e) => day >= e.firstDay && day <= e.lastDay)
}
