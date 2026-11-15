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

## Sources

- DGX Spark price: [pi3g](https://pi3g.com/nvidia-dgx-spark-price/), [openclawdc](https://openclawdc.com/blog/dgx-spark-price-every-gb10-box/), [enverge](https://spark.enverge.ai/blog/nvidia-dgx-spark-price)
- NVIDIA AI Enterprise: [NVIDIA licensing guide](https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html), [pi3g](https://pi3g.com/nvidia-ai-enterprise-subscription-cost-in-2026/), [SHI listing](https://www.publicsector.shidirect.com/product/51044714/NVIDIA-AI-Enterprise-for-DGX-Spark)
- Swiss social security 2026: [Swissmem](https://www.swissmem.ch/de/wissen/personalwesen/arbeitsrecht/sozialversicherungsbeitraege-2026.html), [PostFinance](https://www.postfinance.ch/de/blog/business-blog/wie-sie-personalkosten-richtig-kalkulieren.html), [pfeffersack.ch](https://pfeffersack.ch/tools/lohnkosten-rechner)
- ESA BIC Switzerland: [SBFI](https://www.sbfi.admin.ch/sbfi/en/home/research-and-innovation/space/informations-for-experts/space-developments/esa-bic-ch.html), [Startupticker](https://startupticker.ch/en/news/esa-bic-switzerland-extends-support-for-spacetech-for-another-five-years), [Venturelab](https://www.venturelab.swiss/ESAbic)
- NASA Space Act Agreements with foreign entities: [NASA SAA guide](https://arpa-h.gov/sites/default/files/2025-02/NASA%20Space%20Act%20Agreements%20Guide%20-%20Dec%202023.pdf), [NASA international agreements report](https://www.nasa.gov/wp-content/uploads/2026/10/ntaa-international-09-30-2026.pdf)
- Docker terms: [docker.com](https://www.docker.com/legacy-pricing)
- Accessory, service, insurance and travel figures: typical Swiss market ranges (estimate).
