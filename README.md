# Demify — Health Monitoring Software for Astronauts

Our solution to the NASA Space Apps Challenge "Create Health Monitoring Software for Astronauts on Space Missions."

On long missions, astronauts face radiation, isolation, altered gravity and a closed environment, which can lead to immune changes, bone loss, cardiovascular problems and mental strain. They are often the first to notice these changes in themselves, and on the way to Mars a question to the flight surgeon takes up to 20 minutes to arrive. Demify collects the key health indicators in one place, judges them against the crew member's own pre-flight baseline, and says what to do next.

## What it does today (phases 1 and 2)

- **Nine indicators:** resting heart rate, blood pressure, body temperature, blood oxygen, fasting blood sugar, sleep, mood, exercise and cabin CO₂.
- **Clickable body map:** a human figure with one marker per body system (brain, eyes, immune system, lungs, heart, metabolism, bones and muscles). Each marker shows that system's status; selecting it explains what spaceflight does to it, how to protect it, and which indicators describe it.
- **Four triage levels:** Nominal, Watch (self-care), Act (consult the Crew Medical Officer), Critical (contact the flight surgeon). Each level has its own colour and icon shape.
- **Personal baseline:** a value can be textbook-normal and still be flagged when it has drifted from that person's pre-flight average.
- **Patterns across indicators:** fever with a raised heart rate (possible infection), sleep loss with falling mood, raised cabin CO₂ behind poor sleep, low exercise with a climbing heart rate (deconditioning).
- **Measurement reminders:** readings that are too old are not judged; the crew member is asked to measure again.
- **Manual entry:** readings are validated and stored on the server.
- **Simulated 180-day mission** with scripted health events, and a time-lapse to play through it.
- **NASA sources:** every indicator links to its hazard and risk in NASA's Human Research Program.

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
| `npm test` | Unit tests for the rule engine and simulator |
| `npm run typecheck` | Type check |

## Sources

- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) and [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), NASA Human Research Program
- ACC/AHA 2017 blood pressure categories; American Diabetes Association glucose ranges; American Academy of Sleep Medicine sleep recommendation
- Stahn et al., *Scientific Reports*, 2017 (core body temperature in long-duration spaceflight); Barger et al., *Lancet Neurology*, 2014 (sleep on the ISS)
