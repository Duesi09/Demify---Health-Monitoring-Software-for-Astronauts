# Demify: Health Monitoring Software for Astronauts

Our solution to the NASA Space Apps Challenge "Create Health Monitoring Software for Astronauts on Space Missions."

On long missions, astronauts face radiation, isolation, altered gravity and a closed environment, which can lead to immune changes, bone loss, cardiovascular problems and mental strain. They are often the first to notice these changes in themselves, and on the way to Mars a question to the flight surgeon takes up to 20 minutes to arrive. Demify collects the key health indicators in one place, judges them against the crew member's own pre-flight baseline, and says what to do next.

## What it does today

- **Eleven indicators:** resting heart rate, blood pressure, body temperature, blood oxygen, fasting blood sugar, sleep, mood, exercise and cabin CO₂, reaction time and daily radiation dose. All five NASA hazards have at least one indicator.
- **Vital signs monitor:** a heartbeat trace that beats at the measured heart rate and a pressure wave that swings between the measured diastolic and systolic values, next to heart rate, blood pressure, blood oxygen and temperature. The traces are drawn from the latest readings; they are an illustration, not a live sensor signal.
- **Mission timeline:** the whole mission as one strip with a cell per day in the colour of that day's status. The strip is also the control that moves through the mission.
- **Five hazards:** NASA's five hazards of human spaceflight, each with a ring showing how many of its indicators are nominal.
- **Range bars:** every indicator shows where its value sits among its normal, watch, act and critical ranges.
- **Clickable body map:** an anatomical figure showing nine body systems in their status colour: brain, eyes, balance, immune system, lungs, heart, metabolism, kidneys, and bones and muscles. Selecting a system explains what spaceflight does to it, how to protect it, and which indicators describe it. Eyes, balance and kidneys have no indicator yet and are drawn as outlines.
- **Four triage levels:** Nominal, Watch (self-care), Act (consult the Crew Medical Officer), Critical (contact the flight surgeon). Each level has its own colour and icon shape.
- **Personal baseline:** a value can be textbook-normal and still be flagged when it has drifted from that person's pre-flight average.
- **Patterns across indicators:** a racing heart with a blood pressure spike or low blood oxygen (possible heart attack), fever with a raised heart rate (possible infection), sleep loss with falling mood, raised cabin CO₂ behind poor sleep, low blood oxygen with raised cabin CO₂ (life-support fault), low exercise with a climbing heart rate (deconditioning).
- **Measurement reminders:** readings that are too old are not judged; the crew member is asked to measure again, and the overall status is not shown as nominal until they do.
- **Manual entry:** readings are validated and stored on the server.
- **Simulated 180-day mission** with scripted health events, including a life-support fault (days 54 to 58) and two heart attacks (days 97 and 168), and a time-lapse to play through it.
- **NASA sources:** every indicator links to NASA's page for its hazard and for its risk.

### Sections

The header leads to four sections. Each opens on the same mission day (`?day=`).

| Section | Address | What it is for |
|---|---|---|
| Today | `/` | The dashboard: status, findings, body map, indicators |
| Check-in | `/checkin` | The daily routine as a guided flow, the Reaction Self-Test and the measurement streak |
| Earth link | `/link` | How far Earth is, how old Earth's picture of you is, and a consult with the flight surgeon that shows the earliest possible answer |
| Radiation | `/radiation` | The mission dose against the career limit and the storm shelter procedure with timers |

- **Fit for today's task:** the dashboard takes the task on today's plan (spacewalk, burn, robotic arm, exercise, science, maintenance, rest) and advises go, caution or no-go, with reasons and an alternative. It is advice; the commander decides.
- **Reaction Self-Test:** a browser version of the 3-minute psychomotor vigilance test that crews run on the International Space Station, with a 30-second demo length. The result becomes the reaction time reading and is judged against your own baseline.
- **Earth link:** mission profiles (space station, Moon, Mars transit, Mars at its farthest, behind the Sun), Earth drawn at its true apparent size, signal time computed from distance, and a ledger of consults with a fast-forward for demos. Replies from the flight surgeon are simulated and labelled so.
- **Storm shelter procedure:** on a solar particle event day the Radiation section leads with a checklist and two clocks; on any other day it can be rehearsed as a drill. The estimate of dose avoided is illustrative and says so.
- **Evidence notes:** under the timeline, every simulated event names what has really been observed (in spaceflight, or in a ground or analog study) with a link to the source, and says plainly where an event is only a scenario.
- **Measurement streak:** days in a row on which no measurement was out of date. It rewards measuring, never the values.

The reference ranges are demo defaults based on general clinical ranges. They are not flight rules and not medical advice.

## Run it locally

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Run it as a container

```bash
docker compose up --build
```

Then open <http://localhost:3000>. Readings entered by hand are kept in the `demify-data` volume.

## Project layout

| Path | Contents |
|---|---|
| `src/domain` | Framework-free logic: metric catalog and ranges, rule engine, mission simulator, validation |
| `src/server` | Server-only code: storage for manually entered readings |
| `src/app` | Next.js pages and server actions |
| `src/ui` | Dashboard components |

Manually entered readings are saved to `.data/manual-readings.json` (or the folder set in `DEMIFY_DATA_DIR`). This suits one on-board server; serverless hosting needs a database instead.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests for the rule engine, simulator and body map |
| `npm run typecheck` | Type check |

## Sources

- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) and [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), NASA Human Research Program
- ACC/AHA 2017 blood pressure categories; American Diabetes Association glucose ranges; American Academy of Sleep Medicine sleep recommendation
- Stahn et al., *Scientific Reports*, 2017 (core body temperature in long-duration spaceflight); Barger et al., *Lancet Neurology*, 2014 (sleep on the ISS)
