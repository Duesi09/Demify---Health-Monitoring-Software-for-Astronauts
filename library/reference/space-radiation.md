---
id: space-radiation
title: Space radiation and solar storms
category: reference
source: Demify radiation page and health knowledge base, citing NASA-STD-3001 Vol. 1 Rev C, NASA OCHMO-TB-020, CSA radiation monitoring and the NOAA S-scale
url: https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf
license: Project text, MIT; the cited sources keep their own terms
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---

# Space radiation and solar storms

Space radiation is one of NASA's five hazards of human spaceflight: it raises long-term cancer risk and can damage the central nervous system, heart and eyes. Galactic cosmic rays (GCR) are a constant background; solar particle events (SPE) can raise dose rates by orders of magnitude within hours and can cause acute effects. Neutrons make up about 30 % of the dose on the ISS (CSA). Always ALARA (as low as reasonably achievable).

## Solar storm shelter procedure

When a solar radiation storm starts (NOAA S1 or higher):

1. Follow the radiation alert: shelter behind ~10 cm water-equivalent (water bags, stowage).
2. Defer EVAs.
3. Log dosimeter readings.
4. Act on the storm level: S1, review the shelter plan; S2, prepare the storm shelter; S3, shelter in the most shielded area (water/stowage wall); S4, shelter immediately, remain until all-clear and track dosimeters every hour; S5, shelter immediately.
5. Escalate: in Demify any current S1 or higher storm escalates (contact the flight surgeon). In a real mission an S3 storm prompts a call to the flight surgeon and an S5 storm means the emergency protocol.

A storm shelter needs about 10 cm of water-equivalent material. Shielding cuts SPE dose by about 50 % but GCR dose by about 7 %.

## NOAA S-scale and the crew action

The NOAA solar radiation storm scale uses the ≥10 MeV proton flux measured by the GOES satellites: S1 from 10 pfu, S2 from 100 pfu, S3 from 1,000 pfu, S4 from 10,000 pfu, S5 from 100,000 pfu. Demify rates S1–S2 as caution and S3 or higher as critical. Training reference, what each level would mean for a crew in a real mission:

- No storm (S0): normal operations. Keep personal dosimeter worn.
- Minor (S1): heightened awareness. Review shelter plan; plan EVAs with caution.
- Moderate (S2): defer EVAs. Prepare storm shelter; crew in deep-space vehicles should be ready to shelter.
- Strong (S3): shelter in the most shielded area (water/stowage wall). In a real mission this prompts a call to the flight surgeon.
- Severe (S4): shelter immediately and remain until all-clear. Track dosimeters every hour.
- Extreme (S5): shelter immediately. Unshielded exposure may cause acute radiation effects. In a real mission: emergency protocol.

A solar X-ray flare is a warning sign, not a dose. After an M- or X-class flare, protons, if any, may follow, sometimes within minutes. Rising ≥100 MeV flux means penetrating particles that shielding stops poorly.

## Storm alerts in Demify

- Any current NOAA S1 or higher solar radiation storm escalates the radiation dose rate (contact the flight surgeon).
- A storm escalates on current NOAA data. With an offline snapshot or data older than 3 hours, the finding asks the crew to verify with the onboard dosimeters instead.
- Without proton flux data the storm level is unknown, never assumed to be S0. Then: space weather unknown, follow onboard dosimeter alarms and the last NOAA bulletin; treat conditions as unconfirmed until live data returns.

## Dose rates per mission profile

Typical GCR dose rates (quiet sun): ISS about 0.3–0.8 mSv/day (Demify uses 0.5), lunar surface about 1.4 mSv/day (Chang'e-4: 1,369 µSv/day dose equivalent, Zhang et al. 2020, Science Advances 6, eaaz1334; the Artemis (Lunar) profile uses 1.4), Mars cruise about 1.8 mSv/day (Mars Transit profile), Mars surface about 0.64 mSv/day.

Dose-rate bands (App): nominal is the mission GCR background; caution is 2–10 mSv/day, or an S1–S2 solar radiation storm (prepare shelter, defer EVAs); critical is above 10 mSv/day or an S3+ solar radiation storm (go to storm shelter). Above 10 mSv/day escalates.

The crew dose-rate estimate in Demify is a heuristic, labelled "App (illustrative)", and must not be used as a dosimeter: it starts from the mission's GCR baseline and adds 0.01 mSv/day for each pfu of ≥10 MeV proton flux above background; in low Earth orbit that addition is scaled down to 5 %, because the magnetosphere deflects most solar protons. It is an estimate from GOES flux at geosynchronous orbit, not a measurement at your location. Your dosimeter is the reference.

Measured ISS dose (NASA OSDR): about 0.31 mGy/day absorbed dose from ISS area dosimetry (Rodent Research missions), not crew dose; shown as measured, in mGy. The South Atlantic Anomaly (SAA), where Earth's radiation belt dips lowest, contributes about half of the ISS dose.

## NASA exposure limits

NASA-STD-3001 Vol. 1 Rev C:

- Career effective dose (V1 4030): below 600 mSv, which keeps the risk of cancer death from exposure below 3 %.
- Per solar particle event, design reference (V1 4031): below 250 mSv.
- GCR dose rate in habitats used more than 60 days (V1 4033): below 1.3 mSv/day in free space; below 0.9 mSv/day on a surface.
- Blood-forming organs (Table 4.8-1): 250 mGy-Eq per 30 days; 500 mGy-Eq per year.
- Lens of the eye (Table 4.8-1): 1,000 / 2,000 / 4,000 mGy-Eq (30 days / 1 year / career).

Cumulative dose in Demify (NASA basis): nominal below 50 % of the 600 mSv career limit, caution 50–80 %, critical above 80 % or a projected breach. Above 480 mSv (80 % of the career limit; the 80 % mark is a project rule) escalates. Each crew member's dose budget uses their own dosimeter log.

## Measurement

Personal and area dosimeters, the CSA CANS neutron spectrometer and the NOAA GOES proton flux. Log personal dosimeter readings in the daily check-in so the dose budget uses the measured value instead of the estimate.

## Sources

- NASA-STD-3001 Vol. 1 Rev C: https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf
- NASA OCHMO-TB-020 Radiation Protection: https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf
- CSA, Monitoring radiation for astronaut health: https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- NASA HRP, space radiation hazard: https://www.nasa.gov/hrp/hazard-space-radiation/
- Zhang et al. 2020, Science Advances 6(39), eaaz1334, doi:10.1126/sciadv.aaz1334
