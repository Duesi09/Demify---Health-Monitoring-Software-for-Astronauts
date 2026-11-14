---
id: escalation-and-signal-delay
title: Escalation and signal delay
category: protocol
source: Demify project text: escalation rules of the health knowledge base and the signal-delay policy of the link profiles
license: Project text, MIT
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---

# Escalation and signal delay

Training framing: in a real mission an escalation prompts a call to the flight surgeon. Demify advises and never decides; the crew and, when the ground link is up, the flight surgeons make every medical decision.

## When Demify says contact the flight surgeon

The critical band alone does not escalate. Unless one of the rules below matches, a critical value gets the finding "in the critical band: re-check and log". An escalation comes from these explicit rules:

1. Escalation limits: one value strictly beyond the limit.
2. Escalating bands: any value in the stated band escalates on its own. This applies to the symptom-type indicators (ST segment, SpO₂, vision) and to the critical temperature band.
3. Persistence rules: the condition holds on several days in a row, or for several hours. One value alone never escalates by this rule; the finding counts the days or hours so far. All persistence rules are project rules.
4. Solar radiation storm: any current NOAA S1 or higher storm.

The finding then reads "contact the flight surgeon" (or "critical: contact the flight surgeon" for a critical value). Other findings: "outside normal range, monitor closely", "re-check in 15 minutes" for a caution blood pressure, "large change from your baseline" for the personal-baseline rule (project rule; it never escalates), and "repeated values escalate" while a persistence rule is counting.

## Escalation limits per indicator

- Heart rate: below 40 or above 130 bpm (CLIN).
- ST segment: any critical value, elevation ≥ 1 mm or depression > 2 mm (CLIN; > 2 mm depression is a project rule).
- Blood pressure: systolic above 180 or below 80 mmHg; diastolic above 120 or below 40 mmHg (CLIN, AHA hypertensive crisis).
- SpO₂: any value ≤ 90 % (CLIN).
- Temperature: any critical value, ≤ 35.0 °C or ≥ 39.1 °C; ≥ 38.1 °C persisting 24 h (CLIN, NEWS2 bands; rating ≥ 39.1 °C critical and the 24 h rule are project rules).
- Respiratory rate: above 24 or below 9 /min (CLIN, NEWS2 3-point bands).
- Glucose: below 54 mg/dL; above 400 mg/dL; above 250 mg/dL on 2 days in a row (CLIN, ADA level 2; the 400 mg/dL ceiling and the 2-day rule are project rules).
- Sleep: below 6 h on 7 days in a row, "sleep debt" (project rule, based on OCHMO-TB-041).
- Mood: ≤ 2 on 2 days in a row (project rule). Stress: ≥ 8 on 2 days in a row (project rule).
- Exercise: below 60 min on 3 days in a row (project rule).
- Radiation dose rate: above 10 mSv/day; any current S1+ solar radiation storm (App, project rule).
- Cumulative dose: above 480 mSv, 80 % of the NASA 600 mSv career limit (NASA limit; the 80 % trigger is a project rule).
- Body mass: loss above 5 % (App). Bone loss: above 1.5 %/month (App).
- WBC: below 2.0 or above 30 ×10⁹/L (CLIN; above 30 is a project rule).
- Cabin CO₂: above 3 mmHg (NASA V2 6004, a 1-hour average limit; Demify does not average, so one reading above 3 mmHg counts as a breach).
- Vision: any new symptom, score ≥ 1 (App, based on OCHMO-MTB-001).
- Hydration: no automatic flag; the crew escalates on symptoms.

## Signal delay per mission profile

One-way signal delay between the crew and the ground. Light times are computed (distance divided by the speed of light); the ISS and mid-transit values are illustrative fixed numbers.

- ISS (low Earth orbit): 0.5 s one way, 1 s round trip. Relay through geostationary TDRS satellites plus network latency (illustrative). Near real-time.
- Moon (Artemis): 1.3 s one way, 2.6 s round trip. Light time at about 384,400 km. Near real-time.
- Mars at closest approach: 3.1 min one way, 6.2 min round trip. Light time at 0.37 AU. Delayed.
- Mars transit: 12.5 min one way, 25 min round trip. Fixed 750 s, mid-range transit (illustrative). Delayed.
- Mars far from Earth: 20.8 min one way, 41.6 min round trip. Light time at about 2.5 AU, just outside conjunction (upper bound with contact). Delayed.
- Mars solar conjunction: no contact (blackout). The Sun is between Earth and Mars; the simulation uses a 14-day blackout (illustrative).

Earth-Mars delay in general: about 3 to 22 minutes one way, depending on planetary positions. The far end of that range (about 2.67 AU, 22.2 min) is reached around solar conjunction, when there is no contact at all. The mission profiles map to links as follows: ISS to the ISS link, Artemis (Lunar) to the Moon link, Mars Transit to the Mars transit link.

## What the delay means for the crew

- Near real-time (below 60 s one way): near real-time consultation is possible. Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.
- Delayed (60 s or more one way): act first, then report; do not wait for a reply. Do not wait for an answer before acting; follow the onboard checklist and send updates.
- Blackout (no contact, including a ground link that is down): act on the onboard procedures; transmit when contact returns. Prepare the report for the flight surgeon: time of onset, rhythm, vital signs, actions taken.

## Conjunction and other blackouts

During a Mars solar conjunction there is no contact with the ground for the whole blackout (14 days in the simulation, illustrative). The crew acts on the onboard procedures and the drill checklists, logs every value and action with its time, prepares the report for the flight surgeon and transmits it when contact returns. The same applies whenever the ground link is down; see "Ground link blackout".
