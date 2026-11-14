# Health monitoring systems: who does what, and where Demify is different

Research run on 14 November 2026: three researchers (space, extreme places on Earth, hospital and consumer), three fact-checkers that tried to disprove every entry, two idea generators and one judge.

**Read this first: verification limits.** A shared limit of web searches ran out during the run. The space and Earth lists were largely checked; the hospital and consumer list was **not** independently checked (marked "partly unconfirmed"), and the judge could not search. Treat every "partly unconfirmed" entry as a lead, not a fact.

## Space

| System | Maker | Status | Speciality | Checked |
|---|---|---|---|---|
| Bio-Monitor (Astroskin smart garment) | Canadian Space Agency (CSA). | In use on the ISS since January 2019, when David Saint-Jacques commissioned it. | Continuous physiology across many parameters from a single garment, including during sleep and exercise | confirmed |
| Bio-Analyzer | Canadian Space Agency. | Flown to the ISS on 17 April 2019 on a Northrop Grumman Cygnus cargo ship. | Lab results in orbit within hours instead of months | confirmed |
| ISS Crew Health Care System (CHeCS) and flight-surgeon medical operations | NASA (Johnson Space Center), together with the medical teams of the ISS partners | In operational use on the ISS. | A real clinical system with physicians in the loop, real medical hardware and a proven evacuation path | corrected |
| Crew Active Dosimeter (CAD) | NASA Space Radiation Analysis Group (SRAG) | Used in ISS crew operations since 2020, after a technology demonstration on the ISS. | Measured personal dose over time, now used beyond low Earth orbit | corrected |
| ADUM and ISS ultrasound with remote expert guidance (Ultrasound 2 / GE Vivid q, replaced by GE Vivid iq in 2025) | ADUM (Advanced Diagnostic Ultrasound in Microgravity): NASA funded the flight part and NSBRI the ground part | ADUM ran on the ISS in the 2000s | Diagnostic-quality imaging by non-experts. | corrected |
| ECHO (ultrasound operated from the ground) and EchoFinder-2 (ultrasound with augmented reality and AI) | CNES, supported by ESA, operated from CADMOS in Toulouse. | ECHO was installed in ESA's Columbus module in 2016 and first used by Thomas Pesquet in 2017 | The clearest flown example of moving from expert guidance on Earth to autonomy on board, for one task (imaging) | corrected |
| Butterfly iQ / iQ+ handheld ultrasound | Butterfly Network. | Flown and tested. | Low-cost whole-body imaging | confirmed |
| UltraSight AI guidance with GE Vscan Air (Rakia mission cardiac study) | UltraSight (Israel) with GE Healthcare (Vscan Air wireless probe). | Unclear. | AI-guided image capture by novices | partly unconfirmed |
| EveryWear | CNES, through its CADMOS centre, with MEDES (Institute for Space Medicine and Physiology), Inserm and the European Astronaut Centre | On the ISS since 2016 | The closest flown equivalent to Demify's crew logging: a self-reporting app on board, connected to wearables | corrected |
| Wearable Monitoring (MagIC-Space vest), with ESA's earlier CASPER | Italian Space Agency (ASI) experiment within its Futura mission, led by Fondazione Don Gnocchi (Milan). | Flown and finished: one astronaut, seven sleep recordings between January and June 2015 (mission days 53 to 192). | Unobtrusive monitoring of the heart and breathing during sleep, including heart mechanics | corrected |
| BEAT / SmartTex shirt (part of DLR's WICO2 wireless network on the ISS), with the SOLIS8 ground study | German Aerospace Center (DLR), with DSI Aerospace Technologie (sensors), Hohenstein Laboratories (shirt) and Bielefeld University. | Flown: Bielefeld University reported in July 2022 that Matthias Maurer took part during his Cosmic Kiss mission (November to May), wearing the shirt up to six times at two-week intervals. | Measuring heart mechanics with sensors woven into a T-shirt | confirmed |
| Russian-segment cardiovascular monitoring (Pulse/Pneumocard, Sonocard, Cardiovector, Cosmocard) and French-Russian Cardiomed | Institute of Biomedical Problems (IBMP, Moscow) for Roscosmos. | Pneumocard replaced 'Pulse' in March 2007. | Deep, long-running cardiovascular physiology, including ballistocardiography, with personal baselines from before flight | corrected |
| China Space Station (Tiangong) crew medical monitoring and telemedicine | China Manned Space Agency (CMSA) | In operational use. | A broad on-board clinic plus real-time telemetry to doctors on the ground | partly unconfirmed |
| Medical Data Architecture (MDA), NASA Exploration Medical Capability | NASA Exploration Medical Capability (ExMC) element, Human Research Program | Research prototype. | The data plumbing that later decision support relies on, including physiology and life-support data in one store | partly unconfirmed |
| Earth-Independent Medical Operations (EIMO) clinical decision support research, including NASA Ames' Autonomous Medical Operations (MDSS) | NASA ExMC / Human Research Program | Not independently re-checked. | Defines the problem Demify is built around: delays and no resupply or evacuation mean the crew must act on its own | partly unconfirmed |
| Crew Medical Officer Digital Assistant (CMO-DA) | NASA (Johnson Space Center), first built with Google (Vertex AI) | Not independently re-checked. | Conversational diagnostic reasoning over several types of input | partly unconfirmed |
| ARCHeR (Artemis Research for Crew Health and Readiness) | NASA Human Research Program, per the researcher. | Not independently re-checked. | Health monitoring on a crewed flight beyond low Earth orbit | partly unconfirmed |
| Oura Ring with on-board edge computing (Ax-4 crew readiness demonstration) | Booz Allen Hamilton, Axiom Space and Oura | Not independently re-checked. | Per the researcher, readiness feedback produced on board without the ground: the closest flown idea to Demify's 'fit for today's task' and offline design | partly unconfirmed |
| TRISH EXPAND research platform (TrialX), including the Ax-4 Telemetric Health AI (TESH) study | TRISH (Baylor College of Medicine) with TrialX (New York), per the researcher | Not independently re-checked. | Standardised research data collection across commercial missions | partly unconfirmed |
| rHEALTH ONE blood analyser | rHEALTH / DNA Medicine Institute | Not independently re-checked. | Lab tests from tiny samples on board | partly unconfirmed |
| Health Beyond Initiative and Connected Care Medical Module (C2M2) | Canadian Space Agency, with funded companies (per the researcher: Baune, Canadian Space Mining Corporation, CGI, Lunar Medical, Phyxable) | Not independently re-checked. | Pairs space medical autonomy with remote healthcare on Earth (dual use) | partly unconfirmed |

**What none of these systems does:**

- Escalation that adapts to delay: none of the verified systems changes what the crew should do first, or whom to call, based on the current signal delay to Earth.
- Crew-facing interpretation across indicators: no verified system automatically combines vital signs, symptoms, self-reported sleep, mood and stress, and environment into an on-board assessment with explicit escalation levels (self-care, CMO, flight surgeon).
- Published rule set with a source for each threshold: none of the verified systems publishes the thresholds it applies or names their sources, and none is released as open-source software an agency could audit or extend.
- Personal baseline shown to the crew: pre-flight baselines are routine in research (Cardiovector, Cosmocard and Pneumocard sessions before flight, BEAT before, during and after flight), but they are compared on the ground after the fact.
- Physiology together with life support for the crew: MDA Test Bed 1 already stored life-support simulator data alongside physiological data, so collecting both is not new.
- Radiation in the context of the whole person: the Crew Active Dosimeter gives time-resolved personal dose (ISS since 2020;
- Task-specific go/no-go: no verified system gives the crew a 'fit for this task' decision (spacewalk, piloting).
- Audit trail of advice given: no verified source describes an append-only, reviewable record of what the system told the crew and why.

## Extreme and remote places on Earth

| System | Maker | Status | Speciality | Checked |
|---|---|---|---|---|
| Tempus IC2 and Tempus Pro (telemedicine vital-signs monitors) | Designed by Remote Diagnostic Technologies (RDT, UK, founded 1997). | In operational use and sold commercially. | Lets trained non-medical crew capture clinical-grade data, including a 12-lead ECG, at the patient's side and send it to a doctor far away. | confirmed |
| MedLink ground-based medical advisory service, with the Digital Assessment Kit (DAK) | MedAire, part of the International SOS group | in operational use | Human expert judgement at scale, around the clock, backed by a very large in-flight case database. | partly unconfirmed |
| International SOS remote medical services (Response Centres, offshore Topside support, MedSites, digital consultations) | International SOS | in operational use | Global scale and a complete outsourced model: on-site medics plus remote doctors, escalation and evacuation logistics. | corrected |
| Remote Medical International (RMI), including RMI Access | Remote Medical International (Seattle). | in operational use (it recruited offshore-wind paramedics in 2026) | On-site medics combined with telemedicine and case management, to keep workers on site and avoid costly medevacs or referrals. | confirmed |
| CIRM (Centro Internazionale Radio Medico) and CIRM PREMIUM | CIRM, Rome, Italy (a non-profit foundation since 1950). | in operational use | Decades of experience giving medical advice at a distance to crews with no doctor, with measured evidence that it avoids diversions. | partly unconfirmed |
| UTMB Center for Polar Medical Operations (U.S. | University of Texas Medical Branch (UTMB Health), Galveston. | in operational use (since 2012 | Real expert care where evacuation can be impossible: in mid-winter no one can be flown out of the South Pole. | confirmed |
| GlobalMed Transportable Exam Station (TES) and Transportable Exam Backpack | GlobalMed (Scottsdale, Arizona) | in operational use | A complete examination room in a case that survives austere settings, with three ways to connect. | corrected |
| Equivital eq02+ LifeMonitor (including the intrinsically safe EX eq02+) | Equivital (UK) | in operational use | A chest-worn sensor with regulatory clearance | confirmed |
| Zephyr BioHarness with OmniSense software (Physiological Status Monitoring system) | Zephyr Technology, now Zephyr Performance Systems, part of Medtronic. | in operational use (OmniSense 5.1 cloud software is current | A NASA spinoff. | confirmed |
| Kenzen heat-stress monitoring system | Kenzen | in operational use according to launch and trade coverage. | Prediction and prevention of heat illness, with actions attached to alerts and protection of worker privacy. | confirmed |
| SlateSafety BAND V2 and BEACON V2 | SlateSafety | in operational use (sold through distributors such as SKC with paid portal access | Combines body data with workplace heat conditions to run work/rest cycles automatically. | partly unconfirmed |
| Bodytrak | Bodytrak (UK) | In operational use with industrial clients. | Measures core temperature and heart rate from the ear without a pill or chest strap. | corrected |
| Epicore Biosystems Connected Hydration | Epicore Biosystems (Cambridge, Massachusetts) | In operational use. | Molecular data from sweat (fluid and electrolyte loss), which ordinary wearables measuring heart rate and temperature cannot provide. | corrected |
| Heat Injury Prevention System (HIPS), formerly the USARIEM / MIT Lincoln Laboratory physiological status monitor | U.S. | In operational use in some military training, not fielded Army-wide. | Military algorithms validated by research and owned by the government, running on an open-architecture body network that needs no cloud. | corrected |
| RATE (Rapid Analysis of Threat Exposure) infection-prediction algorithm | Philips, with the U.S. | In advanced development and being rolled out among active-duty DoD personnel. | Machine-learning early warning days before symptoms, tested at scale on healthy service members wearing consumer devices. | corrected |
| BATDOK (Battlefield Assisted Trauma Distributed Observation Kit) | U.S. | Selected in 2022 by Joint Operational Medicine Information Systems (JOMIS) as the point-of-injury and en-route care solution for DoD operational medicine (announced at the July 2022 Defense Health IT Symposium). | Triage of several casualties at once and digital records in the field under combat conditions. | partly unconfirmed |
| 2B-Alert (app) and 2B-Alert Web 2.0 | U.S. | prototype or research (studies published in 2018 and 2022), as given by the researcher | Prediction personalised from the user's own reaction-time tests (researcher's claim, not re-checked) | partly unconfirmed |
| SAFTE-FAST fatigue model (Fatigue Avoidance Scheduling Tool) | Originally the U.S. | in operational use according to vendor claims (researcher's claim, not re-checked) | Prevents fatigue at the planning stage, before anyone flies (researcher's claim, not re-checked) | partly unconfirmed |
| Hexoskin smart shirt and Astroskin (tested in Antarctica) | Carré Technologies (Hexoskin), Montreal, with the Canadian Space Agency for Astroskin (researcher's claim, not re-checked) | flown or tested: per the researcher, Astroskin was field-tested on the XPAntarctik expedition in 2014 and later flew on the ISS, and Hexoskin is a commercial product (not re-checked) | Comfortable, continuous, multi-parameter monitoring built into clothing (researcher's claim, not re-checked) | partly unconfirmed |

**What none of these systems does:**

- Escalation that adapts to communication delay: every verified system assumes a human can be reached within seconds or minutes.
- A published, transparent rule set with a named source for each threshold: none of the verified systems publishes its decision rules.
- Cross-domain pattern detection: each verified wearable covers one hazard (heat: Kenzen, SlateSafety, HIPS, Bodytrak;
- Radiation: none of the verified systems tracks radiation dose or space-weather data, or budgets dose against a career limit.
- A routine daily wellbeing check-in: none of the verified sources shows a structured daily self-report of sleep, mood, stress and symptoms.
- Open source with an open API and pluggable storage: every verified system is a proprietary product, service or government-controlled tool.
- Full decision logic offline: most verified systems need a cloud or a live link (Kenzen, Epicore, SlateSafety portal, Tempus Pro to Corsium, every human service).
- A go/no-go for a named high-risk task based on several factors: the heat products give work/rest or 'back to work' alerts (SlateSafety, Kenzen, HIPS), but none gives a fit-or-not decision for a specific task such as a spacewalk or piloting that combines sleep,
- Tiered self-care that does not need an answer: every verified service model ends with a remote human (MedLink, CIRM, International SOS, RMI, UTMB, Global Rescue) or an on-site supervisor or medic.
- Not a gap but a caution for the comparison: several verified systems have regulatory clearance or field validation that Demify lacks.

## Hospital, AI and consumer monitoring

| System | Maker | Status | Speciality | Checked |
|---|---|---|---|---|
| NEWS2 (National Early Warning Score 2) | Royal College of Physicians (UK) | in operational use (not re-verified this turn) | Simple, transparent, works on paper | corrected |
| Nervecentre electronic observations (NEWS2 track-and-trigger software) | Nervecentre Software (UK). | in operational use (not re-verified this turn) | Turns the paper score into hospital-wide real-time escalation and task tracking. | partly unconfirmed |
| IntelliVue Guardian Solution (automated early warning scoring) | Philips | in operational use (not re-verified this turn) | Removes manual scoring errors by tying the score to Philips monitors. | partly unconfirmed |
| Epic Deterioration Index (EDI) | Epic Systems | in operational use (not re-verified this turn) | Built into the most widely used US EHR | partly unconfirmed |
| Epic Sepsis Model (ESM) | Epic Systems | in operational use (not re-verified this turn | Widely deployed sepsis screening | partly unconfirmed |
| eCART Clinical Deterioration Suite | AgileMD (developed with University of Chicago researchers) | in operational use (not re-verified this turn) | Best discrimination in Edelson 2024 (AUROC about 0.895) and reportedly the longest median lead time (about 11 hours at the high-risk threshold). | partly unconfirmed |
| Rothman Index (PeraServer / PeraTrend) | PeraHealth (index developed by Rothman Healthcare) | in operational use (not re-verified this turn) | Treats nursing judgement as data alongside vital signs. | partly unconfirmed |
| TREWS (Targeted Real-time Early Warning System) | Bayesian Health (from Johns Hopkins research) | in operational use (not re-verified this turn) | One of the few AI warning systems with a large prospective deployment study (Adams et al., Nature Medicine 2022): 590,736 monitored patients at five hospitals. | partly unconfirmed |
| CLEWICU | CLEW Medical (Israel) | unclear (current commercial status not verified) | FDA 510(k) clearance announced February 2021, after a 2020 Emergency Use Authorization during COVID-19 | partly unconfirmed |
| Biovitals Analytics Engine (Biofourmis platform) | Biofourmis (reported to have merged with CopilotIQ in October 2024 and sold its life-sciences business to ActiGraph | in operational use (not re-verified | Reported as the clearest FDA-cleared example of multi-signal personal-baseline monitoring (510(k) K183282, 2019). | partly unconfirmed |
| Current Health platform | Current Health (Edinburgh) | in operational use (not re-verified this turn) | End-to-end hospital-at-home kit with FDA clearances (reported as K190073 in 2019 and K231506 in 2023), cleared for home use (unverified). | partly unconfirmed |
| BioButton Multi-Patient wearable and BioDashboard | BioIntelliSense | in operational use (not re-verified this turn) | Continuous monitoring at scale instead of spot checks. | partly unconfirmed |
| VitalPatch biosensor (Vista Solution) | VitalConnect | unclear (post-2020 status not verified) | Multi-signal medical-grade patch, 510(k) cleared (K192757 per the EUA letter), with a 2020 EUA for QT-interval monitoring in COVID-19 patients (unverified). | partly unconfirmed |
| Masimo W1 medical watch | Masimo | in operational use (not re-verified this turn) | Hospital-grade pulse oximetry on the wrist. | partly unconfirmed |
| Apple Watch health features (Vitals app, Hypertension Notifications, Irregular Rhythm Notification, AFib History) | Apple | in operational use (not re-verified this turn) | The closest consumer analogue to Demify's baseline plus cross-signal approach: a personal multi-signal baseline, an alert only when two or more signals deviate together, and a list of plausible causes. | corrected |
| Oura Ring (Readiness Score and Symptom Radar) | Oura (ŌURA Health) | in operational use (not re-verified this turn) | Personal-baseline, multi-signal early strain detection in a ring. | partly unconfirmed |
| WHOOP (Recovery score | WHOOP | in operational use (not re-verified this turn) | Multi-signal personal baseline for daily readiness. | partly unconfirmed |
| Samsung Galaxy Watch sleep apnea feature (Samsung Health Monitor) | Samsung | in operational use (not re-verified this turn) | First FDA authorisation of its kind for a consumer watch (De Novo announced February 2024, after Korean MFDS approval in October 2023). | partly unconfirmed |
| Polar H10 chest strap | Polar Electro | in operational use (not re-verified this turn) | Widely used as a research-grade HR/HRV reference in validation studies. | partly unconfirmed |

**What none of these systems does:**

- Delay-aware escalation: every system assumes a responder within minutes (hospital tools) or a remote clinical team reachable in near real time (Biofourmis, Current Health, BioButton, VitalPatch, Masimo).
- Self-care for non-clinicians: none gives a crew member a concrete action plus a tiered path (self-care, then an onboard non-physician medical officer, then a remote physician).
- Dual reference with named sources: none rates each value both against published clinical or operational thresholds that name their source AND against the person's own clinical pre-mission baseline.
- Named causes, including environmental ones: none names a likely cause across signals (for example infection, sleep loss with low mood, cabin CO2 behind poor sleep, a life-support fault).
- Environment and radiation: none takes habitat or environment inputs (cabin CO2, radiation dose, space weather), keeps a dose budget against a career limit, or links to a storm-shelter procedure.
- Fit for a specific task: none gives a go/no-go for a specific safety-critical task that combines vitals, sleep and an objective cognitive test (a PVT-style reaction-time test).
- Offline operation: no software system on the list was confirmed to run its analysis and escalation fully offline.
- Openness: no software system on the list is open source.
- Very small crews: the ML systems are trained and validated on hundreds of thousands to millions of hospital encounters and are meant to be validated locally.

## Ideas for a 10x difference

| Idea | In one line |
|---|---|
| Light-time contracts: pre-signed care plans with veto windows | The flight surgeon makes the decision before the emergency. The crew carries out that signed plan straight away, and Earth gets a veto window sized to the light time, so it stops being the bottleneck. |
| Who treats the medic: crew care roster with automatic caregiver handoff | When the patient is the crew's medic, or cannot speak, Demify hands the case to the best-placed crewmate and rewrites the steps for that person's training. |
| The crew is its own control group: you, the ship, the schedule, or spreading? | In a crew of four who breathe the same air and keep the same timeline, the other three are the comparison group. Demify tells whether a symptom belongs to the person, the ship, the schedule, or is spreading. |
| Expected Self: a baseline that knows what spaceflight does to you | Rate each value against what spaceflight should be doing to this person on this mission day, not against Earth. Normal adaptation then stops looking like illness, and illness can no longer hide inside adaptation. |
| Open Rulebook with a Flight Recorder | Every medical rule shows its source, its version and its track record. Every piece of advice is recorded with the rule that produced it. Any proposed change is replayed against every past mission before it ships. |
| Crew Health Compact | Before launch, the crew member and the flight surgeon sign published rules, enforced by the software, for who learns what. The crew member sees every look at their data, and the ground gets a fit-for-task decision without the private reasons. |

## The judge

| Idea | Different | Valid | Demo | Value |
|---|---|---|---|---|
| Light-time contracts: pre-signed care plans with veto windows | 7 | 7 | 9 | 8 |
| Expected Self: a baseline that knows what spaceflight does to you | 7 | 7 | 8 | 8 |
| Open Rulebook with a Flight Recorder | 5 | 8 | 7 | 8 |
| Who treats the medic: crew care roster with automatic caregiver handoff | 6 | 5 | 6 | 7 |
| Crew Health Compact | 7 | 5 | 6 | 6 |
| The crew is its own control group: you, the ship, the schedule, or spreading? | 6 | 4 | 7 | 6 |

**Winner:** Light-time contracts: pre-signed care plans with veto windows. It is the only idea that changes who decides and when, rather than giving a better alert, and it attacks the defining constraint of deep-space medicine, which is that the doctor's answer arrives too late. It builds directly on code Demify already has, which I checked: earliestAnswerS, the 54.4-minute Mars exchange in consult.test.ts, FAST_FORWARD_RATE, and autonomy level 4, 'You act first, the ground advises later'. That makes it buildable by two people in about 8 to 12 hours. It also has the strongest stage moment: one care plan, two profiles. On the ISS the veto window is seconds, so the ground effectively decides live. At Mars it is about 54 minutes, and a reply written for an earlier situation is flagged as stale. Before the demo, resolve the internal contradiction with the three step classes: act now and report, act unless vetoed by time T, and needs ground approval with a fallback written for blackout. Then the 'no waiting' claim holds.

**Combine with:** Graft from the Open Rulebook: (a) a flight recorder that appends every piece of advice and every plan step to the audit trail, with the plan or rule id, its version hash and its inputs. Today AuditAction covers only create, replace and clear of readings, as confirmed in src/server/repository.ts. (b) Plans replayed against the 180-day simulation in CI before they 'ship'. Present this as adopting established practice; AHRQ's CQL Testing Framework does it. Graft from Expected Self, at minimum: fix the contradiction where the temperature drift rule (Watch +0.5 °C, Act +1.0 °C) flags the roughly 1 °C in-flight rise that its own note describes. The infection plan branches on temperature, so a contradictory temperature reference would undermine the demo. Present the full Expected Self curves as the next roadmap step. Later, from 'Who treats the medic': the 'patient cannot respond' observer input, so the plan can run with a named caregiver entering the data. Leave the crew control group and the Health Compact for the roadmap.

**Pitch line:** When the speed of light makes the doctor late, Demify makes the doctor early: the flight surgeon signs the plan before the emergency, the crew carries it out at once, and Earth keeps a veto timed to the light delay.

**Claims not to make:**

- Do not say 'nobody does this' or 'first ever'. Pre-authorised care (standing orders, ISS medical checklists and flight rules, the Navy's UNODIR convention) and computable, versioned guidelines already exist (HL7 CPG on FHIR: https://github.com/HL7/cqf-recommendations; WHO's antenatal care implementation guide: https://github.com/WorldHealthOrganization/smart-anc). Claim only what we did not find: veto deadlines computed from the live light time, and a check that flags stale replies.
- Do not claim NASA's EIMO concept of operations lacks this. It was not checked. Say: 'we have not yet compared it with NASA's 2024 EIMO concept of operations'.
- Do not say 'zero delay' unless every step is classed as act now and report. Any step held until a veto window closes adds about 54 minutes at Mars.
- Do not say the Mars delay is 20 or 22 minutes in every case. One-way light time varies with orbital geometry. About 22 minutes is the maximum, at 2.67 AU, and the 54-minute exchange includes an illustrative 10 minutes of ground handling.
- Do not call the SHA-256 hash a signature or say plans are 'signed by a flight surgeon'. It is a version fingerprint. The demo plans are invented, unreviewed and contain no drug doses, and they must be labelled that way on screen.
- Do not present 'no veto received' as consent. The packet may have been lost, and during a blackout the plan runs with no oversight. The screen must say so.
- Do not say 'tested like code' means clinically validated. Replay against the scripted 180-day simulation checks only the logic paths, because the script is the 'truth'.
- Do not quote 152 against 8 flagged days, or 19 against 17 quiet-day alerts, as accuracy or performance. Both are circular scratch experiments on simulated data.
- Do not say Demify is a medical device, is cleared, or is on track for EU MDR class IIb or FDA clearance. It is decision support. Say that carrying out clinical protocols would likely raise its classification.
- Do not say NASA, ESA or any flight surgeon uses, reviewed or endorsed Demify or its plans.
- Do not say the Crew-11 return was caused by communication delay, or name a diagnosis. The ISS link has seconds of delay. The condition is undisclosed, Fincke said a heart attack was ruled out, and NASA's J.D. Polk said the capability to diagnose and treat it 'does not live on the ISS'.
- Do not present unverified landscape entries as fact: EIMO details, CMO-DA's 74 to 88%, ARCHeR real-time data, the Oura edge computing on Ax-4, and Apple, Oura, WHOOP and Biofourmis baseline details.
- Do not claim '10 times better' as a measured result. No measurement exists. Name what you would measure in an analog with imposed delay: time from finding to first action, exchanges per case, stale replies caught.
- Do not present the simulated vital signs, the simulated crewmates or the simulated ground replies as real data.
- Do not claim the Stahn 2017 temperature curve applies to handheld thermometer readings until its measurement method has been checked.

## Full details

Every entry with its sources is in the research run journal; ask for any system in detail.
