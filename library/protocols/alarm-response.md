---
id: alarm-response
title: Alarm response drill checklists
category: protocol
source: Demify emergency drill checklists (crew page) and patient-monitor alarm limits; STEMI criterion from the Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF 2018)
url: https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617
license: Project text, MIT; the cited sources keep their own terms
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---

# Alarm response drill checklists

Training material. These are the emergency response checklists Demify shows on the crew page during a drill (a training scenario) or a high-priority monitor alarm. They show how pre-approved procedures are timed under signal delay. The wording is procedural, not prescriptive: every clinical step defers to the onboard medical checklist and the flight surgeon, and no step names a drug, a dose or an amount. The flight surgeon directs treatment.

## Which checklist applies

- During a drill: the checklist of the drill's training scenario.
- Otherwise the checklist that matches the most serious high-priority alarm: VFIB / NO PULSE or VTACH opens the cardiac arrest checklist; an ST elevation alarm opens the suspected heart attack (STEMI) checklist; a systolic blood pressure above 180 mmHg opens the hypertensive crisis checklist; any other high-priority alarm opens the general high-priority alarm checklist.
- Each step is checked off with the time it was done, in the style of a resuscitation code sheet. The sheet is a training and coordination aid, not a medical record.
- A drill alters the simulated telemetry of one crew member so the crew can rehearse; no real reading changes. A drill ends automatically after 30 minutes.

## Suspected heart attack (STEMI)

Drill "Simulate heart attack (STEMI)", training scenario "Acute myocardial infarction (STEMI)": ST elevation on the ECG, rising heart rate, PVCs and falling SpO₂ over the next minutes. Reference: new ST elevation ≥ 1 mm in two contiguous leads is the STEMI criterion, a medical emergency (Fourth Universal Definition of Myocardial Infarction, ESC/ACC/AHA/WHF 2018).

Checklist "Suspected heart attack (STEMI)":

1. Stop all activity; the crew member rests, monitored, with the Crew Medical Officer. Note the time symptoms began (chest pain, breathlessness, sweating, nausea).
2. Record and transmit a 12-lead ECG to the flight surgeon immediately.
3. Follow the onboard medical checklist for chest pain; contact the flight surgeon. Any medication only as the onboard medical checklist or the flight surgeon directs.
4. Have the defibrillator (AED) ready per the onboard procedure. Keep the pads within reach: STEMI can deteriorate into ventricular fibrillation.
5. Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken. (The timing of this step follows the signal delay; see "The flight-surgeon step" below.)
6. Keep continuous ECG, blood pressure and SpO₂ monitoring; record vitals every 5 minutes.

## Cardiac arrest (ventricular fibrillation)

Drill "Simulate cardiac arrest (VF)", training scenario "Cardiac arrest (ventricular fibrillation)": ventricular fibrillation, chaotic ECG, no pulse, no blood pressure or pleth. Monitor alarm: VFIB / NO PULSE (or VTACH), high priority.

Checklist "Cardiac arrest (VF / pulseless VT)":

1. Confirm: unresponsive, not breathing normally, no pulse. Call out "cardiac arrest" to the crew. If a pulse is present, follow the onboard arrhythmia checklist instead and contact the flight surgeon.
2. Start chest compressions now in the microgravity CPR position per onboard procedure. Restrain the patient or brace the rescuer (e.g. handstand or reverse bear-hug position) so compressions are effective.
3. Bring the AED, attach the pads and follow its voice prompts; shock only when the device advises.
4. Resume CPR immediately after each shock; switch compressors about every 2 minutes.
5. Follow the onboard advanced cardiac life support (ACLS) checklist under flight surgeon direction.
6. Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken. (Timed by the signal delay; see "The flight-surgeon step" below.)
7. Keep this sheet: record every shock, rhythm check and medication time.

## Hypertensive crisis (BP > 180/120 mmHg)

Drill "Simulate hypertensive crisis", training scenario "Hypertensive crisis": blood pressure climbing above 180/120 mmHg with a rising heart rate. Reference: above 180 / 120 mmHg is the AHA hypertensive crisis; a systolic value above 180 mmHg or a diastolic value above 120 mmHg escalates (contact the flight surgeon).

Checklist "Hypertensive crisis (BP > 180/120 mmHg)":

1. Stop activity; rest quietly, restrained, with continuous monitoring.
2. Sit quietly for 5 minutes, arm at heart level, and repeat the measurement.
3. Check for warning symptoms: severe headache, chest pain, vision change, confusion, breathlessness. Any of these with BP > 180/120 is a medical emergency.
4. Follow the onboard medical checklist for high blood pressure; medication only per flight surgeon direction.
5. Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken. (Timed by the signal delay; see "The flight-surgeon step" below.)
6. Re-measure every 5–15 minutes and log each value with its time.

## General high-priority alarm

Checklist "High-priority alarm" (any other high-priority alarm, for example a low SpO₂ or a very high heart rate):

1. Check the crew member first, then the sensor: responsive? breathing? electrodes, cuff and probe in place?
2. The crew actions listed for the alarm's indicator (see "Vital-sign ranges and escalation rules").
3. The flight-surgeon step, timed by the signal delay.

## The flight-surgeon step

The step changes with the signal delay of the link (see "Escalation and signal delay"):

- Near real-time link (one-way delay below 60 seconds, for example the ISS at 0.5 s): "Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken." Near real-time consultation is possible.
- Delayed link (60 seconds or more one way, for example Mars transit at 12.5 min one way, 25 min round trip): "Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken." Do not wait for an answer before acting; follow the onboard checklist and send updates.
- Blackout (no contact, for example Mars solar conjunction): "Prepare the report for the flight surgeon: time of onset, rhythm, vital signs, actions taken." Act on the onboard procedures; transmit when contact returns.

## Monitor alarm limits

Patient-monitor alarm limits, modelled on common bedside-monitor defaults (adult). High priority is red and life-threatening (IEC 60601-1-8 high priority); medium priority is yellow. These are acute, beat-to-beat alarms; the slower health assessment (ranges, trends, escalations) is separate.

- Heart rate: high priority above 150 or below 40 bpm; medium priority above 120 or below 45 bpm. During scheduled exercise: high above 185, medium above 170 bpm. During sleep: high below 35, medium below 40 bpm.
- Systolic blood pressure: high priority above 180 or below 80 mmHg; medium priority above 160 or below 90 mmHg.
- SpO₂: high priority below 88 %; medium priority below 92 %.
- Respiratory rate: high priority at 4 /min or below (APNEA at 0); medium priority above 28 /min (above 45 /min during exercise) or below 8 /min.
- ST elevation: high priority at 1 mm or more.
- PVCs: medium priority at 6 or more per minute.
- Rhythm: ventricular fibrillation (VFIB / NO PULSE) and ventricular tachycardia (VTACH) are high priority.
