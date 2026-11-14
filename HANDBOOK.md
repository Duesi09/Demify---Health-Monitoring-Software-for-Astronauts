# Demify Handbook

Everything in one place: where the project stands, how it is built, what was changed in the review, what is still open, ideas that go beyond a dashboard, and tips for the pitch and the submission.

Written on 13 November 2026 and updated on 14 November for the NASA Space Apps Challenge "Create Health Monitoring Software for Astronauts on Space Missions". Sections 1 and 1a describe the `Phase-3` branch, which holds everything. The later sections were written for the `test` branch before Phase 3 and are still valid for what they cover; where they differ, section 1a wins.

## Contents

1. [Where things stand](#1-where-things-stand), with [1a. What Phase 3 adds](#1a-what-phase-3-adds)
2. [What the app does](#2-what-the-app-does)
3. [How it is built](#3-how-it-is-built)
4. [Indicators and thresholds](#4-indicators-and-thresholds)
5. [Triage levels and patterns](#5-triage-levels-and-patterns)
6. [The simulated mission](#6-the-simulated-mission)
7. [Changes made in the review](#7-changes-made-in-the-review)
8. [What was checked and what was not](#8-what-was-checked-and-what-was-not)
9. [Known limits and open decisions](#9-known-limits-and-open-decisions)
10. [NASA sources used in the app](#10-nasa-sources-used-in-the-app)
11. [Roadmap for the remaining time](#11-roadmap-for-the-remaining-time)
12. [Ideas beyond a dashboard](#12-ideas-beyond-a-dashboard)
13. [Research facts worth quoting](#13-research-facts-worth-quoting)
14. [Pitch and demo tips](#14-pitch-and-demo-tips)
15. [Submission checklist](#15-submission-checklist)
16. [Working tips](#16-working-tips)
17. [Sources](#17-sources)

---

## 1. Where things stand

| Item | State |
|---|---|
| Unit tests | 316 of 316 pass |
| Type check and production build | Clean |
| Browser run | 17 page variants load with no console errors, desktop and phone width |
| Accessibility scan | No WCAG A or AA violations found by the automated scan on any section |
| Simulated mission | 77 nominal days, 26 Watch, 72 Act, 5 Critical |
| Hazards covered | 5 of 5 |

### Branches

| Branch | Contains | Notes |
|---|---|---|
| `main` | README only | Nothing merged yet |
| `Phase-1` | Phase 1, body map, redesign, heart attack scenario, the review fixes | Another session pushes here |
| `Phase-2` | README only | Empty |
| `test` | Same as `Phase-1` at the time of the last merge | Superseded by `Phase-3` |
| `Phase-3` | Everything on `Phase-1` plus the four sections in section 1a | The most complete branch right now |

`Phase-3` was built on `Phase-1` after it had merged `test`. Almost all of Phase 3 is new files, so merging it back should be easy. The shared files it touches are `Dashboard.tsx`, `BodyMap.tsx`, `MetricDetail.tsx`, `RangeBar.tsx`, `tiles.ts` and the domain files for the two new indicators.

## 1a. What Phase 3 adds

The app now has four sections, reached from the header. Each opens on the same mission day.

| Section | Address | What it does |
|---|---|---|
| Today | `/` | The dashboard, now with "Fit for today's task", evidence notes under the timeline, and three cards that lead into the other sections with live numbers |
| Check-in | `/checkin` | The daily routine as a guided flow, the Reaction Self-Test, the measurement streak |
| Earth link | `/link` | Distance to Earth, signal time, Earth at its true apparent size, who decides at that distance, and a consult with the flight surgeon that shows the earliest possible answer |
| Radiation | `/radiation` | Mission dose against the 600 mSv career limit, projection, storm shelter procedure with clocks, drill mode |

### New in the logic

| Addition | Detail |
|---|---|
| Indicator: radiation dose | mSv per day. Below 3 nominal, 3 to below 10 Watch, 10 to below 50 Act (take shelter), 50 and above Critical. Project defaults |
| Indicator: reaction time | Milliseconds. Below 400 nominal, 400 to below 500 Watch, 500 and above Act; drift of +40 ms Watch, +80 ms Act. Project defaults |
| Pattern: fatigue | Sleep is low and reaction time is off: "Sleep loss is slowing your reactions" |
| Body system: whole body and cells | The outline of the figure, driven by the radiation dose |
| Scripted event | Solar particle event on days 148 and 149 (about 43 and 14.5 mSv) |
| Task readiness | A task plan for all 180 days and a go, caution or no-go verdict with reasons and an alternative |
| Mission context | Five profiles; light time computed from distance; Mars transit grows to 1.5 astronomical units on day 180 (illustrative curve) |
| Evidence | Each scripted event carries sources and a strength label: observed in spaceflight, observed in a ground or analog study, or scenario |

The simulated values of the ten older indicators did not change; a checksum test pins them.

### Demo days for the new parts

| Day | Where | Shows |
|---|---|---|
| 23 | Today | Spacewalk planned, verdict go |
| 42 | Today | Spacewalk planned, verdict no-go: sleep loss is slowing reactions |
| 49 | Today | The postponed spacewalk, go after recovery |
| 90 | Today, Check-in | A burn with caution because blood pressure is out of date; the check-in walks through the measurement; the streak has just broken |
| 97 | Earth link | Critical on board; Earth sees you as you were 4 min 56 s ago; earliest answer 19 min 52 s |
| 148 | Today, Radiation | Solar particle event; the dashboard card leads to the shelter procedure |
| 180 | Earth link | Earth is 12 min 29 s away, 12 arcseconds across |
| any | Earth link | Switch to "Behind the Sun": no contact for 14 days, you are the medical authority |
| any | Check-in | The 30-second demo of the Reaction Self-Test, which a judge can take |

### What is honest about it, and what is not real

- All mission data is simulated. Only values entered by hand, including a reaction test result, are real.
- Replies from the flight surgeon are written in advance and labelled as simulated.
- The Mars transit trajectory is an illustration, not a computed orbit.
- The dose a shelter avoids is an illustrative estimate with its assumption shown.
- There is no live space weather. The data services could not be reached while building.
- The browser reaction test is not a medical instrument. It is good for comparison with your own baseline on the same device.
- Task readiness limits are project defaults, not flight rules.
- Citations in the evidence notes and on the Radiation page were confirmed through search results, not by opening every paper. Click each one before the pitch.

### Second-pass review

An independent review read all Phase 3 code and found 13 defects. All are fixed, and one more was found while checking the fixes:

| Area | What was wrong | Now |
|---|---|---|
| Task readiness | "Exercise, with caution" during a solar particle event, while the banner said take shelter | No-go for every task except rest |
| Task readiness | Work "with a crewmate" during a possible infection, while the banner said rest and keep away from crewmates | No-go for every task except rest |
| Task readiness | A heart racing today got a milder verdict than the same heart a day later | Both count the same |
| Task readiness | Exercise sessions planned on days when the exercise device is out of service | Maintenance on those days |
| Saving | A reading saved in one section could be missing after the Back button | Every section is refreshed after a save |
| Back button | After a fresh page load, Back changed the address but not the page | Fixed in every section, Back and Forward |
| Earth link | The dashboard card could quote a different distance than the page it opened | The card opens the Mars transit it quotes |
| Earth link | The ship clock still said "UTC" after fast-forward | It says "demo time" |
| Earth link | Keyboard focus was lost after clearing the ledger | Focus moves to the ledger heading |
| Radiation | Focus jumped away while stepping through days with the drill open | Focus moves once |
| Check-in | A very slow or very fast reaction result could not be saved | Saved at the nearest accepted value, with a note |
| Evidence | The note for the exercise outage ended before its after-effects | It runs to day 146 and says so |
| Performance | Every day of the time-lapse could trigger page fetches in the background | Day-dependent links are no longer fetched ahead |

### Not finished

- The older sections of this handbook (thresholds table, patterns, simulated mission day table) do not list the two new indicators, the fatigue pattern or the solar particle event.
- Reaction timing was not measured on a real device, only driven by script.

---

## 2. What the app does

The guiding idea is the **autonomous on-board medic**. On the way to Mars a signal takes up to about 20 minutes one way, so the doctor on Earth cannot answer at once. The software has to judge, explain and say what to do now.

Three principles carry the whole app:

- **Personal baseline, not only textbook ranges.** A value can be normal by the book and still stand out because it moved away from the crew member's own pre-flight average.
- **Connections, not single values.** Several values together often show the cause, not only the symptom.
- **Clear triage with a next step.** Every finding ends in one concrete action.

### Features

| Feature | What it is |
|---|---|
| Health status banner | The overall triage level, its guidance and the first thing to do |
| Vital signs monitor | A heartbeat trace at the measured heart rate and a pressure wave, drawn from the latest readings. It is an illustration, not a live sensor signal |
| Mission timeline | One cell per mission day in the colour of that day's status. It is also the day control |
| Body map | A clickable anatomical figure with nine body systems. Each system is filled in the colour of its status |
| Findings list | Each finding with detail, action and links to its indicators |
| Five hazards row | One ring per NASA hazard showing how many of its indicators are nominal |
| Indicator tiles | Value, trend line, range bar and change against the pre-flight baseline |
| Detail panel | Trend chart with normal range and baseline, table view, manual entry, explanation and sources |
| Manual entry | Values are checked in the browser and again on the server, then saved on the server |
| Reminders | Readings that are too old are not judged; the app asks for a new measurement |
| Time-lapse | Plays through the 180 simulated days |

---

## 3. How it is built

### Stack

- **Framework:** Next.js 16 with React 19 and TypeScript. The server plays the on-board computer.
- **Look:** Tailwind CSS 4, charts with Recharts, the Inter typeface bundled locally. Animations switch off when the system asks for reduced motion.
- **Tests:** Vitest.
- **Container:** `Dockerfile` and `compose.yaml` build a self-contained image. Readings live in a volume.

Note for anyone writing code: `AGENTS.md` warns that this Next.js version differs from older ones. Read the guides in `node_modules/next/dist/docs/` before changing framework code.

### Three layers

| Layer | Folder | Runs where | Job |
|---|---|---|---|
| Front | `src/ui` | Browser | Shows the dashboard, takes input, runs the rule engine on every day change |
| Core logic | `src/domain` | Browser and server | Indicators, thresholds, rule engine, simulator, validation. No framework code |
| Back | `src/app`, `src/server` | Server | Loads all readings, re-checks manual entries and saves them to a JSON file |

### Folders

```
src/
  domain/                 core logic, shared by front and back
    types.ts              data shapes: Reading, MetricDef, Finding, Status
    metrics.ts            every indicator: unit, ranges, drift rule, how to measure
    hazards.ts            the five NASA hazards and the page for each NASA risk
    bodyRegions.ts        the nine body systems and their indicators
    engine.ts             rule engine: ranges, baseline drift, patterns, reminders
    simulator.ts          180-day demo mission with scripted events
    validate.ts           input checks, used on both sides
    format.ts             number and unit formatting
    *.test.ts             unit tests
  server/                 back
    mission.ts            merges simulated and manual readings
    readingStore.ts       reads and writes the JSON file, with its own tests
  app/                    back and entry point
    page.tsx              loads readings on the server, renders the dashboard
    error.tsx             shown when the dashboard cannot load
    actions.ts            server actions: save readings, reset
    layout.tsx, globals.css
  ui/                     front
    Dashboard.tsx         main screen, holds the selected day and indicator
    TriageBanner.tsx      overall status and first action
    VitalsMonitor.tsx     heartbeat and pressure traces
    MissionTimeline.tsx   day strip and day control
    BodyMap.tsx           clickable figure
    FindingsList.tsx      findings and measurements due
    HazardRow.tsx         one ring per hazard
    MetricTile.tsx        one tile per indicator, with Sparkline and RangeBar
    MetricDetail.tsx      detail panel, with TrendChart and LogForm
    AnimatedNumber.tsx    numbers that glide to a new value
    status.tsx, tiles.ts  colours, icons and tile layout
```

### How data flows

1. The server builds the list of readings: the simulated mission plus the manual entries from the JSON file.
2. `page.tsx` hands that list to the dashboard in the browser.
3. The dashboard runs the rule engine for the selected day and gets a status per indicator, the findings and the reminders.
4. Banner, body map, findings, hazard row and tiles all draw from that one result.
5. When the crew member logs a value, the form checks it, the server action checks it again and saves it, and the dashboard evaluates again.

### Run it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>. As a container:

```bash
docker compose up --build
```

Checks before every push:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

---

## 4. Indicators and thresholds

These are demo defaults taken from general clinical reference ranges. They are not flight rules and not medical advice. Say so in the pitch before a judge asks.

| Indicator | Unit | Nominal | Watch | Act | Critical |
|---|---|---|---|---|---|
| Resting heart rate | bpm | 50 to 100 | 40 to 49, 101 to 120 | below 40, 121 to 140 | 141 and above |
| Systolic pressure | mmHg | 90 to 119 | 120 to 139 | 70 to 89, 140 to 179 | below 70, 180 and above |
| Diastolic pressure | mmHg | 60 to 79 | 40 to 59, 80 to 89 | below 40, 90 to 119 | 120 and above |
| Fasting blood sugar | mg/dL | 70 to 99 | 100 to 125 | 54 to 69, 126 to 249 | below 54, 250 and above |
| Body temperature | °C | 36.0 to 37.5 | 35.0 to 35.9, 37.6 to 37.9 | 38.0 to 39.4 | below 35.0, 39.5 and above |
| Blood oxygen | % | 95 and above | 92 to 94 | 90 to 91 | below 90 |
| Sleep (7-day average) | h | 6.5 to 9.4 | 5.5 to 6.4, 9.5 and above | below 5.5 | none |
| Mood (7-day average) | 1 to 5 | 3 and above | 2 to 2.9 | below 2 | none |
| Exercise (7-day average) | min | 90 and above | 45 to 89 | below 45 | none |
| Cabin CO₂ | mmHg | below 3 | 3 to 3.9 | 4 to 5.2 | 5.3 and above |

### Baseline drift

The 7-day average is compared with the pre-flight average. A drift raises its own finding, even when the value is inside the normal range.

| Indicator | Direction that matters | Watch | Act |
|---|---|---|---|
| Resting heart rate | up | +8 bpm | +15 bpm |
| Systolic pressure | both | 10 mmHg | 20 mmHg |
| Diastolic pressure | both | 8 mmHg | 15 mmHg |
| Fasting blood sugar | both | 12 mg/dL | 25 mg/dL |
| Body temperature | up | +0.5 °C | +1.0 °C |
| Blood oxygen | down | 2 points | 4 points |
| Sleep | down | 1 h | 2 h |
| Mood | down | 1 point | 1.5 points |

### When a reading is too old

| Indicator | Counts as out of date after |
|---|---|
| Cabin CO₂ | 1 day |
| Sleep, mood, exercise | 2 days |
| Heart rate, blood pressure, temperature, blood oxygen | 3 days |
| Fasting blood sugar | 7 days |

### Body systems

| Body system | Indicators | NASA hazard |
|---|---|---|
| Brain and mind | Sleep, mood | Isolation and confinement |
| Eyes and vision | None yet | Gravity fields |
| Balance and coordination | None yet | Gravity fields |
| Immune system | Body temperature | Hostile/closed environments |
| Lungs and cabin air | Blood oxygen, cabin CO₂ | Hostile/closed environments |
| Heart and circulation | Heart rate, blood pressure | Gravity fields |
| Metabolism and nutrition | Fasting blood sugar | Distance from Earth |
| Kidneys and fluids | None yet | Gravity fields |
| Bones and muscles | Exercise | Gravity fields |

---

## 5. Triage levels and patterns

| Level | Meaning | Who acts |
|---|---|---|
| Nominal | Nothing flagged | Nobody; keep measuring |
| Watch | Handle it yourself | The crew member |
| Act | Consult today | Crew Medical Officer |
| Critical | Act now | Crew Medical Officer and flight surgeon |

Each level has its own colour and its own icon shape, so the status reads without colour vision.

A fifth state exists on the banner: **Measurements due**. It appears when nothing is flagged but at least one reading is out of date. The app does not claim "nominal" with missing data.

### Patterns across indicators

| Pattern | Fires when | Level |
|---|---|---|
| Possible heart attack | Resting heart rate above 120 bpm together with blood pressure in the Act or Critical range, or reduced blood oxygen | Critical |
| Possible infection | Temperature at 38.0 °C or more and heart rate at least 10 bpm above baseline | Act; Critical from 39.5 °C |
| Low blood oxygen with raised cabin CO₂ | Both indicators are off at the same time | The worse of the two |
| Symptoms may come from the cabin air | Cabin CO₂ is raised and sleep or mood is down | At least Watch |
| Sleep loss together with falling mood | Both are down | Watch, or Act when severe |
| Cardiovascular deconditioning | Exercise is low and heart rate has drifted up for 7 days or more, with no recent fever and no racing heart in the last two weeks | The worse of the two |

A pattern replaces the single findings it explains, unless a single finding is more urgent than the pattern.

---

## 6. The simulated mission

One crew member, 14 pre-flight days for the baseline, then 180 mission days. The data is repeatable: the same seed always gives the same mission.

### Scripted events

| Days | Event | What the app shows |
|---|---|---|
| 28 to 46 | Heavy workload with shifted sleep | Sleep loss with falling mood, Watch from day 34, Act from day 38 |
| 36 to 44 | CO₂ scrubber degrades | "Symptoms may come from the cabin air" |
| 54 to 58 | Life-support fault: the scrubber fails | Act on day 54, **Critical on days 55 to 57**, "low blood oxygen with raised cabin CO₂" |
| 70 to 77 | Infection with fever | Possible infection, Act from day 71 |
| 86 to 90 | Blood pressure not measured | "Measurements due" on days 89 and 90 |
| 97 | Heart attack | **Critical**, "possible heart attack"; recovery shows as Act until day 105 |
| 105 to 140 | Exercise device out of service | Exercise below target, deconditioning pattern from day 124 |
| 153 | Missed meal before the morning test | Low blood sugar, Act |
| 168 | Second heart attack | **Critical**; recovery shows as Act until day 175 |

The mission shows two kinds of Critical on purpose: one where the cabin is the cause and one where the body is.

### Status of every day

| Days | Status |
|---|---|
| 1 to 33 | Nominal |
| 34 to 37 | Watch |
| 38 to 47 | Act |
| 48 | Watch |
| 49 to 53 | Nominal |
| 54 | Act |
| 55 to 57 | Critical (life-support fault) |
| 58 to 61 | Act |
| 62 to 63 | Watch |
| 64 to 69 | Nominal |
| 70 | Watch |
| 71 to 79 | Act |
| 80 to 82 | Watch |
| 83 to 96 | Nominal (89 and 90: measurements due) |
| 97 | Critical (heart attack) |
| 98 to 105 | Act |
| 106 to 112 | Watch |
| 113 to 140 | Act |
| 141 to 145 | Watch |
| 146 to 152 | Nominal |
| 153 to 155 | Act |
| 156 to 167 | Nominal |
| 168 | Critical (heart attack) |
| 169 to 175 | Act |
| 176 to 178 | Watch |
| 179 to 180 | Nominal |

### Best days for a demo

| Day | Shows |
|---|---|
| 20 | A calm, all-nominal day |
| 42 | Two patterns at once: the cabin air behind poor sleep |
| 56 | Critical from the cabin: the lungs turn red, the app blames the air and not the astronaut |
| 74 | Infection: immune system and heart light up on the body map |
| 90 | "Measurements due" instead of a false green |
| 97 | Critical from the body: possible heart attack, with the alarm on the vital signs monitor |
| 130 | Deconditioning: heart and bones light up |
| 153 | A single acute value: low blood sugar |

Open a day directly with `?day=56` at the end of the address.

---

## 7. Changes made in the review

| # | Problem found | Fix | Commit |
|---|---|---|---|
| 1 | The highest level, Critical, never appeared in 180 days | A life-support fault and a new pattern "low blood oxygen with raised cabin CO₂" | `75fbc4e` |
| 2 | "Deconditioning" fired on days 78 to 80, which was only the tail of the infection | The pattern stays off while a fever is recent | `75fbc4e` |
| 3 | Day 90 showed a green "All nominal" although blood pressure was 5 days old | A neutral "Measurements due" state on the banner | `6482c60` |
| 4 | About 15 healthy days showed a one-day alert from random variation alone | Less variation in simulated blood pressure, blood sugar and sleep | `75fbc4e` |
| 5 | Every NASA risk linked to the same list page; cabin CO₂ had no risk | Each risk opens NASA's own page; cabin CO₂ cites its Human System Risk | `75fbc4e` |
| 6 | `test` and `Phase-1` had drifted apart | The redesign was merged into `test`, conflicts resolved | `4015c1f` |
| 7 | The new heart attack on day 168 landed on the life-support fault | The fault moved to days 54 to 58; second merge of `Phase-1` | `446a616` |
| 8 | In the week after a heart attack the app reported "deconditioning" and advised to restore exercise | That pattern stays off for two weeks after a racing heart | `446a616` |
| 9 | A damaged data file made the whole app fail with an error page | The file is set aside and the app carries on; the store has its own tests | `f25ced7` |
| 10 | No protective response headers; the server announced its framework | Three security headers added, the framework header removed | `f25ced7` |
| 11 | A failure showed the framework's default error screen | An error page that says what to do and offers a retry | `f25ced7` |
| 12 | White text on the blue buttons failed the contrast check (3.6 to 1) | A darker button blue (4.9 to 1) | `f25ced7` |
| 13 | Nothing checked pushes automatically | A workflow runs type check, tests and build on every push | `f25ced7` |

Tests grew from 31 to 51. New tests cover the new patterns, the fever and heart rules, the Critical days, the risk links and the data store.

### Deliberately left alone

- **Tails after events.** The days right after an event still show alerts (for example 58 to 63 and 154 to 155) because the last reading and the 7-day averages lag behind. It reads as recovery, which is honest.
- **A few stray Watch findings** from blood pressure readings of 120 and 121 against the 120 limit. Removing them would mean fitting the noise to one seed.
- **Thresholds.** No range or band was changed.

---

## 8. What was checked and what was not

### Checked

- All unit tests, the type check and the production build.
- The app in a real browser on days 20, 56, 90, 97, 104, 153, 168 and 175 after the last merge, and more days before it.
- Logging a value: bad input is rejected, good input is saved, survives a reload, and the reset button removes it.
- Time-lapse, and no sideways scrolling at phone width.
- Every one of the 180 days, counted by status.
- An automated accessibility scan (WCAG A and AA rules) on a calm day and on a Critical day.
- A damaged data file and a file with invalid rows: the app keeps running in both cases.
- The response headers of the running server.

### Not checked

| Item | Why | What to do |
|---|---|---|
| NASA links | nasa.gov cannot be reached from the review session. The addresses come from search results | Click every link once before the pitch |
| Docker image | Docker does not run in the review session. The same self-contained server did start and work | Run `docker compose up --build` once on a laptop |
| The check workflow | It was added but has not run yet at the time of writing | Look at the Actions tab after the next push |
| Screen readers and real keyboards | Only the automated scan was run | Tab through the app once and try a screen reader |
| NASA and NOAA data services | Not reachable from the review session | Test before building anything on them |
| Real devices | No hardware was involved | Only matters if Bluetooth devices are added |

---

## 9. Known limits and open decisions

### Limits

- **One crew member, no login.** If the app is hosted publicly, anyone with the link can add or wipe readings. Fine for a local demo.
- **Storage is a JSON file.** Good for one container on one machine. Static hosts cannot run it, and serverless hosts lose the data.
- **Sensor data is simulated.** Only manual entry is real.
- **Thresholds are demo values**, not flight rules and not medical advice.
- **Radiation is missing.** It is the only one of the five hazards without an indicator, and the hazard row shows it as "Not monitored yet". Judges will see that.
- **Eyes, balance and kidneys have no indicator.** The body systems are explained on the map and drawn as dashed outlines.
- **The vital signs traces are drawn, not measured.** The app says so on screen. Say it in the pitch too.

### What real flight use would still need

A hackathon prototype cannot be a flight product, and saying so plainly is a strength in front of NASA judges. This is the honest distance:

| Area | What is missing |
|---|---|
| Medical validity | Thresholds and patterns signed off by flight surgeons, tested against real astronaut data, with known false alarm and miss rates |
| Clinical safety | A hazard analysis of wrong advice. Example: the heart attack text names a drug and a dose, which needs medical review |
| Software assurance | NASA has its own software engineering and safety requirements for crewed missions; none of that process was followed here |
| Identity and privacy | Accounts, roles (crew member, medical officer, surgeon), an audit trail, encryption of stored health data |
| Data | A real database with backups and a migration path, instead of one JSON file |
| Devices | Tested connections to real sensors, with handling for dropouts and bad readings |
| Offline and delay | Proven behaviour with no link to Earth, and a sync that copes with minutes of delay |
| Testing | End-to-end tests of the screens, usability tests with gloves and in poor light, tests on the actual hardware |
| Accessibility | A manual audit on top of the automated scan |

What the prototype can honestly claim today: the logic is transparent and tested, every number names its source, the app does not overstate what it knows, and it stays up when its data file is damaged.

### Decisions the team still has to make

| Decision | Recommendation |
|---|---|
| License | Add one before submitting. MIT is the simplest choice |
| Hosting | Record the demo locally. Use a host that runs Docker with a disk only if judges need a live link |
| Database | Skip it. One crew member with a JSON file is enough for a hackathon |
| Hardware | Only build Bluetooth input if a chest strap or cuff is in the room |
| Which branch is the final one | Pick one and merge everything into it before the last day |

---

## 10. NASA sources used in the app

### Hazard pages

| Hazard | Page |
|---|---|
| Overview | <https://www.nasa.gov/hrp/hazards/> |
| Space radiation | <https://www.nasa.gov/hrp/hazard-space-radiation/> |
| Isolation and confinement | <https://www.nasa.gov/hrp/hazard-isolation-and-confinement/> |
| Distance from Earth | <https://www.nasa.gov/hrp/hazard-distance-from-earth/> |
| Gravity fields | <https://www.nasa.gov/hrp/hazard-gravity-fields/> |
| Hostile/closed environments | <https://www.nasa.gov/hrp/hazard-hostile-closed-environments/> |

### Risk pages

All of these were found through search results that showed the page title and address. None was opened directly.

| Risk name in the app | Page | Status |
|---|---|---|
| Risk of Cardiovascular Adaptations | <https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/> | Title matches |
| Risk of Inadequate Food and Nutrition | <https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/> | Title matches |
| Risk of Hypoxia | <https://www.nasa.gov/reference/risk-of-hypoxia/> | Title matches |
| Risk of Behavioral Changes and Psychiatric Disorders | <https://www.nasa.gov/reference/risk-of-behavioral-changes-and-psychiatric-disorders/> | Wording matches; NASA writes it in lower case |
| Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness | <https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/> | Address matches; title not seen |
| Risk of Spaceflight-Induced Bone Changes | <https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/> | Address matches; title not seen |
| Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS) | <https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/> | Title matches |
| Risk from Inadequate Sleep and Irregular Schedules | <https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/> | Title matches; note "from", not "of" |
| Risk of Altered Immune System Responses | <https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/> | Title matches |
| Risk of Acute and Chronic Carbon Dioxide Exposure | <https://www.nasa.gov/directorates/esdmd/hhp/risk-of-acute-and-chronic-carbon-dioxide-exposure/> | A Human System Risk, not part of the Human Research Program list |

For radiation, when an indicator is added: NASA's short public name is "Risk of radiation-induced cancers" at <https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/>. The formal name is "Risk of Radiation Carcinogenesis".

### Other references named in the app

- ACC/AHA 2017 blood pressure categories
- American Diabetes Association fasting glucose ranges
- American Academy of Sleep Medicine sleep recommendation
- Stahn et al., *Scientific Reports*, 2017: core body temperature in long-duration spaceflight
- Barger et al., *Lancet Neurology*, 2014: sleep on the ISS
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), Canadian Space Agency

---

## 11. Roadmap for the remaining time

Assumption: a 48-hour hackathon with roughly 40 hours left when this was written. Adjust the budget to the real deadline.

| Priority | What | Why | Rough effort |
|---|---|---|---|
| 1 | Radiation indicator | Closes the fifth hazard; today the hazard row shows a gap | 3 h |
| 2 | Reaction Self-Test | A real measurement without hardware that a judge can try | 5 h |
| 3 | Mission switch (ISS, Moon, Mars) with signal delay | Makes "distance from Earth" visible and changes the Critical wording | 3 h |
| 4 | Light-time ledger | Shows the core idea instead of asserting it | 6 to 9 h |
| 5 | Storm shelter drill | Real NASA data that leads to a crew action | 6 to 10 h |
| 6 | Evidence footnotes on the simulated events | The cheapest way to raise validity | 4 to 6 h |
| 7 | Polish, video and project page | A weak video loses a strong project | 8 h |

### Rules for the schedule

- **Freeze features 6 hours before the deadline.** After that only fix, record and write.
- **Reserve the last 6 hours** for the video, the project page and the submission.
- **If you fall behind, cut from the bottom of the list**, never from the video.
- **Keep the demo days working.** After every change, open days 42, 56, 74, 90, 97, 130 and 153.

### Stretch goals

Only start these when rows 1 to 5 work: gamification (streaks for completed check-ins), a vision self-test for the eyes, step-by-step guidance per finding, webcam pulse, Bluetooth devices.

---

## 12. Ideas beyond a dashboard

Most teams will build a vitals dashboard with a body figure. Demify can stand out by showing the gap between the crew and Earth: what the crew can decide alone, what Earth knows, and how old that knowledge is.

Each idea states its basis. "Sourced" means a source was found for the underlying fact. "Own idea" means the feature itself is an inference. Efforts are for one developer.

### Interaction

**1. Fit for today's task**
- **What:** The tool answers "am I fit for today's spacewalk, docking or rover drive?" with go or no-go.
- **Why different:** Others show health status; this ties it to a decision on the mission timeline.
- **Basis:** Sourced: the ISS Reaction Self-Test gives performance feedback. Mapping indicators to tasks is an own idea.
- **Build:** A task list with required capacities, checked by the existing rule engine. 5 to 7 h.
- **Demo:** "Spacewalk at 14:00: no-go. 4.8 h sleep and reaction time 18% slower."
- **Risk:** The task thresholds are invented. Label them illustrative.

**2. The shrinking Earth**
- **What:** The home screen shows Earth at its true apparent size for the mission day, with the signal time under it.
- **Why different:** An emotional picture of distance, not a settings menu.
- **Basis:** Sourced: a published proposal of an "Earth-disconnect" stressor. The phenomenon is untested.
- **Build:** Distance from a lookup table, apparent size and light-time computed from it, one SVG. 3 to 5 h.
- **Demo:** The opening shot of the video: a blue marble shrinks to a single dot.
- **Risk:** It is decoration unless it changes what the tool does.

### Measurement without hardware

**3. Reaction Self-Test in the browser**
- **What:** A 3-minute tap test judged against the crew member's own baseline.
- **Why different:** A real measurement, copied from a tool that is used on the ISS.
- **Basis:** Sourced.
- **Build:** Random waits of 2 to 5 seconds, precise timing, the mean of the slowest tenth, and a count of lapses. 4 to 6 h.
- **Demo:** Very strong. A judge taps for 30 seconds and gets a result.
- **Risk:** Browser and screen add tens of milliseconds. Compare only against the baseline from the same device.

**4. Landing-day hands test**
- **What:** Four touch tasks (point, drag, trace, pinch-rotate), prompted in the first week after a gravity change.
- **Why different:** It uses the gravity hazard and switches on with the mission phase.
- **Basis:** Sourced: an ISS experiment with tablet tasks found decrements only at gravity transitions.
- **Build:** Canvas and pointer events, scoring time and path error. 6 to 8 h.
- **Demo:** Good on a tablet, weak with a mouse.
- **Risk:** The study had seven astronauts, and on Earth nobody will show a deficit.

**5. The log is the sensor**
- **What:** The daily journal entry doubles as a measurement through typing rhythm.
- **Why different:** It costs the crew no extra time.
- **Basis:** Sourced: small studies on typing and fatigue. Combining it with a journal is an own idea.
- **Build:** Key timings while typing. 2 to 4 h.
- **Demo:** Moderate. Passive sensing is invisible unless a live trace is shown.
- **Risk:** Weak validity and high privacy sensitivity.

### The crew as a group

**6. Crew pulse and detachment index**
- **What:** A crew-level view of aggregates, plus one sign nobody else will have: how much the crew still tells Earth.
- **Why different:** The unit is the crew, and falling contact with the ground counts as a health sign.
- **Basis:** Sourced: in long isolation studies, crews told mission control less over time. The index is an own idea.
- **Build:** Simulated crew, messages counted per week, a trend line. 8 to 10 h.
- **Demo:** In the time-lapse, the line to Earth gets thinner.
- **Risk:** Needs several simulated users. In a small crew, "anonymous" totals are easy to trace back.

**7. Sealed until I share**
- **What:** Every reading starts private. The crew member opens it to the medical officer or the ground.
- **Why different:** Every other dashboard assumes that data flows to the ground.
- **Basis:** Sourced: astronauts are reported to hold back symptoms for fear of losing flight status. The mechanism is an own idea.
- **Build:** A visibility field per reading, a share action and a log. 4 to 6 h.
- **Demo:** A quiet, memorable moment: "Only you can see this. Share it?"
- **Risk:** It conflicts with safety when a Critical finding stays sealed. State a rule, for example that Critical always reaches the medical officer.

### Delay and autonomy

**8. Light-time ledger**
- **What:** Every escalation shows when it was sent, the earliest moment an answer can arrive, and what to do in the meantime. A side panel shows what Earth knows right now, which is minutes old.
- **Why different:** It makes the core idea visible.
- **Basis:** Sourced: NASA communication protocols for delay log send time and earliest reply time. The "what Earth knows" panel is an own idea.
- **Build:** A message queue with delivery times, a countdown and an interim action per pattern. 6 to 9 h.
- **Demo:** Very strong. The signal crawls toward Earth while the values change.
- **Risk:** Needs a sped-up clock for a 30-second video.

**9. Overrule the medic**
- **What:** Every recommendation shows its evidence. The crew can overrule it with a logged reason.
- **Why different:** It admits that the medic can be wrong, which is more credible than an "AI doctor".
- **Basis:** Sourced: NASA's own assistant prototype scored between 74% and 88% in simulated cases.
- **Build:** A "why" panel from the rule engine, an override dialog and a log. 4 to 6 h.
- **Demo:** Moderate on stage, strong for validity.
- **Risk:** Little to see in a video.

### Real NASA data

**10. Storm shelter drill**
- **What:** A real past solar storm triggers the shelter procedure with a build timer, a stay timer and a dose bar.
- **Why different:** Real NASA data drives a crew action, not a decorative chart.
- **Basis:** Sourced: Orion crews build a shelter from stowage bags within about an hour.
- **Build:** A server route for the space weather data, a replay of one past event, the timers. 6 to 10 h.
- **Demo:** Strong. "This event really happened on this date."
- **Risk:** What is measured near Earth is not what a ship near Mars would see, and dose cannot honestly be derived from the public flux data. Label the dose bar illustrative, and keep a saved copy of the event in case the service is down.

**11. Evidence-scripted mission**
- **What:** Each event in the 180-day simulation gets a footnote to a real study.
- **Why different:** The time-lapse becomes a documented story.
- **Basis:** Sourced: Mars-500 and ISS sleep findings.
- **Build:** A scenario file with dated events and source links, shown as captions. 4 to 6 h.
- **Demo:** "Day 120, as observed in Mars-500: the crew moves less."
- **Risk:** Isolation studies have tiny crews. Say "as observed in", not "will happen".

**12. The dwindling pharmacy**
- **What:** The medical kit is tracked like a health indicator, and recommendations depend on what is left.
- **Why different:** Nobody else will model the limits of treatment.
- **Basis:** Sourced: NASA models map medical conditions to resources. The feature is an own idea.
- **Build:** A small inventory, use per recommendation, a days-of-supply estimate. 5 to 7 h.
- **Demo:** "At this rate, sleep medication runs out on day 410 of 900."
- **Risk:** The kit contents are invented.

### Recommended four

| Rank | Idea | Why |
|---|---|---|
| 1 | Reaction Self-Test (3) | Real tool, real measurement, a judge can try it |
| 2 | Light-time ledger with the shrinking Earth as its opening picture (8 and 2) | Turns the core idea into something people watch |
| 3 | Storm shelter drill (10) | Covers radiation with real NASA data and an action |
| 4 | Evidence-scripted mission (11) | Cheapest gain in validity, and it gives the video its story |

Together about 29 hours. If time is left, add "Sealed until I share" (7).

### Avoid

- **Reading mood or stress from voice or face.** The studies are small, it will be unreliable in a noisy hall, and judges will raise privacy.
- **An open "AI doctor" chat.** Many teams will have one, and it cannot be defended medically.
- **Webcam pulse without caveats.** It loses accuracy at high heart rates and is biased against darker skin. If it is built, state the limits on screen.

---

## 13. Research facts worth quoting

All of these come from search-result summaries, not from reading the full papers. Check a number against its source before it goes on a slide.

| Topic | Finding |
|---|---|
| Reaction test | ISS crews run a 3-minute test that tells them when they fall below their own range |
| Sleep | ISS crews averaged about 6 h against 8.5 h scheduled |
| Fine motor skills | An ISS tablet experiment found decrements only at gravity transitions |
| Medical autonomy | NASA plans a gradual handover of medical decisions from the ground to the crew |
| Software guidance | Untrained ISS crew captured useful ultrasound images with software guidance alone |
| Medical assistant prototype | Scored about 88%, 80% and 74% on three simulated cases, so it is wrong reasonably often |
| Crew medical officer | Need not be a physician; training is reported as roughly 15 to 40 hours |
| Under-reporting | Astronauts are reported as reluctant to report symptoms for fear of losing flight status |
| Communication delay | A 50-second delay on the ISS already lowered mood and caused frustration |
| Mars delay | Up to about 22 minutes one way; around two weeks without contact when the Sun is in between |
| Detachment | In long isolation studies, crews told mission control less and less over time |
| Third-quarter effect | The evidence is mixed. Do not state it as fact |
| Radiation shelter | Orion crews build a shelter from stowage bags within about an hour after an alarm |
| Radiation dose | The cruise to Mars measured about 1.8 mSv a day; NASA's career limit is 600 mSv |

---

## 14. Pitch and demo tips

### The story in one breath

"On the way to Mars, a question to the doctor takes 20 minutes to arrive and 20 minutes to come back. Demify is the medic that stays on board: it knows your own normal, sees connections between values, and tells you what to do now."

### A 30-second video

| Seconds | Picture | Line |
|---|---|---|
| 0 to 5 | Earth shrinks to a dot, or the timeline plays | "Day 56 on the way to Mars." |
| 5 to 12 | Banner turns Critical, lungs turn red on the body map | "Blood oxygen falls while cabin CO₂ climbs." |
| 12 to 20 | The finding and its action | "Demify sees the cause: the cabin air, not the astronaut." |
| 20 to 26 | Day 42 or 74 in fast cuts | "It knows your own baseline and reads values together." |
| 26 to 30 | Logo and the five hazards row | "Demify. The medic that stays on board." |

### A live demo in two minutes

1. **Day 20:** all nominal. Point at the body map and the timeline.
2. **Play the time-lapse** to about day 42 and pause. Two patterns: the app blames the cabin air for poor sleep.
3. **Day 56:** Critical. The app says the cabin air is failing, not the astronaut. Read the action aloud.
4. **Day 90:** the app refuses to say "nominal" because blood pressure is out of date.
5. **Day 97:** Critical again, this time from the body: possible heart attack.
6. **Day 153:** log a new blood sugar value by hand and watch the status change.

### What judges usually score

Space Apps projects are usually judged on impact, creativity, validity, relevance and presentation. Check this year's criteria on the event page.

| Criterion | Where Demify answers it |
|---|---|
| Impact | Self-assessment when Earth cannot answer in time |
| Creativity | Personal baseline, patterns that name the cause, "Measurements due" instead of a false green |
| Validity | Every indicator names its reference and its NASA hazard and risk; thresholds are labelled as demo values |
| Relevance | All points of the challenge text: indicators, guidance, clickable figure, charts, colour coding, prompts to measure |
| Presentation | The timeline and body map tell the story without explanation |

### Questions to prepare for

| Question | Honest answer |
|---|---|
| Are the thresholds medically valid? | They are general clinical ranges used as demo defaults, not flight rules |
| Is the data real? | The mission is simulated; manual entry is real |
| Why no radiation? | Say what is planned, or build the indicator first |
| Is this an AI doctor? | No. It is a transparent rule engine, and every finding shows why it fired |
| What about privacy? | One crew member's data stays on the on-board computer |
| How would real sensors connect? | Readings are plain records with a source field, so a device feed can be added next to manual entry |

### Small things that matter

- Say "not a medical device" once, clearly.
- Do not call the vital signs traces a live signal.
- Use a large font and zoom in for anything shown on a projector.
- Record the video early, then re-record if time allows. Never leave it for the last hour.
- Have a second laptop or a recorded run ready in case the live demo fails.

---

## 15. Submission checklist

Check the exact requirements on this year's event page; the list below is what Space Apps usually asks for.

- [ ] Project page with name, summary and how it addresses the challenge
- [ ] Link to the public repository
- [ ] Demo: a short video or slides, within the stated length
- [ ] A statement of how AI tools were used
- [ ] The NASA and partner data and resources that were used, with links
- [ ] A LICENSE file in the repository
- [ ] README that explains how to run the project
- [ ] All work merged into one branch, and that branch is the default one
- [ ] Every NASA link clicked once
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass on that branch
- [ ] The Docker image builds and starts once
- [ ] No secrets or personal data in the repository

---

## 16. Working tips

### Two sessions, two branches

Another session pushes to `Phase-1` while the fixes live on `test`. To avoid losing work:

- Decide which branch is the trunk and say so in the team.
- Merge often. Small merges conflict less than one big merge at the end. The two merges so far hit 2 and then 7 conflicting files.
- After each merge, run the three checks and open the demo days.
- Do not let two people or sessions edit the same file at the same time. The files most likely to collide are `src/ui/Dashboard.tsx`, `src/ui/TriageBanner.tsx`, `src/domain/engine.ts` and `src/domain/metrics.ts`.

### Where new things go

| Adding | Touch these files |
|---|---|
| A new indicator | `types.ts` (the id), `metrics.ts` (ranges and texts), `simulator.ts` (profile), `bodyRegions.ts` (its body system), `tiles.ts` (its tile) |
| A new pattern | `patternFindings` in `engine.ts`, plus a test in `engine.test.ts` |
| A new scripted event | `scenarioOffset` in `simulator.ts`, plus a test in `simulator.test.ts` |
| A new NASA risk link | `RISK_PAGES` in `hazards.ts`; a test fails if a cited risk has no page |
| A new screen section | A component in `src/ui`, placed in `Dashboard.tsx` |

A test checks that every indicator belongs to exactly one body system, so a new indicator without a body system fails the test run.

### Keeping the science honest

- Give every number a source, on screen, next to the number.
- Separate three things clearly: what is measured, what is simulated, what is illustration.
- When a claim is weak, say "as observed in" and name the study.
- Prefer "points to" and "possible" over a diagnosis. The app already does this.

### Keeping the demo safe

- The simulation is repeatable, so the demo days never change by themselves. They only change when someone edits the simulator or the thresholds.
- Manual readings are saved on the server. Use the reset button in the footer before a demo so old test entries do not change the picture.
- Test the time-lapse on the machine and screen that will be used on stage.

---

## 17. Sources

### Challenge resources

- [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/), NASA Human Research Program
- [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), NASA Human Research Program
- [Ongoing HRP Research in Space](https://www.nasa.gov/hrp/ongoing-hrp-research/), NASA
- [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), Canadian Space Agency
- [Why Do We Conduct Science Experiments in Space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp), Canadian Space Agency
- [NASA Open Science Data Repository](https://osdr.nasa.gov/bio/repo/search?q=&data_source=cgene,alsda,esa&data_type=study)

### Self-monitoring and tests

- [Reaction Self-Test on the ISS](https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197)
- [NASA psychomotor vigilance test project](https://human-factors.arc.nasa.gov/groups/fatigue/projects/pvt.php)
- [Fine Motor Skills experiment](https://www.pubmed.gov/35609944/)
- [Sleep on the ISS, Barger et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436)
- [Astroskin, Canadian Space Agency](https://www.csa-asc.gc.ca/eng/sciences/astroskin.asp)

### Medical autonomy and trust

- [Earth-independent medical operations concept](https://ntrs.nasa.gov/api/citations/20240001402/downloads/2024_IWS_EIMO_ConOps_FINAL.pdf)
- [NASA and Google medical assistant test](https://cloud.google.com/blog/topics/public-sector/how-google-and-nasa-are-testing-ai-for-medical-care-in-space)
- [Crew medical officer role](https://ntrs.nasa.gov/api/citations/20230013415/downloads/IWS_CMO.pdf)
- [Safe Passage, National Academies](https://www.nationalacademies.org/read/10218/chapter/8)

### Communication delay and isolation

- [NASA communication delay protocols](https://ntrs.nasa.gov/api/citations/20250000703/downloads/2025%20HRP%20IWS%20Comm%20Delay.pdf)
- [Communication delay on the ISS](https://www.pubmed.gov/27779953/)
- [Delays, disruptions and blackouts for crewed Mars missions](https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf)
- [Crew communication in the SIRIUS isolation study](https://www.frontiersin.org/news/2021/11/09/isolation-mars-communication-sirius-russia)
- [Mars-500 sleep and activity study](https://www.med.upenn.edu/uep/assets/user-content/documents/PNAS2013Basner1212646110withSupportingAppendix.pdf)

### Radiation and data

- [DONKI space weather database](https://ccmc.gsfc.nasa.gov/tools/DONKI)
- [GOES proton flux, NOAA](https://www.spaceweather.gov/products/goes-proton-flux)
- [RadLab data API](https://visualization.osdr.nasa.gov/radlab/gui/data-api)
- [Orion radiation shelter plan](https://www.nasa.gov/missions/artemis/orion/scientists-and-engineers-evaluate-orion-radiation-protection-plan/)
- [Radiation exposure on a trip to Mars](https://www.swri.org/newsroom/press-releases/swri-led-team-calculates-the-radiation-exposure-associated-trip-mars)
- [NASA radiation protection technical brief](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf)

### Webcam pulse limits

- [Accuracy of webcam pulse at high heart rates](https://www.news-medical.net/news/20251209/Accuracy-of-remote-photoplethysmography-drops-sharply-at-elevated-heart-rates.aspx)
