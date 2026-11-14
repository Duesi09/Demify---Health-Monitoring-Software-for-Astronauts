# Health knowledge base: sources and rationale

The thresholds, actions and escalation rules live in
`src/lib/health/knowledge.ts`. This file explains where they come from.

Every value carries one of these source tags:
- **NASA**: a NASA or CSA primary source.
- **CLIN**: a standard clinical range, used where NASA publishes nothing specific.
- **APP**: a band derived for this app. It is not an official limit, and the UI says so.

Some rules are ours even on a NASA or CLIN indicator: the persistence rules,
the trend rules, the personal-baseline rule and a few limits noted below. This
file marks each of them as a **project rule**, and the app labels them App or
"project rule".

> Research prototype, not a certified medical device. The ranges below show
> how published and project-defined thresholds would flag values in a
> research and training simulation; see the intended purpose in the
> [README](../../README.md#intended-purpose). Training: in a real mission an
> escalation prompts a call to the flight surgeon.

## The five hazards (NASA HRP, "RIDGE")

| Hazard | Main effects |
|---|---|
| **R**adiation | Cancer risk, effects on the central nervous system and cognition, degenerative disease of the heart, blood vessels and eyes. A solar particle event (SPE) can cause acute effects. Neutrons make up about 30 % of the dose on the ISS (CSA). |
| **I**solation & confinement | Sleep loss, disrupted circadian rhythm, anxiety and depression, conflict within the crew |
| **D**istance from Earth | About 3 to 22 minutes one-way signal delay to Mars, depending on planetary positions, so the crew must be medically self-sufficient |
| **G**ravity fields | Bone loss of 1–1.5 %/month, loss of muscle and fitness, SANS (eye changes from fluid shift), orthostatic intolerance (fainting after return to gravity), kidney stones |
| Hostile closed **E**nvironment | CO₂, microbes, immune changes, noise and light |

## Radiation limits (NASA-STD-3001 Vol 1 Rev C)

| Limit | Value |
|---|---|
| Career effective dose [V1 4030] | < 600 mSv (keeps the risk of cancer death from exposure below 3 %) |
| Per SPE, design value [V1 4031] | < 250 mSv |
| GCR dose rate in habitats used > 60 days [V1 4033] | < 1.3 mSv/day in free space; < 0.9 mSv/day on a surface |
| Blood-forming organs | 250 mGy-Eq per 30 days; 500 mGy-Eq per year |
| Lens of the eye | 1,000 / 2,000 / 4,000 mGy-Eq (30 days / 1 year / career) |

Typical dose rates: ISS about 0.3–0.8 mSv/day, lunar surface about 1.4
(Chang'e-4: 1,369 µSv/day dose equivalent, Zhang et al. 2020, Sci. Adv. 6,
eaaz1334; the Artemis (Lunar) profile uses 1.4), Mars cruise about 1.8, Mars
surface about 0.64. A storm shelter needs about 10 cm of
water-equivalent material. Shielding cuts SPE dose by about 50 % but GCR dose
by only about 7 %.

**Dose-rate estimate in the app** (`estimateDoseRate`). This is a heuristic and
must not be used as a dosimeter:
- It starts from the mission's GCR baseline.
- It adds 0.01 mSv/day for each pfu of ≥10 MeV proton flux above background.
- In low Earth orbit that addition is scaled down to 5 %, because the magnetosphere deflects most solar protons.

## Indicator sources

| Indicator | Source tag | Key sources |
|---|---|---|
| Heart rate | CLIN | AHA; NASA HRP cardiovascular risk; OCHMO-TB-019. The escalation limits < 40 and > 130 bpm are a project rule, close to the NEWS2 3-point bands (≤ 40 and ≥ 131 bpm) |
| ST segment deviation (ECG) | CLIN | Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF 2018): new ST elevation ≥ 1 mm is the STEMI criterion; NASA HRP cardiovascular risk; CSA Bio-Monitor (continuous ECG). In leads V2–V3 the UDMI uses higher elevation cut-points: ≥ 2 mm in men aged 40 or older, ≥ 2.5 mm in men under 40, ≥ 1.5 mm in women of any age. The app reads a single ST value, not two contiguous leads, and applies the 1 mm cut-point to it; rating > 2 mm depression critical is a project rule |
| Blood pressure | CLIN | AHA categories: 130–139 / 80–89 mmHg (stage 1) and 140–180 / 90–120 mmHg (stage 2) are caution with a re-check in 15 minutes (the 15 minutes are a project rule); above 180 / 120 mmHg (AHA hypertensive crisis) escalates. Below 80 / 40 mmHg also escalates; that low limit is a project rule. In-flight BP runs about 8–10 mmHg lower (Norsk 2015) |
| SpO₂ | CLIN | MedlinePlus; NASA hypoxia risk; CSA Bio-Monitor |
| Temperature | CLIN | NEWS2 bands: 36.1–38.0 °C nominal (0 points), 35.1–36.0 or 38.1–39.0 °C caution (1 point), ≤ 35.0 °C (3 points) or ≥ 39.1 °C (2 points) critical; rating ≥ 39.1 °C critical and escalating on it are project rules (NEWS2 gives 2 points there, not 3). Core temperature rises about 1 °C in flight (Stahn 2017) |
| Respiratory rate | CLIN | NEWS2; OCHMO-TB-004 (CO₂); CSA Bio-Monitor |
| Glucose | CLIN | ADA hypoglycaemia levels 1 and 2 |
| Sleep | NASA | OCHMO-TB-041: an 8.5 h sleep period; < 6 h for 7 days is equivalent to 24–36 h without sleep |
| Mood / stress | APP | OCHMO-TB-016; NASA HRP behavioural risk |
| Radiation | NASA / APP | NASA-STD-3001; OCHMO-TB-020; CSA radiation monitoring; NOAA S-scale for storms |
| Bone loss | APP | NASA HRP bone risk; OCHMO-MTB-013; BMD must stay ≥ 95 % of pre-flight |
| Body mass | APP | OCHMO-TB-013; ISS crews typically lose 2–5 % |
| Hydration | NASA | OCHMO-TB-027: ≥ 2.5 L/day |
| WBC | CLIN | MedlinePlus; NASA HRP immune risk |
| Cabin CO₂ | NASA | NASA-STD-3001 Vol. 2, V2 6004: ≤ 3 mmHg as a 1-hour average, above it escalates (the app treats a single reading as a breach); OCHMO-TB-004: < 2.5 mmHg (< 3,300 ppm) as the 7-day average target, the nominal band; headache odds roughly double per +1 mmHg (Law 2014, cited in OCHMO-TB-004) |
| Vision (SANS) | APP | OCHMO-MTB-001; signs in about 70 % of crew, clinically significant in 18 % |
| Exercise | NASA | 1.5–2 h/day; VO₂max and strength must stay ≥ 80 % of pre-flight |

## When a value escalates

The critical band alone does **not** escalate: unless one of the rules below
matches, a critical value gets the finding "in the critical band: re-check and
log". An escalation (training: in a real mission this prompts a call to the
flight surgeon) comes only from these explicit rules in `knowledge.ts`:

1. **Escalation limits** (`escalateAbove`, `escalateBelow`): one value strictly
   beyond the limit.
2. **Escalating bands** (`escalateFromBand`): any value in the stated band
   escalates on its own. This applies to the symptom-type indicators (ST
   segment, SpO₂, vision) and to the critical temperature band.
3. **Persistence rules** (`persistence`): the condition holds on several days
   in a row, or for several hours. One value alone never escalates by this
   rule; the finding counts the days or hours so far. All persistence rules
   are project rules.
4. **Solar radiation storm** (`stormAlert`): any current NOAA S1 or higher
   storm.

| Indicator | Escalates when | Basis |
|---|---|---|
| Heart rate | < 40 or > 130 bpm | Project rule, close to the NEWS2 3-point bands (≤ 40 / ≥ 131 bpm) |
| ST segment | Any critical value: elevation ≥ 1 mm or depression > 2 mm (symptom-type) | CLIN (UDMI 1 mm cut-point; UDMI uses higher cut-points in V2–V3, and the app reads a single value); > 2 mm depression is a project rule |
| Blood pressure | Systolic > 180 or < 80 mmHg; diastolic > 120 or < 40 mmHg | CLIN (AHA hypertensive crisis) for > 180 / > 120 mmHg; the < 80 / < 40 mmHg limits are a project rule |
| SpO₂ | Any value ≤ 90 % (symptom-type) | CLIN |
| Temperature | Any critical value: ≤ 35.0 °C or ≥ 39.1 °C; ≥ 38.1 °C persisting 24 h | CLIN for ≤ 35.0 °C (NEWS2 3 points); escalating at ≥ 39.1 °C (NEWS2 2 points) and the 24 h rule are project rules |
| Respiratory rate | > 24 or < 9 /min | CLIN (NEWS2 3-point bands) |
| Glucose | < 54 mg/dL; > 400 mg/dL; > 250 mg/dL on 2 days in a row | CLIN (ADA level 2); the 400 mg/dL ceiling and the 2-day rule are project rules |
| Sleep | < 6 h on 7 days in a row ("sleep debt", also rated critical) | Project rule, based on OCHMO-TB-041 |
| Mood | ≤ 2 on 2 days in a row | Project rule |
| Stress | ≥ 8 on 2 days in a row | Project rule |
| Exercise | < 60 min on 3 days in a row | Project rule |
| Radiation dose rate | > 10 mSv/day; any current S1+ solar radiation storm | APP / project rule |
| Cumulative dose | > 480 mSv (80 % of the NASA 600 mSv career limit) | NASA limit; the 80 % trigger is a project rule |
| Body mass | Loss > 5 % | APP |
| Bone loss | > 1.5 %/month | APP |
| WBC | < 2.0 or > 30 ×10⁹/L | CLIN; > 30 is a project rule |
| Cabin CO₂ | > 3 mmHg | NASA (V2 6004, a 1-hour average limit); Demify does not average, so one reading above 3 mmHg counts as a breach (prototype simplification) |
| Vision | Any new symptom, score ≥ 1 (symptom-type) | APP, based on OCHMO-MTB-001 |
| Hydration | No automatic flag; the crew escalates on symptoms | NASA |

The Guidance page ("When to call the flight surgeon") generates its
"Automatic flag" column from the same fields (`escalationFlags`), so the stated
rules and the code cannot drift apart.

## How the app assesses health (`src/lib/health/assess.ts`)

1. **Continuous signals** (from wearables): for SIMULATED telemetry the app takes the median of the last 60 minutes at rest and skips readings tagged as exercise. A crew entry or DEVICE reading is judged on its latest value. During a drill the current sample is judged, not the median.
2. **Discrete check-ins:** the app uses the most recent value.
3. **Real versus simulated data:** for a continuous vital sign, a crew entry or DEVICE reading overrides SIMULATED telemetry only while it is at most 6 h old (`REAL_CONTINUOUS_MAX_AGE_MS`), so an old spot check cannot hide newer telemetry. For check-in indicators the latest crew entry of the last 7 days wins over SIMULATED values.
4. **Personal baseline (project rule):** a change of 25 % or more from the person's own pre-flight baseline raises a continuous signal to caution, even when the value is still inside the population range. It never escalates. In a 3-year mission, change within one person matters more than population norms.
5. **Trends (project rule):** a mood drop or a stress rise of 2 points or more over 3 days raises the value to caution. It never escalates.
6. **Escalation:** only by the rules in [When a value escalates](#when-a-value-escalates). Persistence rules use one value per UTC day (crew entries and DEVICE readings win over SIMULATED ones) or, for temperature, every reading at rest back to at least 24 h before the current one (1 h slack for check-in timing). Two consecutive temperature readings may be up to 36 h apart (project rule, `PERSIST_MAX_GAP_MS`); a longer gap ends the run. Crew entries and DEVICE readings are judged on their own, SIMULATED telemetry on its own. A storm escalates only on current NOAA data: with an offline snapshot or data older than 3 hours the finding asks the crew to verify with the onboard dosimeters instead.
7. **Body regions:** each body region takes the worst status among its mapped indicators.

## References

- NASA HRP hazards: https://www.nasa.gov/hrp/hazards/
- NASA HRP risks: https://www.nasa.gov/hrp/risks/
- NASA HRP ongoing research: https://www.nasa.gov/hrp/ongoing-hrp-research/
- NASA HRP, Risk of Cardiovascular Adaptations: https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/
- NASA-STD-3001 Vol 1 Rev C: https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf
- NASA-STD-3001 Vol 2 (V2 6004, CO₂): https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-2
- OCHMO technical briefs (radiation, CO₂, SANS, bone, sleep, circadian, water, nutrition, behavioural health, orthostatic intolerance): linked individually in `knowledge.ts`
- CSA, radiation monitoring: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- CSA Bio-Monitor: https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp
- Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF 2018), Circulation: https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617
- RCP NEWS2: https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/
- Literature, checked:
  - Zhang 2020, Science Advances 6(39), eaaz1334, doi:10.1126/sciadv.aaz1334
- Literature. These DOIs were not checked against the publisher; verify them before citing:
  - Zeitlin 2013, Science, doi:10.1126/science.1235989
  - Hassler 2014, Science, doi:10.1126/science.1244797
  - Zwart 2014, Aviation, Space, and Environmental Medicine 85(12):1229
  - Stahn 2017, Scientific Reports, doi:10.1038/s41598-017-15560-w
  - Norsk 2015, Journal of Physiology, doi:10.1113/jphysiol.2014.284869
  - Law 2014, Journal of Occupational and Environmental Medicine 56(5):477, doi:10.1097/JOM.0000000000000158
