# Data sources

Every endpoint below was called and checked on 2026-11-14. Each adapter in
`src/lib/sources/` uses `cached()` (`src/lib/sources/cache.ts`). Its fallback
order is: memory cache → live fetch → stale memory → bundled snapshot in
`data/snapshots/<key>.json`. Because of the snapshot, the app keeps working on
an air-gapped spacecraft network.

## What the public data has, and what it lacks

| Health indicator | Real public source? | What Demify does |
|---|---|---|
| Heart rate, blood pressure, SpO₂, temperature, respiration | **None.** Crew medical data is protected, and OSDR holds no human vitals. | Devices push readings to `POST /api/readings`. Until a device is connected, a deterministic demo generator (`src/lib/sources/simulator.ts`) fills in. Its values are labelled "simulated" in the UI and can be turned off with `DEMIFY_SIMULATE=false`. |
| Blood chemistry (glucose, calcium, ALP …) | OSDR **OSD-575** (Inspiration4 CMP) | `/research` explorer and reference values |
| Blood counts, immune (WBC, lymphocytes …) | OSDR **OSD-569** (Inspiration4 CBC) | `/research` explorer |
| Inflammation and heart markers (CRP, fibrinogen, cytokines) | OSDR **OSD-575** Eve panels | `/research` explorer |
| Radiation environment (live) | **NOAA SWPC** GOES proton and X-ray flux, Kp index, 3-day outlook | `/radiation`, dose-rate indicator |
| ISS measured dose | OSDR **Environmental Data App** (ISS dosimetry, rodent missions) | ISS reference dose on `/radiation` |
| Bone | No in-flight density data. Proxies: calcium and ALP (CMP), osteopontin (Alamar) | Shown as markers only |
| Sleep, mood, behaviour | None public | Daily self-check-in |

## NASA OSDR: Open Science Data Repository

### Listing and downloading files

- **Inspiration4 study list:** `GET https://osdr.nasa.gov/geode-py/ws/api/mission/SpaceX%20Inspiration4` returns OSD-569, 570, 571, 572, 573, 574, 575, 630, 656, 687.
- **A study's file list:** `GET https://osdr.nasa.gov/osdr/data/osd/files/{num}`. The files are in `studies["OSD-575"].study_files[]`.
- **Downloading a file:** `GET https://osdr.nasa.gov{remote_url}`.
  - The response is a 302 redirect to a signed S3 URL that is valid for about 1 h, so cache the file content rather than the URL.
  - CORS headers restrict access to `osdr.nasa.gov`, so the app downloads on the server only.

### Subjects and timepoints

- **Subjects:** C001 (male), C002 (female), C003 (female), C004 (male).
- **Timepoints:** L-92, L-44, L-3 (days before launch) and R+1, R+45, R+82, R+194 (days after return).
- **Flight dates:** 2021-09-16 to 2021-09-18.

### Tables used

| Dataset | File | Columns |
|---|---|---|
| CBC (OSD-569) | `LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv` | `ANALYTE,VALUE,RANGE_MIN,RANGE_MAX,UNITS,TEST_TYPE,SUBJECT_ID,SEX,TEST_DATE` |
| CMP (OSD-575) | `LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv` | Same as CBC, except the last column is `timepoint` |
| Cardiovascular panel (OSD-575) | `LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv` | `Analyte,Concentration,Timepoint,ID,Unit,Timepoint2,Type,Percent` (file starts with a BOM) |
| Cytokines (OSD-575) | `LSDS-8_Multiplex_serum.immune.EvePanel_SUBMITTED.csv` | Same as the cardiovascular panel; 71 cytokines in pg/ml |

### Known data quirks

- Female subjects mostly carry male reference ranges in the CBC table.
- C003 platelets at L-92 = 12.9, which is probably an entry error.
- `RANGE_MAX` sometimes contains the text `N/A`.
- CRP is reported in pg/ml. Divide by 1e9 to get mg/L.

### Other OSDR APIs

- **Study search:** `GET https://osdr.nasa.gov/osdr/data/search?term=<q>&type=cgene&size=<n>`. The response is Elasticsearch-style: `hits.hits[]._source`.
- **Biodata API v2:** `https://visualization.osdr.nasa.gov/biodata/api/v2/`. Spec: `openapi.json`.
  - It can return a raw file: `/v2/query/data/?id.accession=OSD-575&file.file_name=<name>&format=raw`.
  - It cannot return parsed rows.
- **Environmental Data App:** `https://visualization.osdr.nasa.gov/eda/api/missions/`.
  - Per mission: `/missions/{m}/radiation_data/` returns `[{time, gcr, saa, total}]`, in mGy/day.
  - Typical ISS total is about 0.28–0.35 mGy/day.

## NOAA SWPC: Space Weather Prediction Center

| Feed | URL | Use |
|---|---|---|
| Protons | `/json/goes/primary/integral-protons-3-day.json` | ≥10 and ≥100 MeV flux in pfu, every 5 min. Sets the S-scale (S1 at ≥10 pfu … S5 at ≥10⁵). |
| X-rays | `/json/goes/primary/xrays-1-day.json` | 0.1–0.8 nm flux, used for flare class (A/B/C/M/X) |
| Scales | `/products/noaa-scales.json` | Current R/S/G levels plus 3-day probabilities |
| Kp | `/products/noaa-planetary-k-index.json` | Geomagnetic activity |
| Alerts | `/products/alerts.json` | Text alerts (not used yet) |
| Flares | `/json/goes/primary/xray-flares-7-day.json` | Flare list (not used yet) |

All URLs above are relative to `https://services.swpc.noaa.gov`.

## NASA DONKI: Space Weather Database Of Notifications, Knowledge, Information

`https://api.nasa.gov/DONKI/` is not used yet.

- **Working endpoints:**
  - `SEP?startDate=&endDate=&api_key=` returns solar energetic particle events.
  - `GST` returns geomagnetic storms.
  - `notifications` returns DONKI's notification messages.
- **Broken:** `FLR` (flares) returned 404 upstream at the time of testing.
- **Rate limit:** `DEMO_KEY` is limited to a few calls. Set your own key in `NASA_API_KEY`.

## Not usable

**G-Space:** it holds too little health data for this project.

**Proxy note:** Node's built-in `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set.
