# What Demify costs

State: 15 November 2026. Prices in US dollars as published, with a rough CHF
range (incl. Swiss VAT where noted). Hardware prices for the NVIDIA GB10 class
changed several times in 2026 (memory shortage): **get a current quote before
budgeting.** This is our estimate, not an offer.

## 1. Software licences: CHF 0

Every part Demify uses is open source or free to use. Demify itself is MIT.

| Part | Licence | Cost |
|---|---|---|
| Demify (this repository) | MIT | 0 |
| Next.js, React, Node.js, Tailwind CSS, Recharts, zod, lucide | MIT / ISC | 0 |
| IBM Plex fonts | SIL Open Font License | 0 |
| PostgreSQL | PostgreSQL License | 0 |
| pgvector | PostgreSQL License | 0 |
| Ollama (model server) | MIT | 0 |
| gpt-oss:20b / gpt-oss:120b (language models, DGX Spark) | Apache 2.0 | 0 |
| nomic-embed-text (embeddings) | Apache 2.0 | 0 |
| gemma3:4b / gemma3:1b (language models, laptop) | Gemma Terms of Use (free, with a prohibited-use policy) | 0 |
| Docker Engine (Linux, used on the DGX Spark) | Apache 2.0 | 0 |
| Docker Desktop (Windows/macOS laptops) | Free for personal use, education, and businesses under 250 employees **and** under USD 10 M revenue; larger organisations need a paid plan (Business about USD 24 per user and month) | 0 for us |
| DGX OS (on the DGX Spark) | Included with the hardware | 0 |
| Data: NOAA SWPC, NASA OSDR | Public data (US government / open science) | 0 |

There are no cloud fees: Demify runs entirely on local hardware and needs no
subscription. A switch to vLLM or TensorRT-LLM instead of Ollama would also be
free (Apache 2.0).

## 2. Hardware

### a) Demo / pitch: CHF 0

An existing laptop (16 GB RAM recommended, about 10 GB free disk). Answers take
10 to 25 s on a CPU; that is enough for a demo.

### b) Onboard server prototype (ground test): one NVIDIA DGX Spark

| Item | Price (published) | Rough CHF | Note |
|---|---|---|---|
| NVIDIA DGX Spark Founders Edition (GB10, 128 GB, 4 TB) | launched at USD 3,999 (Oct 2025), raised to USD 4,699 (Feb 2026); reported USD 6,950 since Oct 2026 | 6,000 – 8,500 | prices volatile, partly out of stock |
| or a partner GB10 system (ASUS, Dell, HP, Acer, …) | reported from about USD 3,000 – 6,000 | 3,500 – 7,000 | same chip; check memory and SSD size |
| Small UPS (uninterruptible power supply, ~500 VA) | | 100 – 250 | clean shutdown on power loss |
| External backup disk (2 TB) for `pg_dump` | | 80 – 120 | |
| Network switch / cables | | 30 – 80 | |
| **Total, one unit** | | **about 3,700 – 9,000** | |

Running cost: the Spark draws about 22 – 40 W idle and 60 – 200 W under load
(240 W power supply). At an average of 100 W around the clock that is about
876 kWh a year, **about CHF 260 a year** at CHF 0.30/kWh.

### c) Redundant setup (recommended for a real analog mission)

One box is a single point of failure (see docs/SPARK.md): a second unit as
standby with a PostgreSQL replica doubles the hardware, **about CHF 7,500 –
18,000** in total.

### d) Sensors for an analog pilot (e.g. Asclepios) — optional, per crew member

Consumer devices with data export, as a start for file import / bridge tests:

| Item | Rough CHF |
|---|---|
| Upper-arm blood pressure monitor with app/export | 70 – 150 |
| Pulse oximeter with Bluetooth | 40 – 100 |
| Chest-strap heart-rate sensor (ECG-grade, Bluetooth) | 70 – 100 |
| Smartwatch / actigraph (sleep, activity) | 150 – 400 |
| **Per crew member** | **about 330 – 750** |

For 4 crew: about CHF 1,300 – 3,000. These are not medical-grade
monitoring devices; Demify stays a research and training prototype.

## 3. Summary

| Scenario | One-off | Per year |
|---|---|---|
| Demo on a laptop (today) | CHF 0 | CHF 0 |
| Onboard server, one DGX Spark | ~CHF 3,700 – 9,000 | ~CHF 260 electricity |
| Analog pilot: Spark + UPS/backup + sensors for 4 crew | ~CHF 5,000 – 12,000 | ~CHF 260 |
| Redundant analog setup (2 Sparks) + sensors | ~CHF 9,000 – 21,000 | ~CHF 520 |

Software licences: CHF 0 in every scenario.

## 4. Not included

- **Flight hardware.** A space-qualified computer (radiation testing, ECC
  memory, liquid or conduction cooling, power budget, safety reviews and
  certification) cannot be priced from public data; it would be an agency or
  industry programme. On the ISS the realistic route is software on an existing
  approved crew laptop or a hosted payload, not a new box (see
  docs/research/iss-health-equipment.md).
- **Medical-device certification** (EU MDR), if Demify were ever used for
  clinical care: notified-body costs, clinical evaluation and quality system,
  typically far above the hardware cost.
- **People's time** (development, support) and travel to an analog site.

## Sources

- DGX Spark prices: [pi3g](https://pi3g.com/nvidia-dgx-spark-price/),
  [enverge](https://spark.enverge.ai/blog/nvidia-dgx-spark-price),
  [openclawdc](https://openclawdc.com/blog/dgx-spark-price-every-gb10-box/),
  [kevinwelter.com](https://kevinwelter.com/en/blog/dgx-spark-kaufen)
- DGX Spark power: [Tom's Hardware review](https://www.tomshardware.com/pc-components/gpus/nvidia-dgx-spark-review/4),
  [Tom's Hardware idle update](https://www.tomshardware.com/tech-industry/artificial-intelligence/nvidia-dgx-spark-update-cuts-idle-power-by-32-percent-or-more-hot-plug-detection-on-connectx-nic-makes-for-a-more-efficient-ai-workstation),
  [ServeTheHome](https://servethehome.com/nvidia-dgx-spark-review-the-gb10-machine-is-so-freaking-cool/4)
- Docker Desktop terms and prices: [docker.com legacy pricing](https://www.docker.com/legacy-pricing),
  [Capterra](https://www.capterra.com/p/148132/Docker/pricing/)
- Model licences: `ollama show --license <model>` (gpt-oss and
  nomic-embed-text Apache 2.0; Gemma Terms of Use), see docs/LOCAL-MODEL.md.
- Sensor and accessory prices: typical Swiss retail ranges (estimate).
