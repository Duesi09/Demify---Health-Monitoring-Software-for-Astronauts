# Demify: Business Model (version 2.1, reality-checked)

Draft for the NASA Space Apps pitch, 15 November 2026. Version 1 was checked by five independent reviewers against real sources: astronaut numbers, the Earth market, prices, costs and regulation, funding and open source. This version keeps what held up and fixes what did not. Numbers marked **estimate** are ours; everything else has a source at the end.

## What changed from version 1

| Version 1 said | The check found | Version 2 says |
|---|---|---|
| "Decision support, not a medical device" | Under EU and Swiss rules, software that rates vital signs and says when to call a doctor **is** medical device software, likely class IIb | "Research prototype, not a certified medical device." Certification is planned and budgeted (section 5) |
| 0 to 4 astronauts in 2027 | No realistic path | 0 astronauts; 10 to 20 crew members in Swiss and US analog missions |
| Remote patient monitoring, a $28 billion market | Different buyers, misleading | Bottom-up count of real buyers: a niche worth a few million CHF a year |
| "Space proves it, Earth pays" | Order and money are reversed: Earth analogs come first, agencies and grants pay first | "Designed for space crews, to be piloted first with crews on Earth" |
| CHF 40 per person per month to many small sites | Buyers are a few large organisations; they buy per programme and take about a year to sign | Paid pilots and agency contracts first; per-site licences only after certification |
| Venture Kick CHF 150,000 as grant | CHF 10,000 grant, then CHF 140,000 as convertible loans | Shown as financing, with a base case and a funded case |
| (v2.1) ESA money counted in CHF in the funded case | ESA BIC must not be converted to CHF; Swiss participation in ESA Kick-Start is unconfirmed | Funded case shown without ESA money; ESA BIC named separately in EUR |
| Break-even at 18 sites by year 4 | Ignored ramp-up, regulation, and that 18 sites is half of all year-round Antarctic stations | No break-even within 3 years; honest plan in section 7 |

---

## 1. The honest starting point

- Between **21 and 28 people a year** reach orbit (21 in 2023, 28 in 2024, 28 in 2025, about 21 in 2026 by our count).
- Only about **10 people** are in orbit at any moment: 7 on the ISS and 3 on China's Tiangong. The record is 19, in September 2024.
- The real buyers are not astronauts but **6 to 10 operators** worldwide (agencies and commercial station companies).

So astronauts are our **proving ground and our credibility**, not our revenue. Our line:

> **Designed for space crews, to be piloted first with crews on Earth.**
> Analog missions and polar stations are where we prove it. Agencies and research grants fund it. Remote-medicine providers take it to paying Earth sites later.

---

## 2. How many astronauts can we serve?

The software has no technical limit. The limit is adoption, and adoption follows evidence.

| Year | People reaching orbit | Demify users |
|---|---|---|
| **2027** | about 25 to 35 (**estimate**: depends on Ax-5, Vast's ISS mission and Artemis III flying on time) | **0 astronauts.** **Target, only if our proposal is accepted: 10 to 20 analog crew members** in Asclepios VII (Swiss lunar analog, summer 2027, crews of 6 to 10; call for projects open since 26 October 2026). The Mars Desert Research Station only through a crew whose home institution provides ethics review |
| **2028 to 2029** | | **Goal:** a first in-flight research demonstration through a Swiss partner with ISS experience (BIOTESC at HSLU, ESA's Swiss operations centre; or the UZH Space Hub) |
| **2030 to 2035** | about 30 to 80 (**estimate**; no published forecast exists) | **4 to 10 astronauts a year** if one operator uses Demify on its missions |
| **2040 onwards** | | **10 to 30 a year**: a vision, not a forecast |

A realistic benchmark: Hexoskin was founded in 2006, won its first Canadian Space Agency contract in 2011, and its Astroskin shirt has been in use on the ISS since January 2019. That is about 12 years.

---

## 3. The Earth market

### Who really buys

| Segment | Real buyer | Size | Note |
|---|---|---|---|
| **Analog missions and polar research** | Research teams, paying from grants | Asclepios, MDRS, the ESA research doctor who winters at Concordia every year | **Our first segment.** They already measure mood, sleep and vital signs |
| **Antarctic stations** | 34 national Antarctic programmes and their medical contractors | About 1,100 people in winter, 4,400 to 5,000 in summer | Some programmes already run their own health records (Australia uses Intrahealth Profile) |
| **Offshore oil, gas and wind** | Operators, through medical service providers | UK alone: about 24,000 full-time-equivalent offshore workers (2025) | International SOS supports more than 900 remote and isolated locations |

### How big it is (bottom-up)

At CHF 40 per person per month and 100 % market share (both **estimates**):
- **All of Antarctica:** about 27,000 to 29,000 person-months a year, so about **CHF 1.1 million a year**.
- **UK offshore:** 24,000 × 12 × 40 = about **CHF 11.5 million a year**.

That is an honest **niche worth a few million CHF a year**, not a billion-dollar market. It can carry a small, specialised company if a channel partner (a remote-medicine provider) sells it with its services.

### What the Earth version still needs

- **Site profiles.** At Concordia (3,200 m altitude) night-time blood oxygen of 85 to 88 % is normal. Today Demify would call that critical. Each site needs its own thresholds.
- **Earth roles.** Station doctor, offshore medic and topside doctor instead of crew medical officer and flight surgeon.
- **The space-only features** (space weather, NASA mission data) are not part of the Earth offer.

---

## 4. Competitors and where we are different

| Who | What they do | How Demify differs |
|---|---|---|
| **Hexoskin / Astroskin** (Canadian Space Agency) | Smart shirt recording ECG, breathing, blood pressure and oxygen; on the ISS since 2019 | Hardware that sends data to scientists on the ground. Demify is the software layer that rates and explains the data on board |
| **Oura ring with Booz Allen** (Ax-4, 2025) | A demo that processed ring data on the station without Oura's cloud; no results published | Personal-baseline wellness scores from one device. Demify takes readings from any device or gateway that can POST its JSON and adds symptoms, radiation and sourced thresholds |
| **NASA and Google's medical assistant (CMO-DA)** | AI that answers symptom questions, tested on simulated cases; offline in ground tests since June 2026 | Answers once something already hurts. Demify rates readings as they arrive, and every rule can be checked line by line |
| **Philips Tempus IC2** | Vital-sign monitor with telemedicine for non-medical users at sea, in the air and in remote areas | A device for acute care. Demify tracks slow changes over weeks |
| **International SOS, RMI** | Remote medical services and telemedicine for industrial and remote sites | Service providers: **partners and sales channel**, not competitors |
| **TrialX** (Fram2 mission, 2025) | Collects wearable data for research on private spaceflights | Research data collection. Demify turns the data into actions for the crew |

**Our position:** an open layer that sits on top of existing devices and services. Personal baselines already exist elsewhere (Apple, Oura). What we combine: a visible source tag on every threshold, escalation that adapts to the delay to Earth, and offline operation in one open tool.

---

## 5. Regulation: the part version 1 got wrong

- **The law.** Under EU MDR Rule 11, which Switzerland applies through its Medical Devices Ordinance, software that provides information used for diagnosis or treatment decisions is at least class IIa. Software that monitors vital signs where a change could mean immediate danger is class IIb. An output for a critical situation, such as a possible heart attack, can be class III.
- **What decides it** is the intended purpose: what the maker says the software does, including in the pitch and the user interface.
- **Today** Demify is a free research prototype that is not placed on the market. That is defensible.
- **Wording to change now:** "Research prototype, not a certified medical device. Not for clinical use." Drop "not a medical device", and remove any drug doses from the advice texts.

### Our path

| Phase | What | Rules |
|---|---|---|
| 1 | Crew health log and integration platform: data, trends, no medical interpretation | Research prototype, not a certified medical device; likely outside the MDR if it truly gives no medical interpretation |
| 2 | The triage engine tested in analog missions | Under ethics approval (Swiss Human Research Act) |
| 3 | The triage module certified with a clinical partner | Quality system (ISO 13485), software lifecycle (IEC 62304), risk management (ISO 14971), usability (IEC 62366-1), health-software security (IEC 81001-5-1); class IIa to IIb, possibly III for cardiac escalation; cost and duration only from notified-body quotes |

Also needed:
- **EU authorised representative.** Since the EU-Swiss agreement on medical devices lapsed in May 2021, a Swiss maker needs one to sell in the EU.
- **Data protection.** Health data is sensitive data under the Swiss Data Protection Act; research with identifiable health data also falls under the Human Research Act (pseudonymised is not anonymised). The GDPR applies only if people located in the EU are monitored. Each site needs an impact assessment and data-processing agreements.

---

## 6. What NASA gets

| Flipchart arrow | Our answer |
|---|---|
| **Image** | An open, checkable research and training tool, built by students on NASA open data, is a positive story. (Do not link Demify to the January 2026 Crew-11 medical return: the condition is undisclosed.) |
| **Value** | Crew time is so scarce that NASA charges commercial users about USD 130,000 per hour of it (2021 price list). Demify must replace parts of existing health checks, not add to them; we will measure the minutes it costs in an analog mission. We do **not** claim savings yet |
| **Students** | Open source: students can read, use and improve it. We are two students who built it in a weekend |
| **Cost** | NASA pays nothing and can use it today. With NASA we seek a collaboration without money changing hands (data, feedback from flight surgeons). Paying space customers are on the European side, through Switzerland's ESA membership |

---

## 7. Money

### Revenue, in order of how realistic it is

| # | Stream | Who pays | Size |
|---|---|---|---|
| 1 | **Agency and research contracts** | ESA (for example a Kick-Start feasibility study: 75 % funded, up to EUR 75,000; Swiss participation to be checked), Swiss Space Office, research partners | The proven path: Hexoskin was built on Canadian Space Agency contracts |
| 2 | **Paid research pilots** | Analog missions and polar research projects, from their grants | CHF 5,000 to 15,000 per study (**estimate**) |
| 3 | **Integration and support** | Programmes that host Demify themselves | Per programme, not per head |
| 4 | **Site licences** (only after certification) | Through remote-medicine providers | Tiers of about CHF 6,000 to 15,000 per site a year (**estimate**) |

Price benchmarks: software-only remote monitoring is sold at about USD 5 to 15 per patient per month; the US Medicare device code pays about USD 47 a month; maritime telemedicine costs about USD 4,000 per ship a year (company claim). One medical evacuation flight from McMurdo cost about USD 286,000. **A site licence costs a few percent of one evacuation flight.**

### Funding available in Switzerland

| Programme | What it really is | In our plan |
|---|---|---|
| **Venture Kick** | Stage 1: CHF 10,000 grant. Stages 2 and 3: CHF 40,000 and CHF 100,000 as convertible loans. A jury at every stage | Stage 1 in the base case; stages 2 and 3 only in the funded case, as financing |
| **ESA BIC Switzerland** | Up to EUR 200,000 over two years for a Swiss company less than 5 years old with a space connection; 4 to 6 start-ups per round | Not counted in the tables below; named separately in EUR (31 Oct 2026 cut-off passed) |
| **Innosuisse innovation project** | Pays the research partner (university or hospital), not us; we add our own share | The medical validation; not counted as income |
| **Swiss Polar Institute exploratory grants** | Up to CHF 75,000 for Swiss polar and high-altitude research | For a polar pilot with a research partner |

A Swiss GmbH needs CHF 20,000 of paid-in capital at founding.

### Three-year plan (CHF, all **estimates**)

Assumptions:
- Founders part-time while studying in year 1 (CHF 2,000 a month each), then CHF 4,000. Employer contributions add 15 %.
- A medical advisor at 20 % from year 2 (CHF 36,000 a year).
- A regulatory strategy in year 1, and the start of the quality system in year 3. Certification itself comes after year 3, with a seed round.
- 10 % contingency.

**Costs**

| Item | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Founders | 55,200 | 110,400 | 110,400 |
| Medical advisor | | 36,000 | 36,000 |
| Regulatory (strategy, then quality system) | 5,000 | 10,000 | 60,000 |
| Ethics approval, pilots, sensors | 5,000 | 15,000 | 15,000 |
| Security testing | | 15,000 | 20,000 |
| Liability insurance | | 5,000 | 10,000 |
| Company, accounting | 5,000 | 5,000 | 6,000 |
| Hosting and tools | 1,000 | 3,000 | 5,000 |
| Travel and conferences | 3,000 | 8,000 | 10,000 |
| Contingency (10 %) | 7,400 | 20,700 | 27,200 |
| **Total** | **81,600** | **228,100** | **299,600** |

**Money in**

| Item | Base case Y1 | Y2 | Y3 | Funded case Y1 | Y2 | Y3 |
|---|---|---|---|---|---|---|
| Venture Kick stage 1 (grant) | 10,000 | | | 10,000 | | |
| Venture Kick stages 2 and 3 (convertible loans) | | | | 40,000 | 100,000 | |
| Paid research pilots | | 20,000 | 36,000 | | 20,000 | 36,000 |
| Integration and support | | | 20,000 | | | 20,000 |
| **Total** | **10,000** | **20,000** | **56,000** | **50,000** | **120,000** | **56,000** |

Not counted: **ESA BIC Switzerland**, up to EUR 200,000 over two years if selected (needs a Swiss company under 5 years; shown in EUR, never converted), and an **ESA Kick-Start** feasibility study (75 % funded, we co-fund 25 %; Swiss participation being checked with SERI).

**Result over three years**

| | Base case | Funded case |
|---|---|---|
| Money in | 86,000 | 226,000 |
| Costs | 609,300 | 609,300 |
| **Gap** | **−523,300** | **−383,300** |

What this means:
- **Without the programmes**, Demify cannot pay two people full time. It stays a part-time research project, which is fine for year 1.
- **With Venture Kick**, the gap is still about CHF 380,000, and CHF 140,000 of the money in is loans. ESA BIC (up to EUR 200,000 if selected) would close a large part; the rest needs a small seed round or lower salaries in year 3.
- **Sustainable income** starts only after certification, through site licences sold with a remote-medicine provider. We say this openly.

---

## 8. Open source, done properly

- **Licence:** keep **MIT** now on every branch (it is already published). Apache 2.0 adds a patent grant that companies and agencies prefer; switch later only with every contributor's consent.
- **What stays ours:** the name (register "Demify" as a trademark; forks must rename), the validated and documented threshold library, the certified build, and being the maintainers.
- **Why open:** flight surgeons and agencies can check every rule. That trust is the reason they would use a tool from two students at all.
- **Precedents:** Libre Space Foundation started with prize money and won a EUR 2 million ESA contract.

---

## 9. Business Model Canvas

| Block | Demify |
|---|---|
| **Customer segments** | First: research teams running studies of isolated crews (analog missions, polar winter-over research). Next: national polar programmes and their medical contractors. Then: offshore through medical service providers. Space: ESA and commercial operators as research partners |
| **Users / deciders / payers** | User: crew member and station doctor or medic. Decider: research lead or programme chief medical officer. Payer: research grant or programme budget |
| **Customer need** | Crews far from a doctor need to notice slow health changes early and know what to do. In space the delay to Earth makes this harder; on Earth a lone doctor needs structured daily data for everyone |
| **Value proposition** | Rates each value against sourced thresholds and the person's own baseline, and adapts who to call and when to the distance to help; open and checkable; works offline; any device or gateway that can POST its JSON; self-hosted |
| **Channels** | Space Apps and its juries; Asclepios and MDRS; Swiss space partners (BIOTESC, UZH Space Hub); ESA; later remote-medicine providers |
| **Customer relationships** | Close research partnership in pilots; open-source community; support contracts for programmes |
| **Revenue streams** | Agency and research contracts; paid pilots; integration and support; site licences after certification |
| **Key activities** | Software; maintaining the threshold library; pilots under ethics approval; the regulatory path |
| **Key resources** | The open engine and its sourced thresholds; tests and pipeline; the team; the trademark |
| **Key partners** | A space medicine advisor; a Swiss university or hospital for validation; device makers; analog missions and polar programmes; NASA and NOAA open data |
| **Cost structure** | People, medical advisor, regulatory, pilots, security, insurance (section 7) |

---

## 10. Hard questions and honest answers

| Question | Answer |
|---|---|
| "Only about 20 to 30 people fly per year. Where is the business?" | Astronauts give us credibility, not revenue. We prove it with analog and polar crews; agencies and research grants fund the first years; remote-medicine providers sell it to Earth sites after certification |
| "Is it a medical device?" | Its triage functions would be, class IIa to IIb, possibly III for cardiac escalation, to be confirmed with a notified body. Today it is a research prototype, not a certified medical device, and not on the market. Our plan has a phase without medical interpretation, then pilots under ethics approval, then certification |
| "Why would NASA trust two students?" | It is open: every rule names its source and can be checked. And we do not ask for trust first; we start with analog missions |
| "If it's free, how do you survive?" | Contracts and pilots first, then certified site licences. The code is open; the name, the validated library and the certified build are ours |
| "Are the vital signs real?" | The NASA data and the space weather are real. Vital signs are simulated until a device is connected, and labelled so |
| "How are you different from Hexoskin or Oura?" | They are devices. We are the open layer that rates the data against sourced thresholds and each person's own baseline and shows who should act; the commander and the crew member decide |
| "What do you need next?" | A space medicine advisor, a place in Asclepios VII, and a Swiss research partner |

How much time to give this in the pitch: about one slide, around 15 to 20 % of the talk, framed as impact and sustainability. Keep the canvas and the three-year table as backup for questions.

---

## Sources

People in orbit and stations
- [2024 in spaceflight](https://Www.Wikipedia.org/wiki/2024_in_spaceflight), [2025 in spaceflight](https://www.wikiwand.com/en/articles/2025_in_spaceflight), [2023 in spaceflight](https://www.wikiwand.com/en/articles/2023_in_spaceflight)
- [Record of 19 people in orbit](https://www.guinnessworldrecords.com/world-records/775645-most-people-in-orbit-at-the-same-time)
- [Haven-1 delayed to 2027](https://payloadspace.com/vast-delays-haven-1-launch-to-2027/), [Artemis overhaul](https://www.livescience.com/space/space-exploration/nasa-announces-sweeping-overhaul-of-artemis-return-to-moon-targeting-a-2028-landing-and-a-2027-in-orbit-docking-flight), [Artemis III summer 2027](https://newspaceeconomy.ca/2026/10/24/nasa-targets-summer-2027-artemis-iii-launch-and-year-end-sls-tanking-test/?amp=1)

Analog missions and Swiss partners
- [Asclepios VII call for projects](https://asclepios.ch/collaborate-science-projects/), [Asclepios crews](https://en.wikipedia.org/wiki/Asclepios_Project)
- [Mars Desert Research Station](https://wikipedia.com/wiki/Mars_Desert_Research_Station)
- [BIOTESC](https://en.wikipedia.org/wiki/BIOTESC), [UZH Space Hub](https://news.uzh.ch/en/articles/2020/UZH-Space-Hub.html)
- [ESA research doctor at Concordia](https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/Isolation_studies_in_Antarctica)

Earth market and competitors
- [COMNAP: 34 national programmes](https://www.comnap.aq/our-story)
- [HSE offshore statistics 2025](https://www.hse.gov.uk/offshore/assets/docs/hsr2025.pdf)
- [International SOS response centres](https://www.internationalsos.com/services/workplace-solutions/response-centres), [RMI Access](https://www.powermag.com/press-releases/remote-medical-international-launches-rmi-access-telemedicine-and-case-management-for-industrial-environment-across-the-united-states)
- [Philips Tempus IC2](https://www.philips.com/healthcare/solutions/emergency-care-resuscitation/remote-monitoring)
- [Concordia blood oxygen at altitude](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.819345/pdf)
- [Australian Antarctic health records](https://www.scoop.co.nz/stories/GE1910/S00102/digital-health-taken-to-the-extreme.htm)
- [Astroskin (CSA)](https://www.csa-asc.gc.ca/eng/sciences/astroskin.asp), [Hexoskin's first CSA contract](https://www.hexoskin.com/blogs/news/hexoskin-lands-2-4m-space-medicine-contract)
- [TrialX on Fram2](https://trialx.com/facilitating-health-research-data-collection-for-the-first-human-spaceflight-to-earths-polar-regions-fram2/)

Prices
- [Remote monitoring software prices](https://www.mindbowser.com/cost-of-remote-patient-monitoring/), [Medicare remote monitoring codes 2026](https://www.healthrecoverysolutions.com/blog/2026-rpm-and-ccm-reimbursement-codes-and-payment-updates)
- [Maritime telemedicine per ship](https://www.marinelink.com/news/maritime-future-care424443)
- [McMurdo evacuation flight cost](https://www.medindia.net/news/an-expensive-medical-evacuation-of-286000-to-save-man-with-broken-jaw-31174-1.htm)

Regulation
- [MDR Rule 11 explained](https://www.johner-institute.com/articles/regulatory-affairs/mdr-rule-11-software/)
- [MDCG 2019-11 revision 1](https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en)
- [Swissmedic: classification under MedDO](https://www.swissmedic.ch/swissmedic/en/pomz/produktkonformitaet-mepv.html)
- [Notified-body review times](https://medicaldevices.ipn.pt/en/new-ec-survey-reveals-slow-progress-in-mdr-and-ivdr-certifications/), [MDR compliance costs](https://www.megacert.net/blog/mdr-compliance-cost)
- [COCIR on Rule 11 and critical situations](https://www.cocir.org/wp-content/uploads/COCIR-Position-Paper-EU-MDR-Targeted-Revision-Classification-Rule-11_FINAL-.pdf)

Funding
- [Venture Kick stages](https://www.entrepreneurship.zhaw.ch/en/resources/venture-kick), [Venture Kick application](https://venturekick.ch/appform)
- [ESA BIC Switzerland requirements](https://www.entrepreneurship.zhaw.ch/en/resources/esa-business-incubator-centre-switzerland), [recent ESA BIC rounds](https://startupticker.ch/en/news/four-startups-selected-for-esa-bic-switzerland)
- [ESA Kick-Starts](https://business.esa.int/funding/direct-negotiation-kick-starts)
- [Swiss Polar Institute exploratory grants](https://swisspolar.ch/spi-funding-instruments/spi-exploratory-grants/)
- [Libre Space Foundation and ESA](https://satnews.com/2023/07/20/libre-space-foundations-2-million-euros-phasma-project-with-esa-for-development-of-three-open-source-cubesats/)

NASA
- [First ISS medical evacuation](https://www.npr.org/2026/01/15/nx-s1-5677647/nasa-spacex-crew-11-splashdown-return)
- [ISS crew time price](https://directory.eoportal.org/other-space-activities/iss-pricing)

Method: Business Model Canvas by Strategyzer.
