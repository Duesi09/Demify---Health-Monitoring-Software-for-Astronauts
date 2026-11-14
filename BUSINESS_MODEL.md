# Demify: Business Model

Draft for the NASA Space Apps pitch, 15 November 2026. It answers the mentor's flipchart: how many astronauts we can serve, who else can use it, costs and revenue, what NASA gets out of it, and the Business Model Canvas.

Numbers marked **estimate** are ours. Everything else has a source at the end.

---

## 1. The honest starting point

About **28 people a year** fly to orbit (28 in 2024, 28 in 2025). That is far too small a market to pay for a company on its own.

So our model is:

> **Space is where we prove it. Earth is where it pays.**
> If it works for a crew 20 light-minutes from a doctor, it works on an Antarctic station, an offshore rig or an expedition.

That is also our answer to "why open source": the astronaut market is too small to sell licences into. Openness gets Demify adopted and trusted, and the money comes from services and Earth customers.

---

## 2. How many astronauts can we serve per year?

The software itself has no limit: one container per vehicle or station, any crew size. The real limit is how many operators adopt it.

| Year | People flying to orbit per year | Where they fly | Demify users (our target) |
|---|---|---|---|
| **2027** | about 30 to 40 (**estimate**; 28 in 2025) | ISS, Tiangong, private missions, Artemis III (a crewed test in Earth orbit, planned for mid-2027), first commercial station modules (Axiom, Vast, 4 crew each) | **0 to 4** astronauts, plus **10 to 30 people in ground analog missions** (Mars simulations, Antarctic stations) as pilots |
| **2035** | about 50 to 80 (**estimate**) | ISS retired around 2030; several commercial stations (4 to 10 crew each); lunar landings from 2028 on, roughly one every 10 months | **10 to 30** astronauts: one commercial station operator or one agency programme |
| **2050** | a few hundred (**estimate**, very uncertain) | Lunar surface bases, first Mars crews, commercial stations | **Every long-duration crew is a potential user.** Mars crews need autonomy most |

How to say it in the pitch: "Our software scales to any crew size. Our adoption target is one commercial station operator by 2035."

---

## 3. Who can use it on Earth? How big is the market?

The same problem exists wherever people live and work far from a doctor.

| Segment | Size | Why they need Demify |
|---|---|---|
| **Antarctic research stations** | 70 to 77 stations; about 1,100 people in winter, 4,400 to 4,900 in summer | No evacuation for months in winter; a small medical team; isolation and sleep problems |
| **Offshore oil and gas** | About 5,800 offshore helicopters worldwide, most serving oil and gas. In the Gulf of Mexico about 1,600 illness or injury calls a year on 102 rigs, 4 to 7 % needing air evacuation | A helicopter costs up to £4,500 an hour; most evacuations are for illness, not injury, which early detection could catch |
| **Expeditions, research vessels, remote mines, military posts** | Not sized yet | Same pattern: isolation, delay to care |
| **Remote patient monitoring (the wider market)** | About $28 billion in 2025, $51 to 57 billion by 2030 (analyst estimates, they vary widely) | Shows the direction; we target only the isolated-workforce niche |

Market sizing in three steps:

| Level | What it is | Size |
|---|---|---|
| Total market | Remote patient monitoring worldwide | about $28 billion (2025) |
| Reachable market | Health monitoring for isolated and extreme-environment crews | Not published; we build it bottom-up below |
| Our share by year 3 | **10 paying sites** (stations, rigs, analog habitats), **estimate** | see section 5 |

---

## 4. What does NASA get? (the flipchart arrows)

| Arrow on the flipchart | Our answer |
|---|---|
| **Image** | In January 2026 NASA carried out the first medical evacuation in ISS history: Crew-11 came home a month early. NASA's chief medical officer said the station lacks the capabilities of a hospital emergency room. Supporting an open tool that helps crews spot problems early is a visible, positive story |
| **Revenue / savings** | NASA prices one hour of crew time at **$130,000** (commercial price list, 2021). A routine health check that the app makes faster saves crew time; one avoided early return saves far more |
| **Win more good students** | Open source means students can read, use and improve it. Space Apps itself is that pipeline: we are two students who built this in a weekend |
| **Cost (the down arrow)** | NASA pays nothing to use the code. The cost for NASA is the integration work and validation by its flight surgeons, which is exactly what we offer as a service |

---

## 5. Costs and revenue

### Revenue streams (open source stays free)

| # | Stream | Who pays | How it is priced (**hypothesis**, to test) |
|---|---|---|---|
| 1 | **Integration** | Agencies, station operators | Project fee: connect Demify to their database and systems, through the built-in storage port and API |
| 2 | **Support and maintenance** | Every serious operator | Yearly contract with guaranteed response times |
| 3 | **Hosted Demify** | Earth sites (stations, rigs, analog habitats) | Monthly fee per crew member; we run it, they just use it |
| 4 | **Custom indicators and device connectors** | Operators with their own sensors | Per feature |
| 5 | **Grants and prizes** | Space and innovation programmes | Fund the early phase before customers (which programmes depends on the country we are in) |

Example, year 3 (**estimate**): 10 hosted sites with 30 people each, at $40 per person per month, is about **$144,000 a year**, plus integration and support contracts on top.

### Costs

| Cost | Size | Note |
|---|---|---|
| **People** | Largest cost | Two founders now; a developer and a medical advisor next |
| **Medical validation** | Large | Thresholds and advice must be signed off by flight surgeons and tested; a medical-device path (EU MDR or FDA) only if we go beyond decision support |
| **Security review** | Medium | Health data needs an external audit before real use |
| **Hosting and pipeline** | Small | The app runs as one container; the automatic checks run free for public repositories |
| **Travel, conferences, sales** | Small to medium | Analog missions and operators are a small, reachable community |

---

## 6. Business Model Canvas

The flipchart splits it into **backstage** (left: how we deliver), **value proposition** (centre), **customer need** (right), and **costs and revenue** (bottom).

| Block | Demify |
|---|---|
| **Customer segments** | 1. Space agencies and their flight medicine teams. 2. Commercial station operators and private mission providers. 3. Earth: Antarctic programmes, offshore operators, expeditions, analog habitats |
| **Customer need** | Crews far from a doctor must notice health problems early and know what to do, often with a delay to Earth or no contact at all |
| **Value proposition** | Crew self-assessment against NASA and clinical thresholds **and** each person's own baseline; clear action and escalation; works offline; real NASA data (OSDR, NOAA space weather); open and auditable; plugs into the operator's own systems. Decision support, not a medical device |
| **Channels** | Open-source repository; NASA Space Apps and its jury; pilots in analog missions and Antarctic stations; space medicine conferences; direct contact with operators |
| **Customer relationships** | Community for the open-source users; dedicated integration support for agencies; self-service for small sites |
| **Revenue streams** | Integration, support contracts, hosted version, custom connectors, grants (section 5) |
| **Key activities** (backstage) | Developing the software; maintaining the threshold knowledge base; validation with flight surgeons; integration projects |
| **Key resources** (backstage) | The assessment engine and its sourced knowledge base; the code base with its tests and pipeline; the team; the community |
| **Key partners** (backstage) | Flight surgeons and medical advisors; wearable and device makers; NASA OSDR and NOAA as data sources; analog habitats and polar programmes; universities |
| **Cost structure** | People, medical validation, security review, hosting, travel (section 5) |

---

## 7. Hard questions the jury may ask

| Question | Answer |
|---|---|
| "Only 30 people fly per year. Where is the business?" | On Earth. Space proves it; isolated workforces pay for it |
| "Why should NASA trust two students with health software?" | It is open: every rule and every threshold can be checked, and each threshold names its NASA or clinical source. It is decision support; flight surgeons stay in charge |
| "If it's free, how do you survive?" | Integration, support, hosting for Earth sites, and grants, the same model many open-source companies use |
| "Is it a medical device?" | Not today. It is decision support, and it says so. Becoming one is a later, separate step with a medical partner |
| "Are the vital signs real?" | The NASA data and the space weather are real. Vital signs are simulated until a device is connected, and the app labels them as simulated everywhere |
| "What do you need next?" | A flight surgeon or space medicine advisor, and one pilot site (an analog mission or a polar station) |

---

## Sources

- People in orbit per year: [2025 in spaceflight](https://en.wikipedia.org/wiki/2025_in_spaceflight), [2024 in spaceflight](https://en.wikipedia.org/wiki/2024_in_spaceflight) (Wikipedia summaries; 28 orbital travellers in each year)
- Artemis schedule: [Space.com](https://www.space.com/space-exploration/artemis/nasa-is-overhauling-its-artemis-program-what-does-that-mean-for-humanitys-return-to-the-moon), [Live Science](https://www.livescience.com/space/space-exploration/nasa-announces-sweeping-overhaul-of-artemis-return-to-moon-targeting-a-2028-landing-and-a-2027-in-orbit-docking-flight), [Aerospace America](https://aerospaceamerica.aiaa.org/nasa-eyeing-year-end-tanking-test-and-summer-2027-launch-for-artemis-iii/)
- Commercial stations: [Universe Today](https://www.universetoday.com/articles/the-future-of-space-stations-part-ii-commercial-space), [Freethink](https://freethink.com/space/new-space-station)
- First ISS medical evacuation: [NPR](https://www.npr.org/2026/01/15/nx-s1-5677647/nasa-spacex-crew-11-splashdown-return), [NASASpaceflight](https://www.nasaspaceflight.com/2026/01/crew-11-to-return-early-medical-astronaut/), [Space.com](https://www.space.com/space-exploration/human-spaceflight/nasa-reveals-the-astronaut-who-required-1st-medical-evacuation-from-the-international-space-station)
- ISS crew time price: [eoPortal: ISS pricing policy](https://directory.eoportal.org/other-space-activities/iss-pricing), [NASA LEO economy FAQ](https://www.nasa.gov/leo-economy/faqs)
- Antarctic stations: [CIA World Factbook](https://www.cia.gov/the-world-factbook/about/archives/2022/countries/antarctica/), [Wikipedia: Research stations in Antarctica](https://Www.Wikipedia.org/wiki/Antarctic_Station)
- Offshore: [Professional Pilot](https://propilotmag.com/offshore/), [NS Energy](https://www.nsenergybusiness.com/features/featuretransport-logistics-personnel/), [Gulf of Mexico study](https://www.curehunter.com/public/pubmed10127859.do)
- Remote patient monitoring market: [MarketsandMarkets](https://www.prnewswire.co.uk/news-releases/remote-patient-monitoring-market-to-hit-usd-56-94-billion-by-2030-with-12-7-cagr--marketsandmarkets-302375683.html), [Research and Markets](https://www.researchandmarkets.com/publication/mggilz8/4479452)
- Business Model Canvas: Strategyzer (strategyzer.com)
