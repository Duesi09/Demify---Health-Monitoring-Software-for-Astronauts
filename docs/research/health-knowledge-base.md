# Health knowledge base: sources and rationale

The thresholds, actions and escalation rules live in
`src/lib/health/knowledge.ts`. This file explains where they come from.

Every value carries one of these source tags:
- **NASA**: a NASA or CSA primary source.
- **CLIN**: a standard clinical range, used where NASA publishes nothing specific.
- **APP**: a band derived for this app. It is not an official limit, and the UI says so.

> Demify is decision support, not a medical device. Flight surgeons remain the authority.

## The five hazards (NASA HRP, "RIDGE")

| Hazard | Main effects |
|---|---|
| **R**adiation | Cancer risk, effects on the central nervous system and cognition, degenerative disease of the heart, blood vessels and eyes. A solar particle event (SPE) can cause acute effects. Neutrons make up about 30 % of the dose on the ISS (CSA). |
| **I**solation & confinement | Sleep loss, disrupted circadian rhythm, anxiety and depression, conflict within the crew |
| **D**istance from Earth | Up to a 20 min one-way communication delay to Mars, so the crew must be medically self-sufficient |
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

Typical dose rates: ISS about 0.3–0.8 mSv/day, lunar surface about 1.37, Mars
cruise about 1.8, Mars surface about 0.64. A storm shelter needs about 10 cm of
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
| Heart rate | CLIN | AHA; NASA HRP cardiovascular risk; OCHMO-TB-019 |
| Blood pressure | CLIN | AHA categories; in-flight BP runs about 8–10 mmHg lower (Norsk 2015) |
| SpO₂ | CLIN | MedlinePlus; NASA hypoxia risk |
| Temperature | CLIN | NEWS2; core temperature rises about 1 °C in flight (Stahn 2017) |
| Respiratory rate | CLIN | NEWS2; OCHMO-TB-004 (CO₂) |
| Glucose | CLIN | ADA hypoglycaemia levels 1 and 2 |
| Sleep | NASA | OCHMO-TB-041: an 8.5 h sleep period; < 6 h for 7 days is equivalent to 24–36 h without sleep |
| Mood / stress | APP | OCHMO-TB-016; NASA HRP behavioural risk |
| Radiation | NASA / APP | NASA-STD-3001; OCHMO-TB-020 |
| Bone loss | APP | NASA HRP bone risk; OCHMO-MTB-013; BMD must stay ≥ 95 % of pre-flight |
| Body mass | APP | OCHMO-TB-013; ISS crews typically lose 2–5 % |
| Hydration | NASA | OCHMO-TB-027: ≥ 2.5 L/day |
| WBC | CLIN | MedlinePlus; NASA HRP immune risk |
| Cabin CO₂ | NASA | OCHMO-TB-004 / NASA-STD-3001: ≤ 3 mmHg as a 1-hour average |
| Vision (SANS) | APP | OCHMO-MTB-001; signs in about 70 % of crew, clinically significant in 18 % |
| Exercise | NASA | 1.5–2 h/day; VO₂max and strength must stay ≥ 80 % of pre-flight |

## How the app assesses health (`src/lib/health/assess.ts`)

1. **Continuous signals** (from wearables): the app takes the median of the last 60 minutes at rest and skips readings taken during exercise.
2. **Discrete check-ins:** the app uses the most recent value.
3. **Real versus simulated data:** a manual or sensor reading always overrides a simulated one.
4. **Personal baseline:** a change of 25 % or more from the person's own pre-flight baseline raises a continuous signal to caution, even when the value is still inside the population range. In a 3-year mission, change within one person matters more than population norms.
5. **Escalation:** an escalation is raised when a value is critical or crosses the indicator's escalation limit.
6. **Body regions:** each body region takes the worst status among its mapped indicators.

## References

- NASA HRP hazards: https://www.nasa.gov/hrp/hazards/
- NASA HRP risks: https://www.nasa.gov/hrp/risks/
- NASA HRP ongoing research: https://www.nasa.gov/hrp/ongoing-hrp-research/
- NASA-STD-3001 Vol 1 Rev C: https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf
- OCHMO technical briefs (radiation, CO₂, SANS, bone, sleep, circadian, water, nutrition, behavioural health, orthostatic intolerance): linked individually in `knowledge.ts`
- CSA, radiation monitoring: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- CSA Bio-Monitor: https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp
- Literature. These DOIs were not checked against the publisher; verify them before citing:
  - Zeitlin 2013, Science, doi:10.1126/science.1235989
  - Hassler 2014, Science, doi:10.1126/science.1244797
  - Zhang 2020, Science Advances, doi:10.1126/sciadv.aaz1334
  - Zwart 2014, Aviation, Space, and Environmental Medicine 85(12):1229
  - Stahn 2017, Scientific Reports, doi:10.1038/s41598-017-15560-w
  - Norsk 2015, Journal of Physiology, doi:10.1113/jphysiol.2014.284869
