# Demify: Health Monitoring Software for Astronauts

This is our solution to the NASA Space Apps Challenge **"Create Health Monitoring Software for Astronauts on Space Missions."**

On long missions astronauts are exposed to space radiation, isolation, altered gravity and a closed environment. These can lead to immune changes, bone loss, cardiovascular problems and mental strain. With communication delays of up to 20 minutes on the way to Mars, crews are often the first, and sometimes the only, people able to notice these changes. Demify collects the key health indicators in one place, rates each one against NASA and clinical thresholds and against the astronaut's own pre-flight baseline, and tells the crew what to do and when to call the flight surgeon.

> Demify is decision support, not a medical device. Flight surgeons remain the medical authority.

## Features

| Page | What it does |
|---|---|
| **Overview** `/` | Crew health board. Shows the mission, mission day and signal delay to Earth. An escalation banner appears when someone needs the flight surgeon. Each crew card shows body-region status. Vital signs have 24 h charts with the normal range shaded, plus a 7-day check-in history. |
| **Crew Monitor** `/crew/<id>` | One page per crew member, switchable. A live bedside-style patient monitor (ECG, arterial pressure, pleth, respiration waveforms with large numerics), permanently labelled **DEMO**. The page also has emergency drills (heart attack/STEMI, cardiac arrest/VF, hypertensive crisis) with a response checklist, and a complete health record table with trends. |
| **Alarms** (every page) | Monitor alarms in IEC 60601-1-8 style, red for high priority and amber for medium, with optional sound, a two-minute silence and activity-aware limits. Drills are always labelled **TRAINING SCENARIO**. |
| **Body Map** `/body` | Interactive human figure. Each of 9 body systems is coloured by its health status. The heart beats at the crew member's current heart rate. Click a region to see its function, how spaceflight affects it, the live indicators, what to do now and when to escalate. |
| **Check-in** `/check-in` | Daily self-assessment: vitals, sleep, mood, stress, hydration, exercise, body mass, vision symptoms and dosimeter. Each value is rated as you type. After saving you get concrete actions and a flight-surgeon alert when needed. |
| **Radiation** `/radiation` | Live solar radiation storm level and proton flux from NOAA GOES satellites, solar flare class, an estimated crew dose rate and a mission dose budget against NASA's 600 mSv career limit. Measured ISS dosimetry from NASA OSDR serves as a cross-check, alongside the NASA-STD-3001 limits and the NOAA 3-day outlook. |
| **NASA Data** `/research` | Real blood biomarkers of the SpaceX Inspiration4 crew from NASA OSDR: blood counts, metabolic panel, inflammation and cytokines. You can view them before, during and after flight, with a "what changed after flight" summary and a search over all OSDR studies. |
| **Guidance** `/guidance` | NASA's five hazards of spaceflight, a searchable reference for all 19 indicators (ranges, effects in space, how each is measured on the ISS, actions and sources) and the escalation protocol. |

### How the assessment works

- **Thresholds.** Every indicator has normal, caution and critical bands with a basis tag. **NASA** means NASA-STD-3001 or the NASA OCHMO technical briefs. **Clinical** means AHA, ADA or NEWS2 guidelines. **App** means a band we derived and is labelled as such in the UI. Sources: [`src/lib/health/knowledge.ts`](src/lib/health/knowledge.ts) and [`docs/research/health-knowledge-base.md`](docs/research/health-knowledge-base.md).
- **Personal baseline.** A shift of 25 % or more from your own pre-flight value raises a caution, even if the value is still inside the population range.
- **Resting vitals only.** Continuous vitals use the median of the last hour at rest. Exercise readings are never judged as resting values.
- **Escalation.** A critical value, or a value past an indicator's escalation limit, raises an escalation. The alert text adapts to the signal delay: on a long delay the crew is told to act first and transmit the data afterwards.

## Data sources: what is real and what is simulated

| Data | Source | Status |
|---|---|---|
| Solar proton flux, X-ray flares, Kp index, storm outlook | **NOAA SWPC** (live) | Real |
| Measured ISS radiation dose | **NASA OSDR** Environmental Data App | Real |
| Blood counts, metabolic panel, CRP, cytokines (Inspiration4 crew) | **NASA OSDR** OSD-569 / OSD-575 | Real |
| OSDR study catalogue | **NASA OSDR** search API | Real |
| Heart rate, blood pressure, SpO₂, temperature, respiration | Wearables / medical devices via `POST /api/readings` | **Simulated** until a device is connected |
| Sleep, mood, stress, hydration, exercise | Daily crew check-in | **Simulated demo values** until the crew enters real ones |

There is **no public real-time source of astronaut vital signs**, because crew medical data is protected. Demify therefore takes vital signs from devices over a simple API. Until a device is connected, a deterministic generator produces plausible vital signs around each crew member's baseline and **labels them "simulated" everywhere in the UI**. Real crew or sensor entries always override simulated values. Details on every data source: [`docs/research/data-sources.md`](docs/research/data-sources.md).

**Offline-first.** Spacecraft networks are intermittent or air-gapped. Each external data source ships a snapshot in [`data/snapshots/`](data/snapshots/). The app falls back from live data to cached data to that snapshot automatically, and every chart shows where its data came from and how fresh it is.

## Quick start

**Docker** (recommended). You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows/macOS (on Windows with the WSL 2 backend) or Docker Engine on Linux. Check that it works with `docker --version`.

**Docker** (recommended):

```bash
docker compose up -d --build
```

Then open http://localhost:3000.

Air-gapped mode (no internet; serves snapshots on port 3001):

```bash
docker compose --profile offline up -d --build
```

**Local development** (Node 24):

```bash
npm install
```

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTP proxy.

Run the tests:

```bash
npm test
```

Deployment, configuration, multi-arch builds (ARM flight computers), proxies and hardening are covered in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Every setting is an environment variable, documented in [`.env.example`](.env.example). The most important ones:

| Variable | Default | Purpose |
|---|---|---|
| `DEMIFY_MISSION` | `iss` | `iss`, `artemis-lunar` or `mars-transit`. Sets radiation baseline, comm delay, gravity and mission length |
| `DEMIFY_MISSION_START` | 92 days ago | Mission start date (ISO, e.g. `2026-09-01`). Set it for a real mission: the default moves with every restart |
| `DEMIFY_OFFLINE` | `false` | Never call external APIs; use snapshots only |
| `DEMIFY_SIMULATE` | `true` | Demo telemetry for vital signs |
| `NASA_API_KEY` | `DEMO_KEY` | api.nasa.gov key |

## Connecting real sensors

Any device or ground relay can push readings:

```bash
curl -X POST http://localhost:3000/api/readings \
  -H 'content-type: application/json' \
  -d '[{"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"},
       {"crewId":"cdr","indicator":"systolicBP","value":118,"unit":"mmHg","source":"sensor"}]'
```

`unit` must match the indicator's unit exactly, and `value` must lie in the indicator's plausible range (otherwise 400). Requests must be `application/json`, at most 1 MB, and readings dated more than 5 minutes in the future are rejected.

<details><summary>Indicator ids and units</summary>

| `indicator` | Meaning | `unit` |
|---|---|---|
| `heartRate` | Resting heart rate | `bpm` |
| `systolicBP` | Blood pressure, systolic | `mmHg` |
| `diastolicBP` | Blood pressure, diastolic | `mmHg` |
| `spo2` | Blood oxygen saturation | `%` |
| `bodyTemp` | Body temperature | `°C` |
| `respRate` | Respiratory rate | `/min` |
| `glucose` | Blood glucose (fasting) | `mg/dL` |
| `sleepHours` | Sleep last night | `h` |
| `mood` | Mood (1 = very low, 10 = great) | `/10` |
| `stress` | Stress (1 = calm, 10 = overwhelmed) | `/10` |
| `radiationDoseRate` | Radiation dose rate | `mSv/day` |
| `radiationCumulative` | Cumulative effective dose | `mSv` |
| `bodyMassChange` | Body mass change vs pre-flight | `%` |
| `boneLoss` | Estimated bone loss rate | `%/month` |
| `exerciseMinutes` | Exercise today | `min` |
| `hydration` | Water intake today | `L` |
| `wbc` | White blood cell count | `×10⁹/L` |
| `cabinCO2` | Cabin CO₂ partial pressure | `mmHg` |
| `visionChange` | Vision symptoms (0 none – 3 severe) | `/3` |

</details>

| Endpoint | Purpose |
|---|---|
| `GET /api/readings?crewId=&indicator=&hours=` | Readings (stored and simulated) |
| `POST /api/readings` | Ingest one reading or up to 500 (zod-validated) |
| `GET /api/assessment[?crewId=]` | Status, findings, actions and escalations per crew member |
| `GET /api/space-weather` | NOAA radiation environment plus estimated dose rate |
| `GET /api/osdr/inspiration4?panel=CMP&analyte=glucose` | Inspiration4 biomarkers |
| `GET /api/osdr/search?q=bone` | OSDR study search |
| `GET /api/osdr/eda` | ISS dosimetry |
| `GET /api/vitals/live[?crewId=]` | Instantaneous vitals for the live monitor |
| `GET /api/alarms` | Active monitor alarms across the crew |
| `GET/POST/DELETE /api/scenarios` | Start (`{"crewId":"plt","type":"stemi"}`) or end emergency training drills |
| `GET /api/health` | Liveness probe |

## Project structure

```
src/
  app/                 pages (App Router) and API routes
  components/          UI: overview, body map, check-in, research, guidance, charts
  lib/
    health/            knowledge base (thresholds, actions, sources) + assessment engine
    sources/           NOAA SWPC, NASA OSDR, OSDR EDA, simulator, cache with offline fallback
    store/             JSON-file readings store (swap for a DB in production)
data/snapshots/        bundled offline data
docs/                  research notes and deployment guide
docker/, Dockerfile, docker-compose.yml
tests/                 vitest suite
```

**Tech stack:** Next.js 16 (App Router, standalone output), React 19, TypeScript, Tailwind CSS 4, Recharts, Zod, Vitest, Docker.

## References

- NASA Human Research Program: [hazards](https://www.nasa.gov/hrp/hazards/), [risks](https://www.nasa.gov/hrp/risks/), [ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- [NASA-STD-3001 Vol. 1 Rev C](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf) and the NASA OCHMO technical briefs
- CSA: [Monitoring radiation for astronaut health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), [Why we do science in space](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp), [Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=Health&data_source=cgene,alsda,esa&data_type=study)
- [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
