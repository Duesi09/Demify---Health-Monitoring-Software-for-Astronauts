# Demify: budget for year 1 (redundant onboard setup)

State: 15 November 2026. Our estimate for planning, not an offer. All amounts
in CHF, ranges where prices vary. Hardware prices in the NVIDIA GB10 class rose
several times in 2026: get current quotes before committing.

**Scenario:** a two-person team (founders and developers) turns Demify into a
product and runs a first analog-station pilot (candidate: Asclepios,
Switzerland) on a **redundant onboard setup** (two NVIDIA DGX Spark units,
PostgreSQL primary and standby), as the step before any agency cooperation.

- **Lean:** only what the plan needs.
- **Recommended:** adds what a serious partner (ESA, a university, NASA via a
  partner) will expect: external security audit, insurance, legal review,
  vendor support.

## Summary

| Block | Lean | Recommended |
|---|---:|---:|
| A. People (2 developers, CHF 220,000 gross together) | 253,000 | 264,000 |
| B. Hardware (redundant setup, dev laptops, sensors) | 24,000 | 33,000 |
| C. Software and services | 1,500 | 16,000 |
| D. Security and compliance | 0 | 20,000 |
| E. Company, legal, insurance | 12,000 | 30,000 |
| F. Pilot, travel, events | 15,000 | 35,000 |
| Subtotal | 305,500 | 398,000 |
| G. Contingency (10 %) | 30,500 | 40,000 |
| **Total year 1** | **about 336,000** | **about 438,000** |

Hardware is under 10 % of the budget; people are about 60–75 %. Software
licences for the product itself stay at CHF 0 (all open source, see
[`COSTS.md`](COSTS.md)); the software line is optional enterprise support and
team tools.

## A. People

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| Gross salaries, 2 developers | 220,000 | 220,000 | CHF 110,000 each (your figure: 220,000 for both) |
| Employer social costs | 33,000 | 44,000 | AHV/IV/EO 5.3 %, ALV 1.1 %, BVG (at least half), UVG, FAK by canton: rule of thumb 15–20 % of gross |
| **Total** | **253,000** | **264,000** | |

If the CHF 220,000 is meant **per person**, block A doubles to about
CHF 506,000 – 528,000 and the total to about CHF 600,000 – 730,000.

## B. Hardware

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| 2 × NVIDIA DGX Spark (or partner GB10 systems) | 13,000 | 17,000 | Founders Edition reported at USD 6,950 since Oct 2026 (USD 3,999 at launch); partner systems partly cheaper |
| 2 × UPS (clean shutdown) | 400 | 600 | |
| Backup: NAS or 2 external disks (pg_dump, snapshots) | 600 | 1,500 | off-site copy recommended |
| Network: switch, small firewall, cables | 300 | 1,200 | separate network for the station server |
| 2 × developer laptops (32 GB RAM) | 5,000 | 7,000 | can be skipped if existing machines suffice |
| Sensors for 4 crew (BP monitor, pulse oximeter, chest strap, watch) | 3,000 | 3,000 | consumer devices with export, for import/bridge tests; not medical grade |
| Spares and test equipment | 1,700 | 2,700 | |
| **Total** | **24,000** | **33,000** | one-off |

Electricity for two units: about CHF 520 a year (100 W average each, CHF 0.30/kWh), included in F.

## C. Software and services (per year)

Nothing here is needed to **run** Demify. These are support contracts and team tools.

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| NVIDIA AI Enterprise (vendor support for the GPU software stack) | 0 | 8,000 | not needed for our stack (Ollama, PostgreSQL); list price USD 4,500 per GPU and year; DGX-Spark-specific reseller listings are much lower (about USD 625), unverified |
| Docker | 0 | 400 | Engine free; Desktop free under 250 staff and USD 10 M revenue; Team plan optional for image scanning |
| GitHub (Team plan, private repos, code scanning) | 100 | 1,500 | public repo free; Advanced Security optional |
| Office, email, domain, website | 300 | 600 | |
| AI coding and research tools | 1,100 | 3,500 | |
| Ubuntu/OS support, monitoring service | 0 | 2,000 | DGX OS included with the hardware |
| **Total** | **1,500** | **16,000** | |

## D. Security and compliance

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| External penetration test / security audit | 0 | 15,000 | expected before any pilot with real crew data |
| Data protection (Swiss nDSG / EU GDPR): data-protection concept, consent forms | 0 | 5,000 | analog crews are volunteers; health data is particularly sensitive |
| Medical-device path (EU MDR, ISO 13485 quality system) | 0 | 0 | **not in year 1**: Demify stays a research and training prototype; a clinical product would be a separate budget (typically far above the hardware) |
| **Total** | **0** | **20,000** | |

## E. Company, legal, insurance

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| Company formation (GmbH): notary, register | 2,000 | 3,000 | plus CHF 20,000 share capital (stays in the company, not an expense) |
| Accounting, payroll, tax | 5,000 | 10,000 | |
| Insurance: professional and product liability | 3,000 | 8,000 | |
| Legal advice (contracts with partners, export control, IP) | 0 | 6,000 | |
| Trademark "Demify" (CH, EU) | 2,000 | 3,000 | |
| **Total** | **12,000** | **30,000** | |

## F. Pilot, travel, events

| Item | Lean | Recommended | Note |
|---|---:|---:|---|
| Analog pilot (Asclepios or similar): travel, stay, shipping, on-site support | 8,000 | 15,000 | |
| Conferences and partner meetings (space medicine, IAC, ESA) | 5,000 | 12,000 | |
| One trip to the US (NASA centres, ISS National Lab, US partners) | 0 | 6,000 | |
| Electricity, hosting of the ground copy | 2,000 | 2,000 | |
| **Total** | **15,000** | **35,000** | |

## How "NASA" realistically works for a Swiss team

Honest framing for the pitch and for planning:

- **NASA does not buy from or fund a young non-US company directly** in the
  usual way. Its main programme for small companies (SBIR) is for US firms. NASA
  does sign **Space Act Agreements with foreign entities** (for example
  reimbursable agreements with the University of Zurich and The Exploration
  Company, Germany), usually with an established partner.
- **Switzerland is an ESA member.** The realistic first steps are ESA and Swiss
  programmes, then NASA through partners:
  - **ESA BIC Switzerland** (ESA and ETH Zurich): for space start-ups registered
    in Switzerland, younger than 5 years; currently about **EUR 200,000
    non-dilutive** funding over two years, plus coaching and network.
  - **Innosuisse** (Swiss innovation agency): innovation projects with a
    research partner (e.g. a university hospital or ETH/EPFL lab), start-up
    coaching.
  - **Swiss Space Office (SBFI)**: national space programme and ESA contacts.
  - **Analog stations** (Asclepios in Switzerland) as the first real field test.
  - **NASA later**, via Space Apps visibility, a university or industry partner,
    the ISS National Lab (through a US partner) or commercial stations.
- With ESA BIC funding (about CHF 190,000 over two years, i.e. about CHF 95,000
  a year), the **lean year-1 budget would still need about CHF 240,000** from
  founders, investors, Innosuisse or a partner.

## Not included

- Flight-qualified hardware (radiation tests, cooling, power budget, safety
  reviews): an agency or industry programme, not priceable from public data.
- Medical-device certification (see D).
- Salaries beyond the two developers (e.g. a medical advisor or flight-surgeon
  consultant, which a serious pilot will need: budget it as soon as there is a
  partner, roughly CHF 150–250 per hour).
- Years 2 and 3: plan at least the same people cost plus growth.

## 10-year outlook (planning model)

Ten years cannot be budgeted precisely; this is a planning model with stated
assumptions, based on the **recommended** year 1. The biggest decision is
whether Demify stays a research and training tool or becomes a certified
medical device.

**Assumptions (both paths):** salaries CHF 110,000 per developer, 2 % raise a
year, 20 % employer costs; a medical advisor (flight-surgeon or physician
consultant) from year 2, about CHF 40,000 a year; hardware refresh of both
DGX Spark units every 4 years (years 5 and 9); annual penetration test and
data-protection review; software licences stay CHF 0 (open source); 10 %
contingency every year; no inflation beyond the raises; no revenue or funding
subtracted.

### Path A: research and training tool (no medical certification)

Team: 2 developers, a third from year 3. Pilots at analog stations, then
integration with partners (ESA, commercial stations, NASA via partners).

| Year | Team | People | Hardware | Software | Security | Company/legal | Pilots/travel | **Total** | Cumulative |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 264,000 | 33,000 | 16,000 | 20,000 | 30,000 | 35,000 | **438,000** | 438,000 |
| 2 | 2 | 309,000 | 10,000 | 16,000 | 20,000 | 25,000 | 40,000 | **462,000** | 900,000 |
| 3 | 3 | 452,000 | 10,000 | 20,000 | 20,000 | 35,000 | 40,000 | **635,000** | 1,535,000 |
| 4 | 3 | 460,000 | 10,000 | 20,000 | 20,000 | 35,000 | 50,000 | **655,000** | 2,190,000 |
| 5 | 3 | 469,000 | 25,000 | 20,000 | 20,000 | 35,000 | 60,000 | **692,000** | 2,881,000 |
| 6 | 3 | 477,000 | 10,000 | 20,000 | 20,000 | 35,000 | 60,000 | **684,000** | 3,566,000 |
| 7 | 3 | 486,000 | 10,000 | 20,000 | 20,000 | 35,000 | 60,000 | **694,000** | 4,260,000 |
| 8 | 3 | 495,000 | 10,000 | 20,000 | 20,000 | 35,000 | 60,000 | **704,000** | 4,963,000 |
| 9 | 3 | 504,000 | 25,000 | 20,000 | 20,000 | 35,000 | 60,000 | **730,000** | 5,694,000 |
| 10 | 3 | 513,000 | 10,000 | 20,000 | 20,000 | 35,000 | 60,000 | **724,000** | 6,418,000 |

**10 years: about CHF 6.4 million**, about CHF 640,000 a year on average.

### Path B: certified medical product (EU MDR)

Team: 2 developers; from year 3 a quality and regulatory engineer and a third
developer; from year 6 a fourth developer and a business/partnerships lead;
from year 8 a clinical support person. Years 3 to 5: ISO 13485 quality system,
technical documentation, clinical evaluation and notified-body certification
(software of this kind is typically class IIa or higher under MDR Rule 11),
budgeted at CHF 150,000 / 250,000 / 150,000; from year 6 about CHF 75,000 a
year for surveillance audits, post-market surveillance and penetration tests.

| Year | Team | People | Hardware | Software | Certification/security | Company/legal | Pilots/travel | **Total** | Cumulative |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 264,000 | 33,000 | 16,000 | 20,000 | 30,000 | 35,000 | **438,000** | 438,000 |
| 2 | 2 | 309,000 | 10,000 | 16,000 | 20,000 | 25,000 | 40,000 | **462,000** | 900,000 |
| 3 | 4 | 602,000 | 10,000 | 24,000 | 150,000 | 35,000 | 40,000 | **947,000** | 1,847,000 |
| 4 | 4 | 613,000 | 10,000 | 24,000 | 250,000 | 35,000 | 50,000 | **1,080,000** | 2,927,000 |
| 5 | 4 | 625,000 | 25,000 | 24,000 | 150,000 | 35,000 | 60,000 | **1,010,000** | 3,938,000 |
| 6 | 6 | 941,000 | 10,000 | 32,000 | 75,000 | 45,000 | 60,000 | **1,279,000** | 5,217,000 |
| 7 | 6 | 959,000 | 10,000 | 32,000 | 75,000 | 45,000 | 60,000 | **1,299,000** | 6,516,000 |
| 8 | 7 | 1,115,000 | 10,000 | 36,000 | 75,000 | 45,000 | 60,000 | **1,475,000** | 7,991,000 |
| 9 | 7 | 1,137,000 | 25,000 | 36,000 | 75,000 | 45,000 | 60,000 | **1,515,000** | 9,507,000 |
| 10 | 7 | 1,159,000 | 10,000 | 36,000 | 75,000 | 45,000 | 60,000 | **1,523,000** | 11,030,000 |

**10 years: about CHF 11 million**, about CHF 1.1 million a year on average.

### Reading the outlook

- People are 70–85 % of every year. Hardware stays small (two refreshes in ten
  years), software licences stay at zero.
- Path B costs about CHF 4.6 million more and only makes sense with a
  medical market on Earth too (remote and extreme-environment care, e.g.
  research stations, ships, expeditions), not for spaceflight alone.
- Not in the model: flight qualification of hardware (paid by an agency or
  industry partner within a mission), revenue, investor money, grants (ESA BIC
  about EUR 200,000 over two years; Innosuisse; later ESA or national
  programmes), office rent (assumed coworking or university space), salary
  levels beyond 2 % a year.
- Treat years 4–10 as an order of magnitude: re-plan every year.

## Sources

- DGX Spark price: [pi3g](https://pi3g.com/nvidia-dgx-spark-price/), [openclawdc](https://openclawdc.com/blog/dgx-spark-price-every-gb10-box/), [enverge](https://spark.enverge.ai/blog/nvidia-dgx-spark-price)
- NVIDIA AI Enterprise: [NVIDIA licensing guide](https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html), [pi3g](https://pi3g.com/nvidia-ai-enterprise-subscription-cost-in-2026/), [SHI listing](https://www.publicsector.shidirect.com/product/51044714/NVIDIA-AI-Enterprise-for-DGX-Spark)
- Swiss social security 2026: [Swissmem](https://www.swissmem.ch/de/wissen/personalwesen/arbeitsrecht/sozialversicherungsbeitraege-2026.html), [PostFinance](https://www.postfinance.ch/de/blog/business-blog/wie-sie-personalkosten-richtig-kalkulieren.html), [pfeffersack.ch](https://pfeffersack.ch/tools/lohnkosten-rechner)
- ESA BIC Switzerland: [SBFI](https://www.sbfi.admin.ch/sbfi/en/home/research-and-innovation/space/informations-for-experts/space-developments/esa-bic-ch.html), [Startupticker](https://startupticker.ch/en/news/esa-bic-switzerland-extends-support-for-spacetech-for-another-five-years), [Venturelab](https://www.venturelab.swiss/ESAbic)
- NASA Space Act Agreements with foreign entities: [NASA SAA guide](https://arpa-h.gov/sites/default/files/2025-02/NASA%20Space%20Act%20Agreements%20Guide%20-%20Dec%202023.pdf), [NASA international agreements report](https://www.nasa.gov/wp-content/uploads/2026/10/ntaa-international-09-30-2026.pdf)
- Docker terms: [docker.com](https://www.docker.com/legacy-pricing)
- Accessory, service, insurance and travel figures: typical Swiss market ranges (estimate).
