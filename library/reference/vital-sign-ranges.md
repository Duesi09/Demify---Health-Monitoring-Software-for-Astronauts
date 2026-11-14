---
id: vital-sign-ranges
title: Vital-sign ranges and escalation rules
category: reference
source: Demify health knowledge base, citing the NASA, CSA and clinical sources named per indicator (AHA, ADA, NEWS2, MedlinePlus, NASA-STD-3001, OCHMO technical briefs, NASA HRP)
license: Project text, MIT; the cited sources keep their own terms
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---

# Vital-sign ranges and escalation rules

Training reference. These are the bands Demify uses to rate each health indicator in a research and training simulation, with the rule that makes Demify say "contact the flight surgeon". In a real mission an escalation prompts a call to the flight surgeon; the crew and the flight surgeons make every medical decision.

## How to read the source tags

- NASA: taken from a NASA or CSA primary source (NASA-STD-3001, an OCHMO technical brief or Human Research Program evidence).
- CLIN: a standard clinical range (AHA, ADA, NEWS2, MedlinePlus), used where NASA publishes nothing specific. Spaceflight can shift what is normal for a crew member.
- App: a band derived for this app from the cited sources. It is not an official NASA or clinical limit.
- Project rule: a rule of this project even on a NASA or CLIN indicator (the persistence rules, the trend rules, the personal-baseline rule and a few limits marked as such).

## Critical band versus escalation

The critical band alone does not escalate. Unless an escalation rule matches, a critical value gets the finding "in the critical band: re-check and log". An escalation comes from the explicit rules: an escalation limit (one value strictly beyond it), an escalating band (any value in that band, for the symptom-type indicators ST segment, SpO₂ and vision and for the critical temperature band), a persistence rule (repeated values on several days in a row or for several hours; one value alone never escalates by this rule) or a current NOAA S1 or higher solar radiation storm.

Personal baseline (project rule): a change of 25 % or more from the crew member's own pre-flight baseline raises a continuous signal to caution, even when the value is still inside the population range. It never escalates. Trends (project rule): a mood drop or a stress rise of 2 points or more over 3 days raises the value to caution. It never escalates.

## Blood pressure at a glance

AHA categories: 130–139 / 80–89 mmHg (stage 1) and 140–180 / 90–120 mmHg (stage 2) are caution with a re-check in 15 minutes (the 15 minutes are a project rule). Above 180 / 120 mmHg is the AHA hypertensive crisis: a systolic value above 180 mmHg or a diastolic value above 120 mmHg escalates, so contact the flight surgeon. Below 80 / 40 mmHg also escalates; that low limit is a project rule. Any reading with headache, chest pain, vision change or dizziness is a reason to contact the flight surgeon. In-flight blood pressure runs about 8–10 mmHg lower (Norsk 2015). The hypertensive crisis drill checklist is in "Alarm response drill checklists".

## Resting heart rate

- Source tag: CLIN (general clinical range)
- Nominal: 50–100 bpm (fit crews often rest in the 50s)
- Caution: 40–49 or 101–130 bpm
- Critical: < 40 or > 130 bpm (project rule, close to the NEWS2 3-point bands), or with symptoms
- Automatic escalation flag: < 40 bpm; > 130 bpm
- Contact the flight surgeon when: Below 40 or above 130 bpm at rest (project rule, close to the NEWS2 3-point bands), or chest pain, fainting or palpitations.
- Crew actions: Rest seated for 5 minutes and measure again. Check caffeine, medication and recent exercise. Drink fluids; before landing follow the pre-landing fluid-loading procedure and wear compression garments.
- In spaceflight: Microgravity shifts fluid headward and the heart becomes more spherical; arrhythmia risk rises and orthostatic tachycardia or fainting is common after landing.
- Measured with: CSA Bio-Monitor smart shirt (ECG), ECG kit, CEVIS cycle display.
- Sources: AHA heart rate (https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse); NASA HRP: Risk of Cardiovascular Adaptations (https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/); NASA OCHMO-TB-019 Orthostatic Intolerance (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf); CSA Bio-Monitor (https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)

## Blood pressure, systolic

- Source tag: CLIN (general clinical range)
- Nominal: 90–129 mmHg
- Caution: 80–89 (low), 130–139 (AHA stage 1) or 140–180 (AHA stage 2): re-check in 15 minutes
- Critical: < 80 mmHg (project rule) or > 180 mmHg (AHA hypertensive crisis)
- Automatic escalation flag: < 80 mmHg; > 180 mmHg
- Contact the flight surgeon when: Systolic above 180 mmHg (AHA hypertensive crisis) or below 80 mmHg (project rule), or any reading with headache, chest pain, vision change or dizziness.
- Crew actions: Sit quietly for 5 minutes, arm at heart level, and repeat the measurement. Review salt, fluid and caffeine intake. If low: hydrate and avoid fast posture changes; if high: rest and re-check in 15 minutes.
- In spaceflight: 24-hour blood pressure drops about 8–10 mmHg in flight as fluid redistributes. Low pressure and fainting are typical right after landing.
- Measured with: Automated BP cuff, CSA Bio-Monitor.
- Sources: AHA blood pressure categories (https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings); NASA HRP: Risk of Cardiovascular Adaptations (https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/); NASA OCHMO-TB-019 Orthostatic Intolerance (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf)

## Blood pressure, diastolic

- Source tag: CLIN (general clinical range)
- Nominal: 60–79 mmHg
- Caution: 40–59 (low), 80–89 (AHA stage 1) or 90–120 mmHg (AHA stage 2): re-check in 15 minutes
- Critical: < 40 mmHg (project rule) or > 120 mmHg (AHA hypertensive crisis)
- Automatic escalation flag: < 40 mmHg; > 120 mmHg
- Contact the flight surgeon when: Diastolic above 120 mmHg (AHA hypertensive crisis) or below 40 mmHg (project rule), or any reading with symptoms.
- Crew actions: Repeat the measurement after 5 minutes of rest. Track together with systolic pressure and heart rate.
- In spaceflight: Fluid shifts and reduced plasma volume change vascular tone; diastolic values usually move with systolic.
- Measured with: Automated BP cuff, CSA Bio-Monitor.
- Sources: AHA blood pressure categories (https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings); NASA HRP: Risk of Cardiovascular Adaptations (https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/)

## Blood oxygen saturation (SpO₂)

- Source tag: CLIN (general clinical range)
- Nominal: 95–100 %
- Caution: 91–94 %
- Critical: ≤ 90 %
- Automatic escalation flag: Any value ≤ 90 %
- Contact the flight surgeon when: SpO₂ ≤ 90 % (check the probe first), or shortness of breath.
- Crew actions: Warm the finger and measure again. Check cabin O₂ and CO₂ readings. Rest and breathe slowly.
- In spaceflight: ISS air is at sea-level pressure, but exploration vehicles plan reduced cabin pressure, so mild hypoxia (confusion, headache, poor sleep) becomes possible.
- Measured with: Fingertip pulse oximeter, CSA Bio-Monitor.
- Sources: MedlinePlus pulse oximetry (https://medlineplus.gov/lab-tests/pulse-oximetry/); NASA HRP: Risk of Hypoxia (https://www.nasa.gov/reference/risk-of-hypoxia/); CSA Bio-Monitor (https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)

## Body temperature

- Source tag: CLIN (general clinical range)
- Nominal: 36.1–38.0 °C (NEWS2 0 points)
- Caution: 35.1–36.0 or 38.1–39.0 °C (NEWS2 1 point)
- Critical: ≤ 35.0 °C (NEWS2 3 points) or ≥ 39.1 °C (NEWS2 2 points; rating it critical is our project rule)
- Automatic escalation flag: Any value ≤ 35.0 °C or ≥ 39.1 °C (project rule); ≥ 38.1 °C persisting 24 h
- Contact the flight surgeon when: 35.0 °C or below, 39.1 °C or above (project rule), 38.1 °C or more persisting 24 h (project rule), or fever with rash, stiff neck or low WBC.
- Crew actions: Drink fluids and rest. Check for signs of infection (sore throat, rash, cough). Reduce exercise intensity while elevated.
- In spaceflight: Core temperature rises up to ~1 °C over long missions (impaired heat loss without convection), so compare against your own in-flight baseline.
- Measured with: Thermometer; CSA Bio-Monitor skin temperature.
- Sources: RCP NEWS2 (https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/); NASA HRP: Risk of Altered Immune Responses (https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/); CSA Bio-Monitor (https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)

## Respiratory rate

- Source tag: CLIN (general clinical range)
- Nominal: 12–20 /min
- Caution: 9–11 or 21–24 /min
- Critical: ≤ 8 or ≥ 25 /min
- Automatic escalation flag: < 9 /min; > 24 /min
- Contact the flight surgeon when: Above 24 or below 9 /min at rest, or any breathing difficulty.
- Crew actions: Count again over a full minute at rest. Check cabin CO₂.
- In spaceflight: Breathing rate rises with cabin CO₂; elevated rate at rest can be an early CO₂ or infection signal.
- Measured with: CSA Bio-Monitor (breathing rate and volume), manual count over 60 s.
- Sources: RCP NEWS2 (https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/); NASA OCHMO-TB-004 Carbon Dioxide (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf); CSA Bio-Monitor (https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)

## Blood glucose (fasting)

- Source tag: CLIN (general clinical range)
- Nominal: 70–99 mg/dL
- Caution: 54–69 (level 1 low) or 100–250 mg/dL
- Critical: < 54 (level 2 low) or > 250 mg/dL
- Automatic escalation flag: < 54 mg/dL; > 400 mg/dL; > 250 mg/dL on 2 days in a row
- Contact the flight surgeon when: Below 54 mg/dL, above 400 mg/dL (project rule), or above 250 mg/dL on two days in a row (project rule).
- Crew actions: If low: follow the onboard low-blood-sugar procedure. If high: drink water and review recent food intake; re-test fasting next morning.
- In spaceflight: ISS crews typically eat only ~80 % of their energy needs, so lows are possible when meals are skipped; insulin resistance has also been reported in flight.
- Measured with: Point-of-care glucose meter (finger stick).
- Sources: ADA diagnosis & hypoglycemia levels (https://diabetes.org/about-diabetes/diagnosis); NASA OCHMO-TB-013 Food & Nutrition (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf)

## Sleep last night

- Source tag: NASA (NASA / CSA standard)
- Nominal: 7–10 h (NASA schedules an 8.5 h sleep period)
- Caution: 5–6.9 h or > 10 h
- Critical: < 5 h, or < 6 h for 7+ days
- Automatic escalation flag: < 6 h on 7 days in a row
- Contact the flight surgeon when: Under 6 h on 7 days in a row (sleep debt), or poor sleep before critical tasks (docking, EVA, landing).
- Crew actions: Protect the full 8.5 h sleep period. Bright/blue-enriched light 1–2 h after waking; avoid it 1–2 h before bed. No caffeine 6–12 h before sleep.
- In spaceflight: Crews average only ~6–6.5 h. 16 sunrises a day, noise, CO₂ and workload disrupt circadian rhythm; a week under 6 h equals 24–36 h without sleep.
- Measured with: Wrist actigraphy and sleep log.
- Sources: NASA OCHMO-TB-041 Sleep (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf); NASA OCHMO-MTB-009 Circadian Desynchrony (https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf); NASA HRP: Inadequate Sleep & Irregular Schedules (https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)

## Mood (1 = very low, 10 = great)

- Source tag: App (derived by Demify, not an official limit)
- Nominal: 5–10
- Caution: 3–4, or a drop of ≥ 2 over 3 days
- Critical: 1–2, or any hopelessness
- Automatic escalation flag: ≤ 2 /10 on 2 days in a row
- Contact the flight surgeon when: Score ≤ 2 on two days in a row, or any thought of self-harm: request a private psychological conference (when contact allows).
- Crew actions: Schedule personal time and a call with family. Journal, tend the plant experiment, talk with a crewmate. Discuss workload adjustments with the commander.
- In spaceflight: Isolation, confinement and distance from Earth raise the risk of anxiety and depression; 2 of 7 Shuttle-Mir astronauts reported depressive symptoms.
- Measured with: Daily self-report; journaling; monthly WinSCAT cognitive test.
- Sources: NASA OCHMO-TB-016 Behavioral Health (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf); NASA HRP: Behavioral Conditions (https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/)

## Stress (1 = calm, 10 = overwhelmed)

- Source tag: App (derived by Demify, not an official limit)
- Nominal: 1–4
- Caution: 5–7, or a rise of ≥ 2 over 3 days
- Critical: 8–10
- Automatic escalation flag: ≥ 8 /10 on 2 days in a row
- Contact the flight surgeon when: 8 or more on two days in a row.
- Crew actions: Take a structured break; breathing exercise (4-7-8). Raise workload concerns at the daily planning conference.
- In spaceflight: Work overload, team conflict and the closed environment raise stress hormones, which also suppress immune function.
- Measured with: Daily self-report.
- Sources: NASA OCHMO-TB-016 Behavioral Health (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf); NASA HRP: Behavioral Conditions (https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/)

## Radiation dose rate

- Source tag: App (derived by Demify, not an official limit)
- Nominal: Mission GCR background (ISS ≈ 0.3–0.8, lunar ≈ 1.4, Mars transit ≈ 1.8 mSv/day)
- Caution: 2–10 mSv/day, or an S1–S2 solar radiation storm: prepare shelter, defer EVAs
- Critical: > 10 mSv/day or an S3+ solar radiation storm: go to storm shelter
- Automatic escalation flag: > 10 mSv/day; Any current S1+ solar radiation storm
- Contact the flight surgeon when: Above 10 mSv/day, or any current solar particle event alert (NOAA S1 or higher).
- Crew actions: Follow the radiation alert: shelter behind ~10 cm water-equivalent (water bags, stowage). Defer EVAs. Log dosimeter readings.
- In spaceflight: Galactic cosmic rays are a constant background; solar particle events can raise dose rates by orders of magnitude within hours. Neutrons make up ~30 % of ISS dose.
- Measured with: Personal and area dosimeters, CSA CANS neutron spectrometer, NOAA GOES proton flux.
- Sources: NASA OCHMO-TB-020 Radiation Protection (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf); NASA-STD-3001 Vol. 1 Rev C (https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf); CSA: Monitoring radiation for astronaut health (https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)

## Cumulative effective dose

- Source tag: NASA (NASA / CSA standard)
- Nominal: < 50 % of the 600 mSv career limit
- Caution: 50–80 % of the limit
- Critical: > 80 % of the limit or projected breach
- Automatic escalation flag: > 480 mSv
- Contact the flight surgeon when: Above 480 mSv (80 % of the career limit; the 80 % mark is a project rule), or projected to exceed 80 % of any limit.
- Crew actions: Keep EVA and shelter discipline to stay ALARA. Review planned high-exposure activities with ground.
- In spaceflight: NASA's career limit of 600 mSv effective dose keeps the added risk of cancer death below 3 %. ALARA applies at all times.
- Measured with: Dosimetry log.
- Sources: NASA-STD-3001 Vol. 1 Rev C (https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf); NASA OCHMO-TB-020 Radiation Protection (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf)

## Body mass change vs pre-flight

- Source tag: App (derived by Demify, not an official limit)
- Nominal: within ± 2 %
- Caution: 2–5 % loss or > 2 % gain
- Critical: > 5 % loss
- Automatic escalation flag: < −5 %
- Contact the flight surgeon when: Loss above 5 %.
- Crew actions: Meet daily energy targets; add snacks you like. Keep resistance exercise to protect muscle mass.
- In spaceflight: Under-eating, menu fatigue and muscle loss reduce body mass; ISS crews typically lose 2–5 %.
- Measured with: SLAMMD (Space Linear Acceleration Mass Measurement Device).
- Sources: NASA OCHMO-TB-013 Food & Nutrition (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf)

## Estimated bone loss rate

- Source tag: App (derived by Demify, not an official limit)
- Nominal: ≤ 0.8 %/month
- Caution: 0.8–1.5 %/month
- Critical: > 1.5 %/month, or hip/spine > 5 % total
- Automatic escalation flag: > 1.5 %/month
- Contact the flight surgeon when: Estimated loss above 1.5 %/month, low exercise adherence for 3+ days, bone or back pain, or kidney-stone symptoms (flank pain, blood in urine).
- Crew actions: Complete daily ARED resistance sessions. Bone-protection measures per the medical plan.
- In spaceflight: Without countermeasures weight-bearing bones lose 1–1.5 % per month; released calcium raises kidney-stone risk. NASA requires hip/spine BMD ≥ 95 % of pre-flight.
- Measured with: DXA only before/after flight; in flight estimated from exercise adherence and urine calcium.
- Sources: NASA OCHMO-MTB-013 Bone Loss (https://www.nasa.gov/wp-content/uploads/2026/02/ochmo-mtb-013-bone-loss.pdf); NASA HRP: Spaceflight-Induced Bone Changes (https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/); NASA-STD-3001 Vol. 1 Rev C (https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)

## Exercise today

- Source tag: NASA (NASA / CSA standard)
- Nominal: ≥ 90 min (NASA: 1.5–2 h/day, 6–7 days/week)
- Caution: 30–89 min
- Critical: < 30 min
- Automatic escalation flag: < 60 min on 3 days in a row
- Contact the flight surgeon when: Under 60 min/day on 3 days in a row (project rule).
- Crew actions: Complete the prescribed ARED + treadmill/cycle session. Make up missed sessions within the week.
- In spaceflight: Without exercise crews lose 10–12 % of strength and aerobic fitness on average. NASA requires VO₂max and strength ≥ 80 % of pre-flight.
- Measured with: ARED, T2 treadmill and CEVIS cycle logs.
- Sources: NASA: Astronaut Exercise (https://www.nasa.gov/general/astronaut-exercise/); NASA HRP: Reduced Fitness (https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/); NASA-STD-3001 Vol. 1 Rev C (https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)

## Water intake today

- Source tag: NASA (NASA / CSA standard)
- Nominal: ≥ 2.5 L/day (+0.24 L per EVA hour)
- Caution: 1.5–2.4 L
- Critical: < 1.5 L or acute mass loss ≥ 2.5 %
- Automatic escalation flag: none (the crew escalates on symptoms)
- Contact the flight surgeon when: Signs of dehydration (dizziness, dark urine) despite drinking.
- Crew actions: Drink a glass of water now and every hour until you reach the daily target. Check urine colour.
- In spaceflight: Thirst is blunted in microgravity; crews average only 2.0–2.3 L. Dehydration raises kidney-stone and fainting risk.
- Measured with: Drink log, urine colour, body mass.
- Sources: NASA OCHMO-TB-027 Water (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-027-water.pdf)

## White blood cell count

- Source tag: CLIN (general clinical range)
- Nominal: 4.5–11.0
- Caution: 2.0–4.4 or 11.1–30
- Critical: < 2.0 or > 30
- Automatic escalation flag: < 2 ×10⁹/L; > 30 ×10⁹/L
- Contact the flight surgeon when: Below 2.0 ×10⁹/L, above 30 ×10⁹/L (project rule), fever together with low WBC, or a shingles-type rash.
- Crew actions: Strict hand hygiene; limit shared items. Report rashes, cold sores or fever.
- In spaceflight: Spaceflight dysregulates the immune system: latent viruses reactivate (shingles, cold sores), rashes and allergies become more common.
- Measured with: Blood sample (usually returned to Earth); saliva samples in flight.
- Sources: MedlinePlus WBC count (https://medlineplus.gov/lab-tests/white-blood-count-wbc/); NASA HRP: Risk of Altered Immune Responses (https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/); NASA-STD-3001 Vol. 1 Rev C (https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)

## Cabin CO₂ partial pressure

- Source tag: NASA (NASA / CSA standard)
- Nominal: < 2.5 mmHg (< 3,300 ppm; 7-day average target, OCHMO-TB-004)
- Caution: 2.5–3.0 mmHg
- Critical: > 3.0 mmHg as a 1-hour average (NASA-STD-3001 V2 6004 limit)
- Automatic escalation flag: > 3 mmHg
- Contact the flight surgeon when: Above 3 mmHg (NASA 1-hour average limit; here a single reading counts), or headache or vision change with high CO₂.
- Crew actions: Move to a well-ventilated module; position a fan. Check CO₂ scrubbers (CDRA). Reduce exercise while CO₂ is high.
- In spaceflight: Without convection CO₂ pools around the face. Headache odds roughly double per +1 mmHg (Law 2014, cited in OCHMO-TB-004); CO₂ may contribute to SANS.
- Measured with: ECLSS cabin monitors, personal CO₂ monitors. The NASA limit is defined as a 1-hour average; this prototype treats a single high reading as a breach.
- Sources: NASA-STD-3001 Vol. 2, V2 6004 (https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-2); NASA OCHMO-TB-004 Carbon Dioxide (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf)

## Vision symptoms (0 none – 3 severe)

- Source tag: App (derived by Demify, not an official limit)
- Nominal: 0 – no change
- Caution: 1–2 – new near-vision blur, needing stronger glasses, headache
- Critical: 3 – vision not correctable with glasses
- Automatic escalation flag: Any value ≥ 1 /3
- Contact the flight surgeon when: Any new visual change: OCT and fundoscope exam (with ground support when contact allows).
- Crew actions: Switch to the next pair of backup glasses (crews fly 3+ strengths). Keep cabin CO₂ low.
- In spaceflight: ~70 % of long-duration crews show signs of Spaceflight Associated Neuro-ocular Syndrome (optic disc swelling, choroidal folds); 18 % clinically significant.
- Measured with: Eye charts, OCT, fundoscope, ocular ultrasound in 'eye weeks' (flight day 30, 90, return-30).
- Sources: NASA OCHMO-MTB-001 SANS (https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf); NASA HRP: SANS (https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/)

## ST segment deviation (ECG)

- Source tag: CLIN (general clinical range)
- Nominal: −0.5 to +0.9 mm
- Caution: −0.6 to −2.0 mm depression (possible ischaemia)
- Critical: ≥ 1 mm elevation (STEMI criterion) or > 2 mm depression (project rule)
- Automatic escalation flag: Any value ≥ 1 mm elevation or > 2 mm depression (project rule)
- Contact the flight surgeon when: Any ST elevation ≥ 1 mm, ST depression > 2 mm (project rule), or chest pain (medical emergency).
- Crew actions: Stop all activity; the crew member rests, monitored, with the Crew Medical Officer. Record and transmit a 12-lead ECG to the flight surgeon immediately. Follow the onboard medical checklist for chest pain; contact the flight surgeon.
- In spaceflight: Spaceflight remodels the heart and radiation adds long-term cardiovascular risk. A heart attack far from Earth must be recognised and treated by the crew itself: there is no emergency room and evacuation takes days. Reference: new ST elevation ≥ 1 mm in two contiguous leads is the STEMI criterion, a medical emergency; crewed vehicles carry a defibrillator (AED) and an advanced cardiac life support kit for the onboard procedures.
- Measured with: Continuous ECG (CSA Bio-Monitor shirt, ISS ECG kit); 12-lead ECG for the flight surgeon.
- Sources: Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF 2018) (https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617); NASA HRP: Risk of Cardiovascular Adaptations (https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/); CSA Bio-Monitor (https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp)
