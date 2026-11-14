# Demify: Health Monitoring Software for Astronauts

Our project for the NASA International Space Apps Challenge 2026 challenge **"Create Health Monitoring Software for Astronauts on Space Missions."**

On long missions astronauts are exposed to space radiation, isolation, altered gravity and a closed environment. These can lead to immune changes, bone loss, cardiovascular problems and mental strain. The further a crew travels, the longer every message to the ground takes: about 1.3 seconds from the Moon, and about 3 to 22 minutes one way from Mars, depending on where the two planets are. Demify is open-source research and training software for that situation. It collects the key health indicators in one place, shows which tagged reference range (NASA, clinical or project-defined) each value falls outside, compares it with the astronaut's own pre-flight baseline, and lets crews and mission-operations teams rehearse how pre-approved procedures would be timed under signal delay.

> **Research prototype, not a certified medical device.** Read the [intended purpose](#intended-purpose) before you use it.

## Intended purpose

Demify is open-source research and training software for analog and simulated space missions. It records self-reported wellbeing data and readings from connected sensors, shows them next to public space-weather and NASA open-science data, and indicates which reference ranges (published or project-defined, each tagged) a value falls outside. It is intended for research, education and mission-operations training with adult volunteers who have given informed consent. It is a research and training simulation: it shows how published and project-defined thresholds would flag values and how pre-approved procedures would be timed under signal delay. It must not be used for the medical care of any individual.

Research prototype, not a certified medical device.

The footer of every page in the app says:

> Research prototype – not a certified medical device. Not for diagnosis, treatment or emergency decisions. Vital signs are simulated unless labelled REAL or DEVICE. Thresholds come from NASA standards, clinical guidelines or our own project rules, and each carries its source tag. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service.

These texts live in [`src/lib/disclaimer.ts`](src/lib/disclaimer.ts); the app shows them verbatim (the intended purpose is on the Help page under "About Demify").

## Features

| Page | What it does |
|---|---|
| **Overview** `/` | Crew board for the mission profile: mission day and one-way signal delay to Earth. Each crew card shows body-region status. Vital signs have 24 h charts with the reference band shaded, plus a 7-day check-in history. An escalation banner appears when an escalation rule is met (see [How the assessment works](#how-the-assessment-works)); it is framed as training and says when, in a real mission, the flight surgeon would be contacted. |
| **Crew monitor** `/crew/<id>` | One page per crew member, switchable. The **Simulated training monitor**: bedside-style ECG, arterial pressure, pleth and respiration waveforms with large numerics, each value with its data label. Below it are the emergency drills and the complete health record with trends. |
| **Drills** (on the crew monitor) | Training scenarios (simulated heart attack/STEMI, cardiac arrest/VF, hypertensive crisis). They change only SIMULATED telemetry, are labelled DRILL on every screen, show a timed response checklist and end on their own after 30 minutes. |
| **Training alarms** (every page) | Alarm bar for the simulated training monitor, styled after IEC 60601-1-8 (red for high priority, amber for medium), with optional sound, a two-minute silence and activity-aware limits. |
| **Body map** `/body` | Interactive human figure. Each of 9 body systems is coloured by the worst status of its indicators. The heart beats at the crew member's current heart rate. Select a region to see its function, how spaceflight affects it, the latest readings and the matching procedure steps. |
| **Check-in** `/check-in` | Daily self-assessment: vitals, sleep, mood, stress, hydration, exercise, body mass, vision symptoms and dosimeter. Each value is checked against tagged reference ranges as you type. Saved values replace the SIMULATED demo data and show the procedure steps a mission would follow. |
| **Radiation** `/radiation` | Solar radiation storm level and proton flux from NOAA GOES satellites, solar flare class, an illustrative dose-rate estimate for the mission profile and a mission dose budget against NASA's 600 mSv career limit (NASA-STD-3001 Vol. 1 Rev C). Measured ISS dosimetry from NASA OSDR serves as a cross-check, alongside the NOAA 3-day outlook. |
| **Open data (NASA OSDR)** `/research` | Blood biomarkers of the SpaceX Inspiration4 crew from NASA OSDR: blood counts, metabolic panel, inflammation and cytokines, before, during and after flight, with a "what changed after flight" summary and a search over all OSDR studies. |
| **Guidance** `/guidance` | NASA's five hazards of spaceflight (RIDGE), a searchable reference for all 20 indicators (ranges with their source tags, effects in space, how each is measured on the ISS, procedure steps and sources) and the escalation protocol with the signal delay of each mission profile. |
| **Help** `/help` | How to use Demify, with diagrams: the daily routine, what the colours, badges and data labels mean, what to do when a training alarm sounds, running a drill, where the data comes from, how to connect a sensor, and the intended purpose. Download the user guide (PDF) on the Help page. |

### How the assessment works

- **Thresholds.** Every indicator has normal, caution and critical bands with a basis tag. **NASA** means NASA-STD-3001 or the NASA OCHMO technical briefs. **Clinical** means AHA, ADA, NEWS2 or MedlinePlus ranges, or the Fourth Universal Definition of Myocardial Infarction for the ST segment. **App** means a band or rule we defined ourselves (a project rule) and is labelled as such in the UI. Sources: [`src/lib/health/knowledge.ts`](src/lib/health/knowledge.ts) and [`docs/research/health-knowledge-base.md`](docs/research/health-knowledge-base.md).
- **Personal baseline (project rule).** A shift of 25 % or more from your own pre-flight value raises a caution, even if the value is still inside the population range. It never escalates on its own.
- **Resting vitals only.** Continuous vitals use the median of the last hour at rest. Exercise readings are never judged as resting values.
- **Escalation.** The critical band alone does not escalate: without a matching rule, a critical value asks for a re-check. An escalation comes only from explicit rules on each indicator: one value strictly beyond an escalation limit (for example blood pressure above 180/120 mmHg; 140–180/90–120 mmHg is caution with a re-check in 15 minutes, a project rule), any critical ST segment, SpO₂ or temperature value or any new vision symptom, a value that persists (stress 8 or more on 2 days in a row, mood 2 or less on 2 days, sleep under 6 h on 7 days, temperature 38.1 °C or more for 24 h, glucose above 250 mg/dL on 2 days, exercise under 60 min on 3 days: all project rules), or a current NOAA S1+ solar radiation storm. Training: in a real mission this prompts a call to the flight surgeon. The simulation shows how a pre-approved procedure would be timed under the mission's signal delay: with a long delay the onboard checklist starts first and the data is transmitted afterwards. Every rule with its basis: [`docs/research/health-knowledge-base.md`](docs/research/health-knowledge-base.md#when-a-value-escalates).
- **Signal delay.** The one-way delay comes from the mission profile (`DEMIFY_MISSION`), and each profile states its basis: ISS 0.5 s (relay through TDRS geostationary satellites plus network latency, illustrative; straight-line light time from 400 km would be about 1.3 ms), Moon 1.3 s (light time at about 384,400 km), Mars transit a fixed 750 s (mid-range of about 3 to 22 minutes one way, illustrative).

## Data labels: what is real and what is simulated

Every value in the app carries one of these labels:

| Label | Meaning |
|---|---|
| **REAL** | Fetched from a public source (NOAA SWPC, NASA OSDR), shown with its fetch time. Crew check-in entries are labelled **REAL · crew entry** |
| **SNAPSHOT** *date* | The bundled or last saved copy of a public source, used offline or when the source is down. Never called live |
| **SIMULATED** | Made by the demo telemetry generator around each crew member's baseline. Not measured |
| **DEVICE** | Posted by a sensor or gateway to `POST /api/readings`. A monitor fed partly by a device shows **DEVICE + SIMULATED** |

| Data | Source | Label |
|---|---|---|
| Solar proton flux, X-ray flares, Kp index, storm outlook | **NOAA SWPC** | REAL, or SNAPSHOT offline |
| Measured ISS radiation dose | **NASA OSDR** Environmental Data App | REAL, or SNAPSHOT offline |
| Blood counts, metabolic panel, CRP, cytokines (Inspiration4 crew) | **NASA OSDR** OSD-569 / OSD-575 | REAL, or SNAPSHOT offline |
| OSDR study catalogue | **NASA OSDR** search API | REAL, or SNAPSHOT offline |
| Heart rate, blood pressure, SpO₂, temperature, respiration, ST deviation | Wearables or other devices via `POST /api/readings` | SIMULATED until a device posts, then DEVICE |
| Sleep, mood, stress, hydration, exercise | Daily crew check-in | SIMULATED demo values until the crew enters real ones |

There is **no public real-time source of astronaut vital signs**, because crew medical data is protected. Demify therefore takes vital signs from devices over a simple API. Until a device is connected, a deterministic generator produces plausible vital signs around each crew member's baseline, **labelled SIMULATED everywhere in the UI**. Crew entries and DEVICE readings always replace simulated values. Details on every data source: [`docs/research/data-sources.md`](docs/research/data-sources.md).

**Offline-first.** Spacecraft networks are intermittent or air-gapped. Each external data source ships a snapshot in [`data/snapshots/`](data/snapshots/). The app falls back from live data to cached data to that snapshot automatically, and every chart shows where its data came from and how fresh it is.

## Documentation

| Document | For whom | What is in it |
|---|---|---|
| **Help page** `/help` in the app | Crew and anyone using the app | Daily routine, colours and badges, alarms, drills, data sources, with diagrams; the user guide (PDF) on the Help page |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Team and station operators | Architecture diagrams (today and target), quick start for Windows and Linux, start/stop/update, backup and restore, connecting sensors, drills, offline mode, troubleshooting |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Whoever deploys the container | Image layout, full configuration reference, proxies and custom CAs, air-gapped operation, ARM builds, TLS, scaling |
| [`docs/research/health-knowledge-base.md`](docs/research/health-knowledge-base.md) | Reviewers, flight-surgeon liaison | Thresholds, actions and sources behind every indicator |
| [`docs/research/data-sources.md`](docs/research/data-sources.md) | Developers | Every external data source, what is real and what is simulated |
| [`.env.example`](.env.example) | Operators | Every setting, with comments |
| [`LICENSE`](LICENSE) | Everyone | MIT |

To try the device API without hardware, run `npm run sensor:demo` while Demify is up. It posts demo vital signs as a wearable would, and the monitor switches from SIMULATED to DEVICE (see [`docs/OPERATIONS.md` §4.6](docs/OPERATIONS.md#46-sensor-demo-script)). It does not send the `x-demify-admin` header yet, so leave `DEMIFY_ADMIN_TOKEN` empty while you use it.

## Quick start

Step-by-step instructions for Windows (Git Bash) and Linux, with a first-run checklist, are in [`docs/OPERATIONS.md`](docs/OPERATIONS.md#2-quick-start-in-3-steps).

**Docker** (recommended). You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows/macOS (on Windows with the WSL 2 backend) or Docker Engine on Linux. Check that it works with `docker --version`, then:

```bash
docker compose up -d --build
```

Then open http://localhost:3000. Compose publishes the port on `127.0.0.1` only, so other machines cannot reach it; see [Stage and shared networks](#stage-and-shared-networks) to open it to a LAN.

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
| `DEMIFY_BIND` | `127.0.0.1` | Host address of the published ports (Compose only). `0.0.0.0` opens them to the LAN |
| `DEMIFY_ADMIN_TOKEN` | empty (off) | When set, drills and device readings need this token (see below) |
| `NASA_API_KEY` | `DEMO_KEY` | api.nasa.gov key |

## Stage and shared networks

Anyone who can reach Demify over the network can start a drill or post readings unless you lock the write APIs. Two settings handle that:

- **Loopback by default.** `docker-compose.yml` binds the published ports to `${DEMIFY_BIND:-127.0.0.1}`, so on a stage laptop only that laptop can open the app. For crew tablets or sensor hubs on a LAN, set `DEMIFY_BIND=0.0.0.0` in `.env`, and then also set a token.
- **Optional admin token.** With `DEMIFY_ADMIN_TOKEN` set (for example `openssl rand -hex 24`), `POST`/`DELETE /api/scenarios` (drills) and `POST /api/readings` (devices) answer `401` unless the request carries the token: devices and scripts send the header `x-demify-admin: <token>`; a browser is unlocked once by opening `http://<host>:3000/unlock?token=<token>`, which sets an httpOnly, `SameSite=Strict` cookie and redirects to the overview. The cookie stays valid for 7 days or until the token changes; changing the token is the only way to revoke it. Unlock before you share your screen: the token is in the address bar until the redirect, and the dev server (`npm run dev`) logs the request with it. Pages and `GET` APIs stay open. Without the variable nothing changes.

The daily check-in form saves through the app itself and is not covered by the token, so keep the loopback default on a stage. Details: [`docs/OPERATIONS.md` §3.7](docs/OPERATIONS.md#37-stage-and-shared-networks).

## Connecting real sensors

Any device or ground relay can push readings:

```bash
curl -X POST http://localhost:3000/api/readings \
  -H 'content-type: application/json' \
  -d '[{"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"},
       {"crewId":"cdr","indicator":"systolicBP","value":118,"unit":"mmHg","source":"sensor"}]'
```

With `DEMIFY_ADMIN_TOKEN` set, add `-H 'x-demify-admin: <token>'`. `unit` must match the indicator's unit exactly, and `value` must lie in the indicator's plausible range (otherwise 400). Requests must be `application/json`, at most 1 MB, and readings dated more than 5 minutes in the future are rejected. Each crew member can receive up to 600 readings per minute (`DEMIFY_RATE_LIMIT_PER_MIN`, 429 with `Retry-After` above). Request fields, all error codes and a step-by-step guide: [`docs/OPERATIONS.md` §4](docs/OPERATIONS.md#4-connecting-a-sensor).

Demo wearable without hardware (Node 20+, no packages). It does not send the `x-demify-admin` header yet: with `DEMIFY_ADMIN_TOKEN` set it gets `401` and stops, so leave the token empty while you use it or post with `curl` and the header:

```bash
npm run sensor:demo -- --crew cdr --interval 5
```

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
| `stDeviation` | ST segment deviation (ECG) | `mm` |

</details>

| Endpoint | Purpose |
|---|---|
| `GET /api/crew` | Crew members (ids `cdr`, `plt`, `ms1`, `ms2` by default) with their pre-flight baselines |
| `GET /api/readings?crewId=&indicator=&hours=` | Readings (stored and simulated) |
| `POST /api/readings` | Ingest one reading or up to 500 (zod-validated). Needs the admin token when one is set |
| `GET /api/assessment[?crewId=]` | Status, findings, procedure steps and escalations per crew member |
| `GET /api/space-weather` | NOAA radiation environment plus the illustrative dose-rate estimate |
| `GET /api/osdr/inspiration4?panel=CMP&analyte=glucose` | Inspiration4 biomarkers |
| `GET /api/osdr/mission` | OSDR studies linked to the Inspiration4 mission |
| `GET /api/osdr/search?q=bone` | OSDR study search |
| `GET /api/osdr/eda` | ISS dosimetry |
| `GET /api/vitals/live[?crewId=]` | Instantaneous vitals for the simulated training monitor |
| `GET /api/alarms` | Active training alarms across the crew |
| `GET /api/scenarios` | Active drills |
| `POST/DELETE /api/scenarios` | Start (`{"crewId":"plt","type":"stemi"}`) or end training drills. Need the admin token when one is set |
| `GET /unlock?token=` | Unlocks this browser for the write APIs when `DEMIFY_ADMIN_TOKEN` is set |
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
docs/                  operations handbook, deployment guide, research notes
scripts/               snapshot promotion, sensor demo
docker/, Dockerfile, docker-compose.yml
tests/                 vitest suite
```

**Tech stack:** Next.js 16 (App Router, standalone output), React 19, TypeScript, Tailwind CSS 4, Recharts, Zod, Vitest, Docker. Typeface: IBM Plex Sans and IBM Plex Mono, bundled with the app (no font CDN, so it works offline).

## License

MIT, see [`LICENSE`](LICENSE). Copyright (c) 2026 The Demify team.

Built for the NASA International Space Apps Challenge 2026. Uses public data from NASA OSDR and NOAA SWPC. Not affiliated with or endorsed by NASA or NOAA.

## References

- NASA Human Research Program: [hazards](https://www.nasa.gov/hrp/hazards/), [risks](https://www.nasa.gov/hrp/risks/), [ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- [NASA-STD-3001 Vol. 1 Rev C](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf) and the NASA OCHMO technical briefs
- CSA: [Monitoring radiation for astronaut health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), [Why we do science in space](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp), [Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=Health&data_source=cgene,alsda,esa&data_type=study)
- [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
