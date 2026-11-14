---
id: ground-link-blackout
title: Ground link blackout
category: protocol
source: Demify project text: onboard server behaviour with the ground link down
license: Project text, MIT
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---

# Ground link blackout

A blackout means the ground link is down: no contact with mission control, the flight surgeons, the Earth-side library or the live NOAA and NASA OSDR data. A blackout happens around a Mars solar conjunction and whenever the link is lost. In Demify a simulated ground-link switch takes the link down to rehearse a blackout, and DEMIFY_OFFLINE=true keeps it down for good (a hard air-gap).

## What changes when the ground link is down

- The onboard library keeps working. The onboard assistant answers from the local copy that was synced before the blackout, cites the library passages it used and shows how fresh the library is, for example "last synced 14 hours ago".
- Live data stops. Space weather (NOAA) and NASA OSDR data are shown from the last snapshots, labelled SNAPSHOT with their date instead of REAL. Check the label and the time of every value before you use it: REAL, SNAPSHOT <date>, SIMULATED or DEVICE.
- The library sync pauses. "Sync now" answers: "Ground link is down (blackout): nothing to sync from".
- The rule engine and the alarms keep running onboard, unchanged. The onboard assistant never raises or clears an alarm.
- Radiation: a storm escalates on current NOAA data. With an offline snapshot or data older than 3 hours the finding asks the crew to verify with the onboard dosimeters instead. When space weather is unknown: follow onboard dosimeter alarms and the last NOAA bulletin, and treat conditions as unconfirmed until live data returns.

## Handling a medical event during a blackout

1. Act on the onboard procedures and the drill checklists; do not wait for the ground. The flight-surgeon step becomes: "Prepare the report for the flight surgeon: time of onset, rhythm, vital signs, actions taken." Act on the onboard procedures; transmit when contact returns.
2. The crew decides. The onboard assistant advises from the local library and never decides; if the library has no good answer it says so.
3. Log everything with its time: every vital sign, every action, every check-in and every alarm. Keep the response checklist sheet: it records the time of each step.
4. Watch the freshness stamps: how old the library is and whether each value is REAL, SNAPSHOT, SIMULATED or DEVICE.
5. When contact returns, transmit the report to the flight surgeon, then let the library and the data snapshots sync.

## When the ground link returns

- The sync service checks the ground link every minute. When the link is up and the last library sync is older than the sync interval (default 6 hours), it pulls the ground library; it also refreshes the data snapshots every 30 minutes. "Sync now" starts a library sync at once.
- A sync compares checksums: unchanged documents are kept as they are and are not embedded again; changed documents are replaced; documents removed on the ground are removed onboard.
- Every library passage carries a SHA-256 checksum that is checked again before the passage is shown; a passage whose checksum does not match is never shown.
