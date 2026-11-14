# ISS and spaceflight health equipment: research notes

Condensed from the team's research report of 14 November 2026 ("ISS and
spaceflight health equipment: what is really on board"). Only the parts
Demify uses are kept. Items the report marked "(unconfirmed)" are left out
or marked here too. Numbers in square brackets are the report's sources,
listed at the end with their URLs. Most NASA primary documents could not be
opened during the research; treat model names and numbers as the best
public information, not as official specifications. No medicine names or
doses are used anywhere in Demify.

## How medical care works on the ISS

- ISS medicine is mostly telemedicine. Usually two crew members per crew are
  trained as Crew Medical Officers (CMOs), a primary and a backup. They are
  not doctors. Flight surgeons on the ground guide them [1][2][121].
- The flight surgeon sits on the "Surgeon" console in Mission Control
  Houston, runs the private medical conferences, guides diagnosis and
  treatment, and advises the flight director on medical go/no-go [1][123].
- Biomedical engineers (BMEs) are the flight controllers for the medical
  hardware; they plan and send up medical procedures [124].
- Private Medical Conference (PMC): weekly, one crew member at a time, about
  15 minutes, only the medical team listens; a crew member can ask for an
  extra one at any time [123][126][1].
- Crews follow step-by-step medical procedures, often with a flight surgeon
  on the line [124][26][31].
- For CPR the patient is strapped to the Crew Medical Restraint System
  (CMRS), which also isolates the patient electrically during
  defibrillation [31][34].
- Ultrasound guided from the ground is the main diagnostic tool [8].
- Crew-11 (January 2026) was the first medical early return in ISS history:
  a controlled medical evacuation of the whole Dragon crew to reach advanced
  imaging that is not on the station. The condition is private [16][17][128][132].

## Medical packs (Crew Health Care System, CHeCS)

The US segment keeps its health gear in CHeCS: Health Maintenance System
(medical care), Environmental Health System (air, water, microbes,
radiation) and Countermeasures System (exercise) [3][4]. Since 2011 medical
supplies sit in nine task-based packs plus emergency equipment [25][3].
Whether all names are still used in 2026 is unconfirmed. Demify's library
lists only the packs without medicines; the medicine packs (Convenience
Medications, Oral Medications, Topical and Injectable Medications) exist but
their contents are not part of the prototype.

| Pack / equipment | Contents (as public) | Src |
|---|---|---|
| Medical Diagnostics Pack (MDP) | Physical-exam items (BP cuff, stethoscope, pulse oximeter listed as ISS capabilities in 2007; exact pack contents unconfirmed) | [3][26][30] |
| Minor Treatment Pack (MTP) | Supplies for small injuries and small procedures | [3][26] |
| Medical Supply Pack (MSP) | Bandages, gauze, gloves, other consumables | [3] |
| IV Supply Pack (ISP) | IV pressure infusor (bags cannot drip by gravity), IV catheters, tourniquet, bone (intraosseous) access, gauze, syringes | [3][26] |
| Physician Equipment Pack (PEP) | Equipment for advanced exams under flight-surgeon guidance | [3][26] |
| Emergency Medical Treatment Pack (EMTP) | First-response emergency supplies | [3][26] |
| Advanced Life Support Pack (ALSP) | Advanced cardiac life support: IV and bone access, airway equipment | [25][31] |
| Respiratory Support Pack (RSP) | Ventilator and oxygen | [32][33] |
| Crew Medical Restraint System (CMRS) | Board that holds patient, rescuer and equipment | [31][34] |
| AED: Physio-Control LIFEPAK 1000 | Rhythm analysis and shocks; on the ISS since July 2008 (still the AED in 2026: unconfirmed) | [5][35] |
| Airway items (2015 list) | Nasal and oral airways, laryngeal mask airway, laryngoscope, suction | [26] |

Inventory tracking is still largely manual; RFID sees whole kits, not their
contents; there is no public inventory API [44].

## Devices that check the crew

Very few ISS medical devices push data over a network. Most show a value on
a screen or store it on the device or a laptop; results reach flight
surgeons as a file, a voice report or live video [9][8].

- Ultrasound: GE HealthCare Vivid iq since September 2025 (replaced the
  Vivid q from 2011); live video downlink for ground-guided scans [6][7][8].
- Eye exams for SANS: OCT (Heidelberg Spectralis, first in orbit 2013),
  fundoscope, eye ultrasound, tonometry, compared with pre-flight scans
  [10][56][58].
- Spot vitals: BP cuff, stethoscope, pulse oximeter, thermometer; read by
  the crew and reported by voice or form [30].
- Lab: blood draws frozen for return to Earth, Abbott i-STAT handheld blood
  analyser, urine dipsticks, centrifuge [9][67].
- Monthly WinSCAT cognitive test (about 30 minutes, one source) [11];
  KUDUwave audiometer for hearing tests [12].
- Body mass: SLAMMD (US), BMMD (Russian segment) [66][13].
- Fixed schedule: Spaceflight Standard Measures before, during and after
  flight [65].

## Environment and radiation

- Air: Major Constituent Analyzer (N2, O2, CO2) continuous into station
  telemetry; Air Quality Monitor for trace organics; handheld analysers after
  fire or smoke [84][81][87].
- Radiation: Crew Active Dosimeter (Mirion) worn by each crew member;
  IV-TEPC and ISS-RAD send telemetry; ISS-RAD also works as an alarm when
  the dose rate reaches a level where the crew may need to shelter [101][104][105].
- Noise: crew-worn Svantek dosimeters; limits were exceeded in 41 % of crew
  dosimetry measurements since 2008 (not accounting for hearing protection) [98].

## Computers and links

- Flight-critical computers (MDMs, MIL-STD-1553 buses) are closed to
  third-party software [18].
- Crew laptops (HP ZBooks; a refresh started in October 2025, exact model
  unconfirmed) sit on the Joint Station LAN (Ethernet, Wi-Fi) [19][208][215].
- No direct internet: since 2010 crews browse by remote desktop to a ground
  computer, only while the Ku-band link is up; crew email moves as files
  several times a day [20][217].
- Ku-band via TDRS relay satellites: about 517 Mbps down and 21 Mbps up of
  user data, shared by the whole station, about 85 % coverage of each orbit,
  about 600 ms round trip [21].
- Store-and-forward networking (DTN / HDTN, LunaNet) is the direction for
  Moon and Mars; HDTN was tested on the ISS in June 2024 [23][182].
- HPE Spaceborne Computer-2 runs commercial server hardware on the ISS for
  on-board processing; it turned a 1.8 GB dataset into a 92 KB result
  (vendor figure) [22][233].
- One-way delays: about 1.3 s to the Moon, about 3 to 22 minutes to Mars [23][24].

## Earth analog stations (candidate pilots)

| Station | Facts | Simulated delay | Src |
|---|---|---|---|
| Asclepios (Sasso San Gottardo, CH) | Student-led lunar analog, about 6 crew for about 14 days, a medical student in Mission Control responsible for crew health | not confirmed | [185][187][188] |
| MDRS (Utah) | Starlink with a Wi-Fi mesh | 15 min in a Florida Tech crew's EVAs | [189][190] |
| HI-SEAS (Hawaii) | Wearables, questionnaires (2013-2017) | 20 min (email) | [193][194] |
| HERA (NASA JSC) | 4 crew, 45-day missions | up to 5 min | [196] |
| CHAPEA (NASA JSC) | Year-long Mars simulations | up to about 22 min one way | [198][199] |

## What this means for Demify

- Work offline first and sync by store-and-forward; never assume a live
  session to the ground [20][23].
- Treat manual entry and file import as main inputs; almost no ISS kit item
  produces data [9][26].
- Medical data is private (PMCs, Crew-11, Privacy Act records) [123][17][139].
- Commercial hardware sees radiation bit flips; ECC on the new laptops is
  unknown, so integrity checks and clean restarts matter [236].
- Send compact summaries before raw data (Spaceborne Computer-2 lesson) [22].
- A dedicated GPU server is a ground-test and analog-station setup. On a real
  spacecraft the same software would target an existing approved crew laptop
  or a hosted payload such as Spaceborne Computer-2, not a new box: power,
  cooling and approval are the limits, not memory [18][208][211][233].

## What we must not claim

- That Demify connects to any ISS device, laptop, network or data link. It does not.
- That NASA, ESA or any agency uses, tests or endorses Demify.
- That Demify is a certified medical device, diagnoses anything, or replaces
  flight surgeons, CMOs or Private Medical Conferences.
- That the vital signs in the demo are real crew data (they are simulated).
- That we know the data formats of ISS medical devices.
- That Docker is approved on ISS laptops.
- That the ISS has "600 Mbps for us": about 517 Mbps, shared, with gaps.
- Anything about the Crew-11 condition beyond what NASA and the astronaut made public.
- Medicine doses, or that Demify suggests treatment.
- Any "(unconfirmed)" item stated as a fact.

## Sources (numbering as in the team report)

1. https://www.nasa.gov/directorates/esdmd/hhp/flight-surgeons
2. https://ntrs.nasa.gov/citations/20080010877
3. https://ntrs.nasa.gov/api/citations/20110011351/downloads/20110011351.pdf
4. https://ntrs.nasa.gov/citations/20110022379
5. https://healthimaging.com/node/32039
6. https://www.gehealthcare.com/en/about/newsroom/press-releases/taking-innovative-technology-to-the-final-frontier-ge-healthcares-vivid-iq-ultrasound-system-launches-to-the-international-space-station
7. https://www.nasa.gov/ames/space-biosciences/ultrasound-2-sts-135/
8. https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/International_Space_Station_Benefits_for_Humanity/Advanced_Ultrasound_for_the_Space_Program_and_on_Earth
9. https://doi.org/10.1093/clinchem/hvad035
10. https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf
11. https://ntrs.nasa.gov/api/citations/20110008700/downloads/20110008700.pdf
12. https://www.engineeringnews.co.za/article/nasa-takes-the-kuduwave-audiometer-to-space-2021-02-24
13. https://www.space.com/space-exploration/human-spaceflight/how-do-astronauts-weigh-themselves-in-space
16. https://www.npr.org/2026/01/15/nx-s1-5677647/nasa-spacex-crew-11-splashdown-return
17. https://www.space.com/space-exploration/human-spaceflight/nasa-reveals-the-astronaut-who-required-1st-medical-evacuation-from-the-international-space-station
18. https://www.militaryaerospace.com/computers/article/16707644/honeywell-engineers-enhance-space-station-computers
19. https://www.digitaltrends.com/computing/astronauts-on-the-iss-are-getting-a-laptop-upgrade-from-hp/
20. https://digitaltrends.com/computing/nasa-gives-space-station-crew-personal-web-access
21. https://ntrs.nasa.gov/api/citations/20160009326/downloads/20160009326.pdf
22. https://www.businesswire.com/news/home/20220404005739/en/Hewlett-Packard-Enterprise-Drives-Innovation-at-the-Extreme-Edge-on-the-International-Space-Station-with-24-Completed-Experiments
23. https://ntrs.nasa.gov/api/citations/20240007078/downloads/HDTN_ISS_Testing_2024.pdf
24. https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf
25. https://ntrs.nasa.gov/api/citations/20110010924/downloads/20110010924.pdf
26. https://www.nasa.gov/wp-content/uploads/2015/03/medical_kit_checklist_-_full_release.pdf
30. https://ntrs.nasa.gov/api/citations/20070032039/downloads/20070032039.pdf
31. https://www.governmentattic.org/19docs/NASA-ISSmedicalEmergManual_2016.pdf
32. https://iro.uiowa.edu/esploro/outputs/journalArticle/Mechanical-ventilation-in-orbit-emphasis-on/9984006463502771
33. https://ntrs.nasa.gov/api/citations/20080026032/downloads/20080026032.pdf
34. https://sjtrem.biomedcentral.com/articles/10.1186/s13049-020-00793-y
35. https://www.dicardiology.com/node/24705
44. https://ntrs.nasa.gov/api/citations/20240004505/downloads/AMIS_AsMA_2024_final.pdf
56. https://cm.healio.com/news/optometry/20140217/spectralis-being-used-on-space-station
58. https://www.nasa.gov/blogs/stationreport/2013/06/05/iss-daily-summary-report-06-05-13/
65. https://www.nature.com/articles/s41526-025-00532-6
66. https://en.wikipedia.org/wiki/Human_Research_Facility_1
67. https://www.nasa.gov/blogs/stationreport/2013/05/02/iss-daily-summary-report-05-02-13/
81. https://ntrs.nasa.gov/api/citations/20170002579/downloads/20170002579.pdf
84. https://ntrs.nasa.gov/api/citations/20160010396/downloads/20160010396.pdf
87. https://ntrs.nasa.gov/citations/20050217459
98. https://ntrs.nasa.gov/api/citations/20210016305/downloads/Inter-Noise2021_Paper2219_FINAL%20Manuscript.pdf
101. https://read.qxmd.com/read/37945094/the-importance-of-time-resolved-personal-dosimetry-in-space-the-iss-crew-active-dosimeter
104. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3941488/
105. https://three.jsc.nasa.gov/Encyclopedia/Article/62
121. https://ntrs.nasa.gov/citations/20205008925
123. https://www.nasa.gov/podcasts/houston-we-have-a-podcast/mission-control-crew-health-consoles
124. https://www.nasa.gov/directorates/esdmd/hhp/biomedical-flight-controllers/
126. https://www.drugdiscoverynews.com/keeping-astronauts-healthy-in-space-15204
128. https://spaceflightnow.com/2026/01/09/crew-11-to-cut-mission-short-and-return-to-earth-due-to-medical-issue/
132. https://www.cbsnews.com/amp/news/mike-fincke-astronaut-medical-issue-aboard-iss
139. https://www.govinfo.gov/content/pkg/FR-2023-10-10/pdf/2023-22412.pdf
182. https://www.nasa.gov/wp-content/uploads/2025/02/lunanet-interoperability-specification-v5-baseline.pdf
185. https://asclepios.ch/?p=11685
187. https://www.swissinfo.ch/eng/science/moon-mission-in-the-gotthard-how-claude-nicollier-trains-with-students-in-the-bunker/87279459
188. https://www.srf.ch/radio-srf-1/mondmission-im-gotthard-wie-eine-medizinstudentin-das-leben-auf-dem-mond-simuliert-1
189. https://redorbit.com/mars-society-installs-starlink-at-mars-desert-research-station
190. https://news.fit.edu/science/all-florida-tech-crew-completes-weeklong-simulated-mars-mission-in-utah/
193. https://www.scientificamerican.com/blog/guest-blog/what-it-s-like-to-live-on-mars/
194. https://qz.com/490943/nasa-funded-recruits-begin-a-year-long-isolation-mission-to-simluate-conditions-on-mars
196. https://www.nasa.gov/humans-in-space/houston-do-you-copy-hera-crew-navigates-communication-delays
198. https://www.goodmorningamerica.com/news/story/nasas-mars-simulator-crew-emerged-after-378-days-111755446
199. https://www.universetoday.com/162265/nasa-locks-four-volunteers-into-a-one-year-mission-in-a-simulated-mars-habitat/
208. https://gizmodo.com/how-astronauts-use-laptops-on-the-international-space-s-1654962539
211. https://www.pcgamer.com/hardware/gaming-laptops/theres-no-memory-crisis-in-space-as-astronauts-on-the-iss-are-getting-new-laptops-with-128-gb-of-ram-and-a-seriously-beefy-specs-sheet/
215. https://ntrs.nasa.gov/api/citations/20090013859/downloads/20090013859.pdf
217. https://office-watch.com/2009/using-outlook-from-orbit
233. https://www.issnationallab.org/release-ng20-hpe-spaceborne-computer2/
236. https://ntrs.nasa.gov/citations/20200001591
