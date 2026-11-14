# ISS and spaceflight health equipment: what is really on board

**Date:** 14 November 2026
**Scope:** The health equipment, medical care, computers and data links that really exist on the ISS, other crewed spacecraft and Earth analog stations, and what this means for how Demify's server should be set up.

> **How to read this report**
>
> - Numbers in square brackets, such as [3], point to the numbered Sources list at the end.
> - "(unconfirmed)" means the fact-checkers could not confirm the claim, or it rests on one weak source. Do not present these as facts in the pitch.
> - Most NASA primary documents (ntrs.nasa.gov, nasa.gov) could not be opened during the research. Many details come from search-result summaries of those documents and from news reports. Treat model names and numbers as the best public information, not as official specifications.
> - The report gives no medicine doses, on purpose.

## The short version

- ISS medicine is mostly telemedicine. One or two crew members per crew are trained as Crew Medical Officers (CMOs). They are not doctors. Flight surgeons on the ground guide them [1][2].
- The US side's health system is the Crew Health Care System (CHeCS). It has three parts: medical care, environment monitoring and exercise [3][4].
- Medical supplies sit in nine task-based packs (since 2011), plus emergency gear: a life-support pack, a ventilator with oxygen, a restraint board for CPR, and a Physio-Control LIFEPAK 1000 defibrillator (on board since July 2008) [3][5]. Almost none of this produces electronic data.
- The only imaging on the ISS is ultrasound. A GE HealthCare Vivid iq arrived in September 2025 and replaced the Vivid q from 2011. Experts on the ground guide scans live over video [6][7][8].
- The on-board lab is small: blood draws, an Abbott i-STAT handheld blood analyser, urine dipsticks and a centrifuge. Most samples are frozen and analysed on Earth after they come back [9].
- Regular checks include eye exams (OCT, fundoscope, tonometry, ultrasound), a monthly computer-based thinking test (WinSCAT), hearing tests and body-mass measurement [10][11][12][13].
- The 2023 medicine list held 106 medications, and many last 3 years or less. In a clot case published in 2020, the blood thinner on board had to be rationed until more arrived on a cargo flight [14][15].
- In January 2026 Crew-11 came home early for a medical reason. It was the first medical early return in ISS history. The whole Dragon crew came home, and the condition is still private [16][17].
- The flight-critical computers are closed. Crew laptops (HP ZBooks, being refreshed since October 2025) sit on an Ethernet and Wi-Fi network called the Joint Station LAN. The station has no direct internet [18][19][20].
- Data reaches the ground over Ku-band through NASA's TDRS relay satellites: about 517 Mbps down and 21 Mbps up, shared by the whole station, with coverage for about 85% of each orbit [21].
- The trend is on-board processing (HPE Spaceborne Computer-2) and store-and-forward networking (DTN), because Moon and Mars links have delays of seconds to about 22 minutes one way [22][23][24].
- For Demify this means: work offline first, sync by store-and-forward, treat manual entry and file import as main inputs, protect medical privacy, and never claim that Demify connects to any ISS system today.

## 1. Medical kits and supplies

The US side keeps its health gear in the **Crew Health Care System (CHeCS)**. CHeCS has three parts. The **Health Maintenance System (HMS)** covers medical care. The **Environmental Health System** covers air, water, microbes and radiation. The **Countermeasures System** covers exercise [3][4]. The hardware is stored in and around the CHeCS rack.

In 2011 NASA replaced the old packs with nine task-based packs. NASA called the old delivery system obsolete. The new packs flew on a Russian Progress cargo ship, and crew members of Expeditions 27/28 were the first users [25][3]. Whether all nine pack names are still used in 2026 is (unconfirmed). The most detailed public item list is a 2015 NASA checklist [26]. The CHeCS Medical Hardware Catalog v10.0 (March 2011) is older than the redesign, so treat it as history, not as the 2026 setup [4]. One secondary source says the medicines are split across five colour-coded kits [27]. Which colour belongs to which pack is (unconfirmed).

### 1.1 Packs and emergency equipment

| Kit | What is in it | Notes | Src |
|---|---|---|---|
| Convenience Medications Pack (CMP) | Common over-the-counter-type medicines (for example pain relief, sleep, motion sickness, allergy) | Crew can use them with little consultation. Use is reported to the ground. | [3][26] |
| Oral Medications Pack (OMP) | Prescription tablets and capsules (for example antibiotics, heart, stomach, sleep) | Listed item by item in the 2015 checklist. | [3][26] |
| Topical and Injectable Medications Pack (TIMP) | Creams, eye and ear drops, injectable medicines | A 2025 NASA report says the kit contains the injectable blood thinner enoxaparin; which pack holds it is unknown. Russian crews report that glass ampoules are hard to use in weightlessness. | [3][28][29] |
| Medical Diagnostics Pack (MDP) | Physical-exam items | Probably stethoscope, blood pressure cuff and thermometer (unconfirmed). A 2007 NASA table lists BP cuff, stethoscope and pulse oximeter as ISS capabilities. | [3][26][30] |
| Minor Treatment Pack (MTP) | Supplies for small injuries and small procedures | Contents not itemised in the sources. | [3][26] |
| Medical Supply Pack (MSP) | Bandages, gauze, gloves and other consumables | High-volume items. | [3] |
| IV Supply Pack (ISP) | IV pressure infusor, IV catheters in several sizes, tourniquet, bone (intraosseous) access, gauze, syringes | "IV Supply Pack" is an official NASA name. The infusor is needed because IV bags cannot drip by gravity in orbit. No electronic IV pump was found in any source. | [3][26] |
| Physician Equipment Pack (PEP) | Equipment for more advanced exams and procedures under flight-surgeon guidance | Exact item list not public in the sources. | [3][26] |
| Emergency Medical Treatment Pack (EMTP) | First-response emergency supplies and a few emergency medicines | | [3][26] |
| Advanced Life Support Pack (ALSP) | Advanced cardiac life support: emergency medicines, IV and bone access, airway equipment | Used together with the defibrillator, the ventilator and the restraint board. Still named in the 2016 emergency manual. | [25][31] |
| Respiratory Support Pack (RSP) | A ventilator and oxygen to resuscitate or support a crew member with acute breathing failure | Make and model are not public. One suggested model (Allied AutoVent 2000) is (unconfirmed). A 2004 review criticised the design and recommended upgrades. A NASA study redesigned its cue cards because the hardware was hard to use. | [32][33] |
| Crew Medical Restraint System (CMRS) | A board that holds the patient, the rescuer and the equipment, and electrically isolates the patient during defibrillation | A 2020 European guideline recommends the Evetts-Russomano method for immediate CPR and the handstand method on the CMRS for advanced life support. | [31][34] |
| Defibrillator: Physio-Control LIFEPAK 1000 (AED) | Analyses the heart rhythm and gives shocks | Chosen in 2008 from 18 AEDs and on the ISS since July 2008, described as the first AED in space. It has a custom battery (Micro Power Electronics) and a NASA-made cover against electromagnetic interference, and was tested on DC-9 parabolic flights. Before 2008 the ISS had a manual defibrillator. Still the AED in 2026: (unconfirmed). Whether its records are sent to the ground is unknown. | [5][35][36][37] |
| Airway items (2015 list) | Nasal airways 6 mm and 7 mm, oral airway, intubating laryngeal mask airway (ILMA) with stabiliser rod, laryngoscope, suction device and tubing | Which pack holds them is not confirmed. | [26] |
| Splints, dental, minor surgery, urology, eyes (2015 list) | Finger and leg/arm splints; dental forceps, elevators, mirror, adhesive, temporary filling; scalpels and needle driver; urinary catheter set; eye drops | Pack locations not confirmed. Urine retention is a known spaceflight problem. | [26][38] |
| Legacy packs: Ambulatory Medical Pack (AMP), HMS Ancillary Support Pack (HASP) | Pre-2011 general-care and supply packs | The AMP flew from Expedition 1 and was sized for 3 crew for 6 months. Retired in 2011, but older documents still use the names. | [25] |
| Russian segment kits (IBMP) | 18 medical kit sets; on-board defibrillator and ventilator; allow ultrasound and dental care | Renewed over about a year. Enough medicine to keep a seriously ill crew member going for about three days until return. Kit names and the Russian defibrillator model are unknown. | [39][38][29] |
| Soyuz kits | Two small medical kits plus an emergency reserve kit for an off-target landing | 2012 information. Current Soyuz MS contents are unknown. | [38][40] |

### 1.2 Medicines and shelf life

- **Formulary.** The 2023 ISS medicine list had 106 medications. Shelf-life data existed for 91. Using the longest labelled shelf life, 54 of 91 last 36 months or less. Using the shortest labelled shelf life, 89 of 91 do, and 14 expire in under 24 months [14][41].
- **Counting method.** Counting duplicates and diluents gives about 111 items (secondary source) [27].
- **Storage study.** Wotring (2016) tested 9 medicines stored on the ISS for 568 days (NASA's report; other summaries say 550). 4 of 9 still met US Pharmacopeia potency up to 8 months after expiry. A sleep-aid supplement failed at 11 months after expiry. There were no ground controls and only one time point, so the result cannot be generalised [42][43].
- **Repackaging.** Medicines are often repackaged from the maker's packs for flight. This can shorten shelf life and makes item tracking harder [44].
- **Standards.** NASA's Technical Brief TB-006 covers spaceflight pharmacy standards [45].

### 1.3 IV fluid

- IV fluid on board is scarce and depends on resupply.
- **IVGEN (May 2010)** was an experiment, not a working capability. It pushed ISS water through a deionising resin bed with inline conductivity sensors and filled six 1.5-litre bags. Two were mixed into 0.9% saline. Bag 1 reached 117% of the target salt level because of a large air bubble. Bag 2 reached 93.8% because too little salt had been pre-measured. The allowed range is 95-105%. It was built by NASA Glenn with ZIN Technologies [46][47].
- **IVGen Mini** is described only by a secondary news site as a prototype making 1.2 litres per hour. Treat it as an unflown prototype (unconfirmed) [48].

### 1.4 How supplies are tracked

- Medical inventory on the ISS is still largely manual. Crew report what they use to the ground. Barcodes and RFID cover some modules and whole containers. The station's RFID system can see a whole medical kit, but not what is inside it [44].
- A Medical Consumables Tracking demo (2016-2017) tagged and scanned about 300 items with RFID [44].
- NASA presented a project called AMIS in 2024 to track kit contents automatically. Its full name and flight status are (unconfirmed) [44].
- The ISS Inventory Management System has no public data format or API [44].

### 1.5 A real case: the jugular vein blood clot

- An astronaut's research ultrasound found a clot in the left jugular vein about 2 months into a 6-month mission. It was part of a vascular study of 11 astronauts. The year of the event was not disclosed. The case was published in NEJM on 2 January 2020 [49][50].
- Two radiologists on Earth read the images. Later scans were guided from the ground in real time [50].
- Treatment used enoxaparin from the small on-board stock. Its dose was lowered after 33 days to make it last until an oral blood thinner (apixaban) arrived on a cargo flight, around day 43. No reversal drug was on board, so one was sent up too. Treatment lasted about 90 days and stopped 4 days before landing [15][51].
- The same study group (JAMA Network Open, 2019) found stagnant or reversed jugular blood flow in 6 of 11 crew around flight day 50, one blocking clot, and one possible partial clot [52].

## 2. Devices to check how the crew is doing

Very few ISS medical devices push data over a network. Most show a value on a screen or store it on the device or a laptop. The result reaches flight surgeons as a file, a voice report or live video [9][8].

### 2.1 Imaging and eye exams

| Device | Measures | Model / maker | How often | Data out and route to the ground | Src |
|---|---|---|---|---|---|
| Ultrasound (current) | Heart, blood vessels, eyes, abdomen, muscles | GE HealthCare Vivid iq, a space-customised version. Flew on NG CRS-23 (Cygnus XL, launched 14 Sep 2025, docked 18 Sep 2025). Number on board not public. | Routine health checks and research (for example vascular scans in 2025) | Stored images and clips. Live video downlink so ground experts can guide the scan. DICOM export on the flight unit is (unconfirmed). | [6][53][54] |
| Ultrasound (2011 to 2025) | Same | GE Vivid q ("Ultrasound-2"), launched on STS-135 on 8 July 2011. Connects to the front of the HRF-2 rack. It replaced an older unit that had stopped working; the older model name (HDI 5000) is (unconfirmed). | Retired in 2025 | Live video for guided scans; stored images (format unknown) | [7][55] |
| Remote-guided ultrasound (method) | Lets a non-expert crew member take diagnostic images | Developed in the ADUM study | As needed | Live video plus private two-way audio with an expert on the ground. Crew get 2-4 hours of training before flight plus short refreshers. One historic exam ran at 7.5 frames per second (unconfirmed, not today's link). | [8] |
| Optical coherence tomography (OCT) | Cross-section images of retina and optic nerve: thickness, nerve fibre layer, folds, optic disc swelling (SANS) | Heidelberg Engineering Spectralis. First scan in orbit 16 Oct 2013. | Every 1-2 weeks in the Ocular Health study, or every 4 weeks in an earlier report | Digital scans. Baseline scans from Earth are sent up so the AutoRescan function can repeat the exact same spot. So data flows up as well as down. File format and route unknown. | [56][57][10] |
| Fundoscope | Photos of the retina and optic disc | Model unknown. First used in 2013 with new vision-testing software. | Unknown | Digital images; route unknown | [58][10] |
| Tonometer | Pressure inside the eye (mmHg) | Model unknown | Unknown | Number on a screen, probably read out | [59] |
| Visual acuity and Amsler grid | Sharpness of vision, distortion | Laptop vision-testing software (2013). Use of the Amsler grid is (unconfirmed). | Unknown | Unknown | [58] |

The SANS eye-exam set is OCT, fundoscope, eye ultrasound and tonometry. Results are compared with each crew member's pre-flight scans [10].

### 2.2 Vital signs, wearables and body mass

| Device | Measures | Model / maker | How often | Data out and route to the ground | Src |
|---|---|---|---|---|---|
| Blood pressure cuff, stethoscope, pulse oximeter | BP, heart and lung sounds, blood oxygen and pulse | Models unknown. Clinical thermometer type also unknown. | As needed | Read by the crew, reported by voice or form. No electronic output known. | [30] |
| Bio-Monitor with the Astroskin shirt (Canadian Space Agency) | 3-lead ECG, breathing, pulse oximetry, blood pressure, skin temperature, activity | Carré Technologies (Hexoskin), Montreal, CAD 2.4 million contract. Launched on SpaceX CRS-16 on 5 Dec 2018. First used by David Saint-Jacques in Jan 2019. | Research sessions; status after 2023 unknown | Recorded on the garment. A Xiphos processor card sends the data to the ground. File format unknown. | [60][61][62] |
| Cardiolab Holter (HLTE) | ECG over many hours | CNES and DLR research facility in ESA's Columbus module. Holter model unknown. | Research | Stored on the device, downloaded later | [63][64] |
| Portapres / Cardiopres | Beat-by-beat blood pressure from a finger cuff | Cardiolab. Whether these are the same device is (unconfirmed). | Research | Waveforms stored on the device | [63][64] |
| Actigraphy watch | Sleep and wake, activity, light | Philips Actiwatch Spectrum (unconfirmed) | Two-week windows before, during and after flight | Stored on the watch; route unknown | [65] |
| Space Linear Acceleration Mass Measurement Device (SLAMMD) | Body mass, using two springs and force = mass x acceleration | NASA Human Research Facility. Range about 43-109 kg. Accuracy figure (unconfirmed). | Study sessions | A laptop calculates and shows the mass | [66][13] |
| Body Mass Measurement Device (BMMD), Russian segment | Body mass from how fast a spring oscillates | In the Zvezda module. Russian designation unknown. | Unknown | Probably a display reading | [13] |

### 2.3 Lab tests

| Device | Measures | Model / maker | How often | Data out and route to the ground | Src |
|---|---|---|---|---|---|
| Blood draws, refrigerated centrifuge, MELFI freezer | Blood is drawn, spun into plasma or serum, and frozen at about -80 °C | Centrifuge model unknown. MELFI is built by ESA. | Fixed points in Standard Measures and studies | No result on board. Samples return on a cargo vehicle and ground labs produce results later. | [67][9] |
| Abbott i-STAT | Blood chemistry with single-use cartridges (for example electrolytes, blood gases, glucose, haematocrit) | Abbott | As needed | Screen and internal memory. Route to the ground unknown. Cartridges expire, so new ones fly several times a year, and software updates are uploaded. | [9] |
| Urine dipsticks | Quick urine chemistry | Brand unknown | As needed | Read by eye against a colour chart, reported by hand | [9] |
| rHEALTH ONE (demonstration) | Blood cell analysis from one drop | rHEALTH with DNA Medicine Institute. 1.5 kg, under 2.5 W from one USB port. Run by Samantha Cristoforetti in May 2022. | Demonstration only | USB-powered, so probably run from a laptop (inferred). Results were checked against ground analysis. | [68] |
| HemoCue (demonstration) | Point-of-care blood counts | Model unknown. January 2021. | Demonstration | Screen readout | [69] |

On-orbit lab work is limited to blood collection, the i-STAT, urine strips and a centrifuge. Most analysis happens on Earth [9].

### 2.4 Brain, behaviour and hearing

| Device | Measures | Model / maker | How often | Data out and route to the ground | Src |
|---|---|---|---|---|---|
| WinSCAT | 5 tests: maths, short-term memory, working memory, attention, spatial thinking | NASA Johnson Space Center; runs on Windows station laptops | Monthly, about 30 minutes (one source) | Scored at once. Scores go to the Behavioral Health and Performance group. File format unknown. | [11] |
| Cognition test battery | 10 short tests, including emotion recognition, risky decisions and a 3-minute reaction-time test (PVT-B) | University of Pennsylvania (Basner, Gur, Dinges) | Standard Measures sessions; also the NASA Twins Study | Result files on the laptop | [70][71] |
| Reaction Self Test (PVT-B study) | Fatigue and alertness | (unconfirmed) | (unconfirmed) | Unknown | [70] |
| KUDUwave Pro-TMP audiometer | Hearing thresholds per frequency, and a middle-ear check (tympanometry) | eMoyo, sold by GeoAxon; modified so crew can test themselves. Launched on NG CRS-15 (about 20 Feb 2021); tests planned from May 2021. NASA said all future ISS hearing tests will use it. | Once per increment (unconfirmed) | Audiogram made by laptop software; format unknown | [12][72] |
| Crew-worn noise dosimeters | Personal noise exposure | See section 3 | | | [72] |

The share of crew with hearing threshold shifts in flight (9.0% high-frequency, 40.4% low-frequency) is (unconfirmed) [72]. A Periodic Fitness Evaluation on the exercise bike about every 30 days is (unconfirmed).

### 2.5 Russian segment

| Device | Measures | Notes | Src |
|---|---|---|---|
| Kardiovektor | ECG and impedance cardiogram; cosmonauts can run it themselves | Ran in 2015; new hardware on Progress MS-22, MS-24 and MS-26 (2022-2024); results published in 2022. Data go to Russian investigators. | [73][74][75] |
| Pneumocard, Sonocard, COSMOCARD | Heart, breathing, heart rate variability; Sonocard monitored without contact during sleep | Pneumocard and Sonocard ran 2007-2012. COSMOCARD was presented in 2013 and 2015. | [76][77] |
| Chibis suit and Gamma-1 medical system | Chibis applies suction to the lower body to prepare circulation for return; Gamma-1 monitors the crew alongside it | Named in a 2015 NASA report. What Gamma-1 measures is (unconfirmed). | [78] |
| GAMMA-1M monitoring complex | Crew physiology, sent to the ground | Only a 2004 source; use after the 2000s is (unconfirmed). | [79] |

The Russian approach puts telemedicine with ground specialists ahead of procedures the crew does alone [80]. Russian medical data go through Russian ground systems, separate from NASA's [2].

### 2.6 The fixed measurement schedule

NASA's **Spaceflight Standard Measures** take the same core measurements from every crew member. They cover behavioural health, biochemistry, the heart and blood vessels, the immune system, microbes and balance. Sessions are at about 180 and 90 days before launch, at flight day 30, and 30 days before return. Actigraphy runs in two-week windows. Urine is collected only before flight and after landing. The database held 52 crew members from December 2018 to August 2025 [65].

### 2.7 Medical computer

A 2011 NASA report names a **Medical Equipment Computer (MEC)**: a laptop for crew medical hardware and software. Its current model and software are unknown [3].

## 3. Environment, radiation and exercise equipment

The ISS checks its own environment in four ways. Fixed sensors feed station telemetry. Handheld meters show a value the crew reads off a screen. Some instruments write files that are sent down for analysis. Samples are cultured on board or returned to Earth [81][82][83].

### 3.1 Air

| Equipment | What it measures | Type of output | How often | Src |
|---|---|---|---|---|
| Major Constituent Analyzer (MCA) | Mass spectrometer for nitrogen, oxygen, carbon dioxide | Numbers into station telemetry | Continuous | [84] |
| Carbon Dioxide Monitoring Kit (CDMK) | Handheld CO2 spot checks | (unconfirmed: no source found) | Unknown | no source found |
| Personal CO2 Monitor (PCO2M) | CO2, humidity and temperature around one crew member | CozIR NDIR sensor clipped to the collar. Data download wirelessly to an iPad app. Tested on the ISS around 2018-2019. | Study sessions | [85][86] |
| Compound Specific Analyzer-Combustion Products (CSA-CP) | Carbon monoxide, hydrogen cyanide, hydrogen chloride, oxygen after fire or smoke | Handheld screen; values relayed by voice in emergencies | After events, before entering a module, periodic; still maintained in 2022 | [87][88] |
| Compound Specific Analyzer-Oxygen (CSA-O2) | Portable oxygen backup to the MCA | Screen (presumed) | Unknown | [87] |
| Air Quality Monitor (AQM) | 22 trace organic compounds (for example methanol, acetone, benzene, siloxanes) by gas chromatography with a differential mobility spectrometer | Data files, downlinked for ground toxicology review | About twice a week, more in emergencies | [81][89][90] |
| Volatile Organic Analyzer (VOA) | Predecessor of the AQM | Retired: removed in August 2009 | | [91][81] |
| Draeger Chip Measurement System and tubes | Ammonia and other spot gases | Screen value that must be relayed to the ground by voice. Chips last 2 years and are swapped as they expire. | Spot checks | [82] |
| Multi-Gas Monitor (MGM) | Ammonia, CO2, oxygen, water vapour by laser absorption | Technology demo. Flew on a Soyuz in Nov 2013, activated Feb 2014. Core laser technology from Vista Photonics. | Continuous during demo | [92] |
| Anomaly Gas Analyzer (AGA) | Handheld multi-gas analyser | Operational according to a 2026 NASA paper. It aims to replace old handhelds, stop using Draeger tubes for ammonia leaks, and merge several units into one. Deployment date and whether it replaced the CSA-CP are unknown. | As needed | [92] |
| Returned air samples (grab samples, formaldehyde kit, sorbent sampler) | Air sent to Earth labs | (unconfirmed: no source found) | Unknown | no source found |

AQM history: the AQMs replaced the VOA in spring 2013 and were switched on in early March 2013. The first units were swapped in February 2016 because of a nominal 3-year life. With the ISS extended to 2030, the fleet has to last longer [81][93]. A newer Draper version with its own computer and Wi-Fi is (unconfirmed). The Draeger kit should be treated as legacy or being phased out, since the AGA project aims to replace the tubes; its 2026 status is (unconfirmed) [92].

### 3.2 Water and microbes

| Equipment | What it measures | Type of output | How often | Src |
|---|---|---|---|---|
| Total Organic Carbon Analyzer (TOCA) | Organic carbon in drinking water | Numeric result; format unknown. A next-generation unit was planned for a 2024 tech demo. | Unknown | [94][95] |
| Colorimetric Water Quality Monitoring Kit (CWQMK) | Iodine (the US water biocide) and silver (the Russian SVO-ZV system's biocide) | Unknown, probably a screen reading. Delivered in 2009. | Unknown | [96] |
| Microbial Capture Device and coliform test | Bacteria in drinking water | Colony counts and a coliform yes/no read by the crew | Microbial Capture Device quarterly; coliform monthly (requirement: none per 100 mL) | [95] |
| Surface Sampler Kit and Microbial Air Sampler | Bacteria on surfaces and in air | Colony counts read by the crew; some samples returned for identification | Unknown | [83][97] |
| MinION DNA sequencer (Biomolecule Sequencer, BioMole) | Identifies microbes on board without culturing | Sequencing files on a laptop. Data have been processed on board with Spaceborne Computer-2. First on-board identifications in 2017. | As needed | [83][97] |

### 3.3 Noise

| Equipment | What it measures | Type of output | How often | Src |
|---|---|---|---|---|
| Acoustic Monitor: Svantek SV 102A+ | Noise exposure, crew-worn or placed in a module | Recorded files analysed on the ground. Results are split into a 16-hour work period and an 8-hour sleep period, with a 3-dB exchange rate. | Continuous 24-hour crew-worn sessions since Increment 53 (November 2017) | [98] |
| Svantek SV 104A and SV 971A | Body-worn dosimeter and fixed monitor | Tested by ESA on Axiom Mission 4 (2025) as possible successors | Test | [99] |
| Quest NoisePro DLX | Earlier noise dosimeter | Replaced by the Svantek unit | Retired | [100] |

Noise limits were exceeded in 41% of crew dosimetry measurements since Increment 17 (2008). The measurements do not account for hearing protection [98].

### 3.4 Radiation

| Equipment | What it measures | Type of output | How often | Src |
|---|---|---|---|---|
| Crew Active Dosimeter (CAD), Mirion | Personal dose for each crew member (direct ion storage) | Time-resolved dose history on the device. Reader path not public. | Worn continuously; in ISS crew use since 2020. Also carried on Artemis II. | [101][102][103] |
| Intravehicular Tissue Equivalent Proportional Counter (IV-TEPC) | Absorbed dose inside the station; the reference for other detectors | Telemetry to the ground | Continuous | [104][105] |
| ISS Radiation Assessment Detector (ISS-RAD) | Charged particles and fast neutrons (two detectors) | Telemetry to the ground. Also works as an alarm when the dose rate reaches a level where the crew may need to shelter. | Continuous; moved between modules during its first ~3.5 years | [105][102] |
| Radiation Environment Monitors (Timepix) | Single particle hits, absorbed dose | Five units from Oct 2012, plugged into station laptops by USB (unconfirmed) | Continuous | [104] |
| Radiation Environment Monitor 2 (REM2) | Area dose | Used as a comparison for crew doses | Continuous | [101] |
| European Crew Personal Active Dosimeter (EuCPAD) | Personal dose (ESA) | Wearable unit plus a storage unit that charges it and transfers data. First flew with Andreas Mogensen in 2015. | Per mission | [106] |
| Pille-ISS | Thermoluminescent dosimeters with an on-board reader (Russian segment) | Reader values used by IBMP | One dosimeter read automatically every 90 minutes, seven read monthly, two for spacewalks; in use since Oct 2003 | [107] |
| DOSIS-3D (ESA/DLR) | Radiation map of the Columbus module | Active data sent down; passive detectors returned | Unknown status | [108] |

### 3.5 Light and sleep

| Equipment | What it does | Data | Src |
|---|---|---|---|
| Solid State Lighting Assemblies | LED lights with three modes: general (about 4500 K), phase-shift (about 6500 K, blue-rich, to shift sleep timing) and pre-sleep (about 2700 K, blue-reduced). Installed from about 2016-2017. Sources disagree on the exact colour temperatures. | None; it is a light, not a sensor | [109] |
| US crew quarters | Private sleep cabins with their own ventilation. Up to four can be installed in Node 2. The first two arrived on STS-126 in November 2008. | None | [110][111] |
| Russian crew quarters (Kayuta) | Two cabins in the Zvezda module | None | [111] |

### 3.6 Exercise

Crews exercise about two hours a day (unconfirmed: no source given). Collecting exercise heart rate and force data on the ISS proved "far more complex and challenging than anticipated", partly because of electromagnetic interference on the station [112].

| Equipment | What it does | Data | Src |
|---|---|---|---|
| Advanced Resistive Exercise Device (ARED) | Weight training with vacuum cylinders | Instrumented session data (loads, repetitions). Location in Node 3 and a maximum load of about 600 lbf are (unconfirmed). | [113][114] |
| T2 treadmill (COLBERT) | Running with a harness and bungees; in use since 2009 | Speed, duration, harness load, ground reaction forces | [113][115] |
| CEVIS exercise bike | Cycling and fitness tests | Workload, cadence, duration, heart rate. Still named by ESA and NASA in 2026. Danish Aerospace says its FERGO ergometer replaced "the old CEVIS" in 2023; how the two relate is unresolved. | [116][117] |
| European Enhanced Exploration Exercise Device (E4D) | One platform for aerobic and resistive exercise | On board in 2026; crew replaced parts in April 2026 | [118] |
| OnePortal (NASA JSC software) | One common screen across several exercise devices; collects, stores and displays data | Export format unknown | [114] |
| BD-2 treadmill and VELO bike (Russian segment) | Russian treadmill (parts arrived 2012-2013, replaced BD-1) and bike | Unknown; probably to IBMP | [119][120] |
| Penguin suit (Russian) | Elastic bands load the body during normal activity | None | [120] |

A 2022 analysis of flight records found a median of 84 completed aerobic sessions on T2 and 65 on CEVIS [115].

## 4. How medical care works on board

### 4.1 Who does what

- **Crew Medical Officers (CMOs).** Usually two per crew, a primary and a backup. They are not doctors. They run the medical hardware, do exams, give first aid and advanced life support, and carry out procedures with ground guidance. Reported CMO training time differs by source: about 15, 34 or 40 hours (unconfirmed) [121][122].
- **Flight surgeon.** A physician on the "Surgeon" console at Mission Control Houston. Runs the private medical conferences, guides diagnosis and treatment, and advises the flight director on medical go/no-go, including early return [1][123].
- **Biomedical engineers (BMEs).** Flight controllers for the medical hardware. They plan and send up medical procedures and fix device problems. Together with the flight surgeons they form the Integrated Medical Group [124].
- **Partners.** Each expedition has a lead NASA crew surgeon and a Russian crew surgeon from the Gagarin Cosmonaut Training Center. Day-to-day issues are handled in real time from Houston and from the Russian mission control (TsUP). Unresolved issues go to a weekly Space Medicine Operations Team meeting (2008 source) [2]. ESA, JAXA and CSA have their own flight surgeons for their astronauts [125].
- **Boards.** International boards (MMPB, MSMB, MMOP) set shared medical policy, certify crew and write the medical requirements. MMOP has working groups on clinical medicine and on medical informatics and technology [125][2].

### 4.2 Routine contact

- **Private Medical Conference (PMC).** Weekly, one crew member at a time, about 15 minutes, with the flight surgeon. It covers sleep, exercise, food and symptoms. Only the medical team listens. A crew member can ask the flight director for an extra PMC at any time [123][126][1].
- **Behavioural health.** A dedicated team supports the crew. "Private Psychological Conferences" about every two weeks are (unconfirmed) [123].
- **Fixed tests.** Standard Measures sessions, monthly WinSCAT, hearing tests and eye exams (sections 2.4 and 2.6).

### 4.3 Procedures and checklists

- Crews follow step-by-step medical procedures, often with a flight surgeon on the line. BMEs plan and send up new or changed procedures [124].
- The public 2015 kit checklist and the 2016 emergency manual show the style: tables of items and numbered steps [26][31].
- The document number and viewer software of today's ISS medical checklist are unknown. The medical flight rules are not public [127].
- A NASA study found the old respiratory pack cue cards hard to use and redesigned them [33].

### 4.4 Emergencies

- For CPR, the patient is moved to the restraint board (CMRS) and strapped down. The 2020 European guideline names the Evetts-Russomano method for immediate CPR and the handstand method on the CMRS for advanced life support [31][34].
- The emergency set is the advanced life support pack, the ventilator pack, the AED and the restraint board [3][25].
- Ultrasound guided from the ground is the main diagnostic tool [8].

### 4.5 Evacuation

- Each crew has its own docked return vehicle (Crew Dragon or Soyuz). A medical return brings the whole crew of that vehicle home [16].
- **Crew-11 (January 2026).** A crew member had a medical event on 7 January 2026, and a spacewalk planned for 8 January was postponed. NASA announced the early return on 8 January, calling it a controlled medical evacuation, not an emergency. Crew-11 undocked on 14 January and splashed down off San Diego, California on 15 January, about 10.5 hours after undocking [128][16][129].
- It was the first medical early return in the ISS's 25-year history. NASA's Chief Health and Medical Officer, J.D. Polk, said the astronaut was stable, that the problem was not caused by the station or spacewalk preparation, and that models predict an event like this about once every three years [130][128].
- Officials said a diagnosis needed the full range of ground diagnostic tools, and waiting another month in orbit was riskier than shrinking the crew for a while [131].
- NASA did not name the person or the condition. On 25 February 2026 Mike Fincke (Crew-11 pilot, Expedition 74 commander) chose to name himself. He said it was a planned return to reach advanced medical imaging not available on the station. The condition is still not public [17][132].
- Fincke said the station's ultrasound played an important role [133].
- Two cosmonauts and NASA's Chris Williams stayed aboard until Crew-12 arrived in February 2026 [16].
- A Soyuz takes about 3.5 hours from undocking to landing on a fast profile (unconfirmed) [134].

### 4.6 What the ISS cannot do

- **Confirmed:** advanced medical imaging is not on board; ultrasound is the imaging tool [132][17]. The lab is limited to a few point-of-care tests [9]. The pharmacy is small and depends on resupply, as the clot case showed [15].
- **Consistent with the sources, but not listed in one NASA document:** no X-ray or CT, no blood transfusion, no surgery beyond minor procedures such as wound closure and dental work (unconfirmed) [135][136].

### 4.7 Standards, records and privacy

- **NASA-STD-3001 Volume 1, Revision C** (approved 15 September 2023) is the current crew health standard [137]. It defines five Levels of Care (I to V); higher levels add more capability, such as imaging and surgery. Which level the ISS is in is (unconfirmed). A NASA memo describes a Level IV system for lunar-orbit missions of up to 42 days [138]. A NASA paper says Level V applies to planetary missions, most likely during transit [135].
- **Records.** NASA health records, including astronauts', fall under the Privacy Act system of records "NASA 10HIMS" (last changed October 2023) [139].
- **Lifetime follow-up.** Former astronauts are followed by Lifetime Surveillance of Astronaut Health (LSAH). The TREAT Astronauts Act (2017) lets NASA also diagnose and treat spaceflight-related conditions [140][141]. A 2026 government document still uses the LSAH name [142].
- **Requirements.** Medical Requirements Integration Documents define which tests are done before, during and after flight [143].
- **Privacy in practice.** In the Crew-11 case NASA kept the person and condition private, and disclosure was left to the astronaut [17].

## 5. Beyond the ISS

| Vehicle or program | Medical equipment | Data and IT | Src |
|---|---|---|---|
| SpaceX Crew Dragon | A medical kit set to NASA Commercial Crew requirements. No public contents list. No digital medical device with a data link was found. | Health data on private Dragon missions came mostly from personal and commercial wearables (see private missions). Starlink laser links on Polaris Dawn (2024) are (unconfirmed). | [144] |
| Orion (Artemis II, April 2026) | A hard-sided prime medical kit, a secondary kit and a medical accessory kit. The list was scoped for the Artemis II lunar flyby: 128 medical conditions, 139 medical resources chosen from 506 candidates, including exactly 5 digital diagnostic devices (ECG, otoscope, stethoscope, pulse oximeter, blood pressure). Kit mass and volume figures (about 30 lb, 1,116 cubic inches) are (unconfirmed). | The BP cuff and pulse oximeter work alone with their own screens. The ECG needs a mobile device or laptop to show its data. Makers and data formats unknown. | [145][146][147][148] |
| Artemis II health studies | ARCHeR wrist actigraphs by Condor Instruments (Brazil): accelerometer, a 10-channel light sensor, temperature sensor and an event button. The crew pressed it together at the farthest point from Earth (about 406,777 km) on 6 April 2026. AVATAR organ chips grown from crew cells (details unconfirmed). | Actigraphy data collected from about six months before to about one month after flight. Storage format and download path unknown. | [149][150][151][152] |
| Artemis II radiation | Mirion Crew Active Dosimeters carried in a pocket, logging each astronaut's dose, back on Earth with the crew on 10 April 2026. Orion's HERA radiation units (press says six; a NASA deck says 2 power and 4 sensor units) use Timepix chips from Advacam. Four DLR M-42 EXT sensors also flew. | HERA is wired to Orion's caution-and-warning system and sounds an audible alarm so the crew can shelter. | [103][153][154] |
| Orion computing and links | No general-purpose server for third-party apps (see section 7.6) | S-band radio is primary. The O2O laser link adds up to 260 Mbps down. | [155][156] |
| China's Tiangong | SonoScape X5 portable ultrasound, reported in use since Shenzhou-12 (June 2021). This is a vendor claim (unconfirmed). Ground staff watching vital signs in real time, and wearables buffering data through link outages, rest on one undated article (unconfirmed). | Formats unknown | [157][158] |
| Russian segment | Telemedicine-first approach; GAMMA-1M monitoring (2004 source), Kardiovektor (section 2.5) | Separate Russian ground path | [80][79] |
| Polaris Dawn (2024) | A commercial device combining blood pressure, heart rate, breathing rate and temperature, plus ultrasound and a throat camera. Maker not named. A Butterfly iQ+ phone-based ultrasound is (unconfirmed). | Unknown | [159][160] |
| Fram2 (2025) | First diagnostic-quality X-rays in spaceflight, with a commercial off-the-shelf portable system (maker not named). 3 of 4 crew were trained (4 hours); 2 were imaged because of time limits. Images of hand, forearm, abdomen, pelvis and chest matched pre-flight quality. The X-ray generator was slightly damaged at landing but still worked. | Published in Radiology. Image format unknown. | [161][162][163] |
| Private missions and TrialX | Garmin smartwatches and BioButton chest sensors on Fram2 and Ax-4 (2025), according to TrialX | TrialX says its EXPAND repository holds data from six missions. These are TrialX's own claims. Vendor-cloud wearables need internet to sync. | [164][165][160] |
| Vast Haven-1 | A medical system with kit contents chosen from a risk model (station design, mission, crew health). Packed in medical cargo bags. Partnership with Cedars-Sinai. A December 2025 research call names remote medical technologies. | Launch no earlier than Q1 2027, uncrewed on Falcon 9, then at least 2 weeks of uncrewed checkout | [166][167][168][169] |
| Axiom Station | No public medical or telemedicine plan found. First module reportedly slipped to 2028 (secondary source). | Unknown | [170][171] |

### 5.1 Future Moon and Mars systems

- **Why it changes.** NASA says ISS medicine relies heavily on pre-flight training and real-time ground guidance, which does not work for exploration [172]. Mars one-way delay reaches about 20 minutes or more, and evacuation will not be possible [24].
- **Medical Data Architecture (MDA).** NASA prototypes of a spacecraft medical data system. Test Bed 1 (2017) combined the Astroskin vest, an IMED CARDIAX ECG and a Medical Dose Tracker app with the open-source OpenEMR record. Later, Astroskin data were sent as telemetry into NASA's core Flight System software. Test Bed 3 (2019) ran in a Gateway habitat analog against Level of Care IV. Ground prototype only; status after 2020 unknown [173][174][175].
- **AMOS.** Software that guided one crew member through ultrasound scans of another without live ground help, on the ISS around 2022-2024 [176][177].
- **Clinical Decision Support and Earth Independent Medical Operations (EIMO).** Software to support, not replace, the crew when the ground cannot help in real time. Still research [178][179].
- **Flexible Ultrasound System.** NASA's next-generation ultrasound project for exploration [180].
- **Gateway cancelled.** Reuters reported on 24 March 2026 that NASA is cancelling the lunar-orbit Gateway and moving to a surface-base plan ("Ignition", about USD 20 billion over seven years, first permanent base targeted for 2030). Not checked against a NASA release [181].
- **Lunar networks.** The LunaNet Interoperability Specification (version 5, February 2025) from NASA, ESA and JAXA builds in store-and-forward networking [182].
- **Edge computing.** HPE's Spaceborne Computer-3 is reportedly planned for a lunar mission later this decade [183].
- **Data standards.** A community (not NASA) HL7 FHIR Implementation Guide for aerospace medicine exists on GitHub Pages; its status is (unconfirmed) [184].

## 6. Earth analog stations (for Demify's first pilot)

| Station | Health devices | Computers and connectivity | Simulated delay (one way) | Src |
|---|---|---|---|---|
| Asclepios (Sasso San Gottardo, Switzerland) | Student-led lunar analog, about 6 crew for about 14 days, with a separate Mission Control. A medical student in Mission Control is responsible for crew health. Experiments include medication-use profiles, behaviour questionnaires, an EPFL ventilation sensor tower and an ultrasound method for non-medical operators. Asclepios VI is covered in a 2026 blog. | Not documented in the sources | Not confirmed | [185][186][187][188] |
| Mars Desert Research Station (MDRS, Utah) | Health devices not documented in the sources. A Health and Safety Officer crew role is (unconfirmed). | Starlink internet with a Wi-Fi 6 mesh across the campus; supports HD video of EVAs | 15 minutes in a Florida Tech crew's 11 EVAs; 10-20 minutes in outreach events; older satellite email gave 8-40 minutes round trip | [189][190][191][192] |
| HI-SEAS (Hawaii) | Wearables for activity, resting heart rate and sleep; biological samples; weekly questionnaires; journals (NASA-funded missions about 2013-2017) | NASA email with a built-in 20-minute delay. Restricted internet, with about 40 minutes before content arrived. One mission had a blackout after a crew member switched on a rogue access point. Problems that take minutes on Earth took days. | 20 minutes (email) | [193][194][195] |
| HERA (NASA Johnson, Houston) | Four-person, 45-day missions on sleep, fatigue, performance and teamwork. Specific sensors not found. | Headsets; text-only communication has been tested | Up to 5 minutes, phased in and out | [196][197] |
| CHAPEA (Mars Dune Alpha, NASA Johnson) | Year-long Mars surface simulations in a 3D-printed habitat. Health devices not found. | Not found | Mission 1 (25 June 2023 to 6 July 2024, 378 days): up to 22 minutes. Mission 2 (19 Oct 2025 to 31 Oct 2026): a "45 minutes each way" figure is very likely the round trip; use about 22 minutes one way. | [198][199][200][201] |
| Concordia (Antarctica, French-Italian, ESA research) | An ESA-sponsored doctor winters over each year and runs the human research. No outside help can arrive during winter. Devices not found. | Satellite phones and satellite internet. One undated article describes dial-up-level speeds and a VPN for one user at a time. Starlink use not confirmed. | Real isolation rather than a simulated delay | [202][203][204][205] |

For context: NASA's real link delays are about 1.3 seconds one way to the Moon and about 3-22 minutes one way to Mars [23][24].

## 7. Computers, network and data links

### 7.1 Two separate worlds on the ISS

| System | What it is | Facts | Src |
|---|---|---|---|
| Multiplexer/Demultiplexer computers (MDMs) | Flight-critical command and control | Honeywell, derived from Space Shuttle units, Intel 386SX processors, linked by MIL-STD-1553 data buses. Boeing's contract produced 51 flight units. Closed to third-party software. | [18] |
| Portable Computer System (PCS) laptops | Crew displays and command terminals for station systems | Command laptop software moved from Windows XP to Debian Linux in 2013 for stability and control | [206][207] |
| Station Support Computers (SSC) | Everyday crew laptops: procedures, inventory, email, science software | Windows-based, on the Joint Station LAN, not on the 1553 buses. An old 70% Windows / 30% Linux split is (unconfirmed). | [208][207] |
| Network servers and storage | Shared storage on the LAN, video encoders, an edge router to the Ku-band system (2019 handbook) | Current server models unknown. A 2025-2026 server replacement is (unconfirmed). | [209][210] |

### 7.2 Crew laptops today

- Since October 2025 (one source), NASA has been replacing older HP ZBooks with new HP workstations. NASA's own name is "HP ZBook G9 Mobile Workstation"; press calls it the ZBook Fury G9 [19][210].
- Reported specs: Intel Core Ultra 9 vPro HX, NVIDIA RTX Pro Blackwell GPU, 128 GB DDR5, four 2 TB NVMe SSDs [211]. These are 2025-generation parts, which do not match the 2022 Fury G9 line, so the exact model name is unresolved (unconfirmed).
- The count conflicts: "over 100" HP workstations aboard versus "35" new notebooks (unconfirmed) [210][212].
- The laptops need a NASA-specific power adapter because the station runs mainly on DC power [212][210].
- The previous generation is reported as "ZBook Fury G2", which is probably garbled; it was most likely the ZBook 15 G2 that HP announced in 2016 (unconfirmed) [19].
- Earlier: an IBM ThinkPad 750C was radiation-tested on Mir in 1994, the ThinkPad A31p served about 10 years, and the T61p was qualified around 2010-2012 [213][214][207].
- Whether the new laptops have ECC memory is unknown.

### 7.3 Network on board

- **Joint Station LAN (JSL).** A station-wide Ethernet network. The US Lab is the backbone node. It carries laptop traffic, file transfer, payload data, crew email, phone and video. It was being upgraded from 100 Mbit to Gigabit around 2019, with network storage and an edge router to the Ku-band system [215][209].
- **Wi-Fi.** Around 2015, internal Wi-Fi was 802.11g for operations only, not for payloads, with 802.11n planned. External Wi-Fi (EWC, 802.11n) carries data from outside payloads [216][215]. The 2026 Wi-Fi standard is unknown.
- **No direct internet.** Since January 2010 crews browse the web by remote desktop to a computer on the ground, only while the Ku-band link is up [20].
- **Email.** Crew email moves as files several times a day (store-and-forward). Mail is screened in Houston, only approved senders get through, and messages are virus-scanned [217][218].
- **Phone and video.** IP phone and video conferencing run over Ku-band; private medical conferences use this path [20][123].

### 7.4 Links to the ground

| Link | Down | Up | Availability and delay | Src |
|---|---|---|---|---|
| ISS Ku-band via TDRS (main high-rate link) | About 517 Mbps user data (the "600 Mbps" headline is the channel rate). A 2024 NASA paper models it as at most 500 Mbps. | About 21 Mbps user data (25 Msps) | About 85% of each orbit (up from about 75%). About 600 ms round trip. Shared by the whole station. | [21][219][220][23] |
| ISS S-band | Commands, core telemetry, voice | | ISS-specific rate unknown | [209][221] |
| TDRS relay satellites | Carry more than 99% of NASA mission data. Ground stations at White Sands and Guam. | | NASA plans to retire TDRS; the timeline is not verified | [222] |
| ESA ColKa (Columbus Ka-band) | Up to 50 Mbit/s operational (hardware can do 400) | Up to 2 Mbit/s (hardware 50) | Via EDRS-A relay to Harwell (UK) to the Columbus Control Centre in Oberpfaffenhofen. Installation spacewalk scheduled 27 Jan 2021. | [223] |
| SCaN Testbed Ka-band (experiment) | Nearly 700 Mbps in tests | | Around 2017 | [224] |
| ILLUMA-T laser terminal with LCRD relay (demo) | Up to 1.2 Gbps | | Launched Nov 2023, ended and jettisoned June 2024. LCRD sessions 2022-2024: 62% succeeded, 17% lost to weather, 21% to technical issues. | [225][226][227] |
| Artemis II O2O laser | Up to 260 Mbps; selectable 20, 40, 80 (nominal), 130, 190, 260 | Up to 20 Mbps | Planned at least 1 hour per day. In flight it beat expectations and returned up to about 484 GB. Radio stayed primary. | [156][228][229][230] |

### 7.5 Store-and-forward and edge computing

- **DTN.** Delay/Disruption Tolerant Networking sends data as "bundles" that wait at each node until the next link is up. NASA's SCaN program funds it, and it is the basis of LunaNet [23][182].
- **HDTN.** NASA Glenn's open-source high-rate DTN. Tested on the ISS in June 2024, the first ISS connection to a NASA field center that bypassed Mission Control. Over 900 Mbps over the laser link is reported (unconfirmed) [23][231].
- **Spaceborne Computer-2 (HPE).** Commercial server hardware on the ISS for on-board processing and AI. Launched February 2021, installed May 2021, 24 experiments by April 2022. About half of it returned to Earth on 11 January 2023 for upgrades. The upgraded unit launched on NG-20 around 30 January 2024 with more than 120 TB of flash storage (one report says 130 TB). Server models (HPE Edgeline EL4000 and ProLiant DL360) are (unconfirmed). Status in 2025-2026 unknown [22][232][233][234][183].
- **Why it matters.** HPE says SBC-2 turned a 1.8 GB DNA dataset (about 12.2 hours to download) into a 92 KB result in 6 minutes, sent down in 2 seconds (vendor figure) [22].
- **Spaceborne Computer-1** flew from 2017 for about a year; launch vehicle and return date are (unconfirmed) [235].

### 7.6 Radiation, approval and lifetime

- **Radiation.** Space radiation causes bit flips in commercial laptop memory and logic. NASA radiation-tests every laptop model before flight. In-flight failure rates were not found [236][214][213].
- **Software approval.** NASA software rules (NPR 7150.2, revision D) sort software by how critical it is, with software assurance under NASA-STD-8739.8. The class and approval path for a crew health app were not verified (unconfirmed). Whether NASA allows Docker on station laptops is unknown.
- **Lifetime.** The ISS is planned to be deorbited around 2030, so any ISS deployment would be short [19].

### 7.7 Orion and Artemis computing

- Orion has two Vehicle Management Computers, each with two Flight Control Modules. They are designed to "fail silent" rather than give a wrong answer. A separate backup flight software system runs on different hardware and software. Built by Honeywell [155][237]. A PowerPC 750FX-based processor is (unconfirmed) [238].
- Orion has no general-purpose server for crew apps. The S-band radio is primary, and contact is lost behind the Moon [228].
- NASA Administrator Jared Isaacman said on 4 February 2026 that Crew-12 (ISS) and Artemis II astronauts may carry personal smartphones. Apple said the iPhone was qualified for long-term use in orbit. The exact model is not confirmed by NASA [239][240].

## 8. What this means for Demify's server and software setup

### 8.1 Demify today, and the facts that matter

Demify is a Next.js 16 web app in a Docker container (Node 24). It runs fully offline with cached snapshots of NOAA and NASA OSDR data. Vital signs are simulated. It is a research prototype, not a certified medical device. The two branches differ:

- **Pitched build (`Project-2-Phase-1`):** readings are stored in a JSON file. Devices post to `POST /api/readings` (Zod-validated, 1 MB per request, up to 600 readings per minute per crew member, cross-origin check). There is **no login or token yet**; protect the demo by binding to 127.0.0.1 (see OPUS_BRIEF.md P0.5).
- **`test` branch:** SQLite (default) or JSON. `POST /api/v1/crew/{crewId}/readings` takes batches of up to 500 readings and 64 KiB, is token-protected, all-or-nothing and idempotent per crew member, mission day and indicator, writes an audit-trail entry per reading, and never overwrites a value the crew entered by hand.

Where this section says "the readings API", it means whichever branch is in use; features that exist only on `test` are marked.

The facts above give eight design constraints:

1. **No internet.** The ISS has no direct internet [20]. Analogs have delayed, restricted or very slow links [194][204].
2. **Gaps and asymmetry.** ISS Ku-band covers about 85% of each orbit; uplink is about 25 times smaller than downlink, and both are shared [21]. Laser links lose sessions to weather and technical issues [227].
3. **Most health data is manual or file-based.** Screen readings, voice relays and files dominate [9][82][89]. Almost no kit item produces data [26].
4. **Medical data is private.** PMCs are private; Crew-11 was kept private; records fall under the Privacy Act [123][17][139].
5. **Commercial hardware sees radiation bit flips**, and ECC on the new laptops is unknown [236].
6. **Moon and Mars need Earth-independent care**, with delays up to about 22 minutes one way [172][24].
7. **Payload devices may not get on station Wi-Fi** [216].
8. **Summaries travel better than raw data**, as Spaceborne Computer-2 showed [22].

### 8.2 Recommendations by stage

All entries in this table are **our recommendation**, based on the facts above.

| Topic | (a) Hackathon demo tomorrow | (b) First analog pilot (Asclepios or MDRS) | (c) Future real spacecraft |
|---|---|---|---|
| Where the server runs | One laptop running the existing Docker image, with Wi-Fi switched off to prove it works offline. | A crew-side laptop or small PC inside the habitat, on the habitat network (for example MDRS's Wi-Fi mesh). A second copy at Mission Control receives synced batches. The cloud is at most an optional backup, never the primary (constraint 1). | An existing approved crew laptop on the station LAN (SSC class), or a hosted payload like Spaceborne Computer-2 via the ISS National Lab. Never on MDMs, 1553 buses or PCS command laptops. On Orion-class vehicles, which have no app server, an offline web app on a crew tablet or phone. |
| Offline-first and sync | Show the app working with no network and one rehearsed `curl` POST to `/api/readings`. (The send-twice, no-duplicate demo works only on the `test` branch's batch API.) | Keep an outbound queue on the crew-side server. Export checksummed batch files (for example NDJSON plus a manifest with SHA-256) when a link exists. Add a configurable delay preset: 0 (ISS-like), 5 min (HERA), 15-20 min (MDRS, HI-SEAS), 22 min (Mars, CHAPEA). | Package batches so they can travel through NASA's existing file-transfer path (the way crew email moves) today and as DTN bundles (HDTN, LunaNet) later. Never assume a live session to the ground. |
| Data volume and bandwidth | Not an issue. Explain that one full API batch (500 readings) is at most 64 KiB. | Readings fit even a dial-up-level link. Send daily summaries first. Put files (ultrasound, X-ray, raw wearable data) in a separate, lower-priority queue. | Same, plus keep app updates small and rare: on the ISS they travel over the small, shared uplink (about 21 Mbps) and on ColKa over 2 Mbit/s. |
| Device inputs | Simulated values (clearly labelled), manual entry forms, and one `curl` POST to the readings API. | Manual entry; CSV and Garmin FIT file import; a small Bluetooth or USB "bridge" script on a laptop or phone that posts JSON; questionnaires and the reaction-time test; image files as attachments. | Manual entry and file import from device laptops as main inputs. No live device links assumed. Export in a FHIR Observation-like shape. Images as referenced files (DICOM where the device exports it). |
| Privacy | Say that no real crew data is used and that the demo runs on 127.0.0.1 only. (API token and per-reading audit trail exist only on `test`; do not show them on the pitched build.) | Roles: crew member, crew medical officer, Mission Control medical (the Asclepios medical student). Crew sees own data first. Logged consent. Encryption at rest. Pseudonymous IDs in exports. | Keep private medical data apart from operational data: a flight director sees only a fit-for-duty flag. Encrypt ground exports for the flight surgeon only. Follow the agency's records rules (for example NASA 10HIMS). |
| Reliability and radiation | Mention the container restart policy and the `/api/health` endpoint. | SQLite in WAL mode, append-only records with corrections as new versions, checksums, an integrity check at start, automatic snapshots to a second disk, a watchdog restart. Prefer hardware with ECC memory if buying a box. | Same software measures, because ECC on station laptops is unknown. Treat every reboot as normal. Keep no state only in memory. |
| Power | Laptop battery. | Run on the laptop or a low-power PC on habitat power. | No new box on the spacecraft unless NASA allocates power and cooling (allocations unknown). Station laptops already need special DC adapters. |
| Approval and certification | Say clearly: research prototype, not a certified medical device, not connected to any ISS system. | Agree data handling and consent with the analog organisers before the mission. | Publish a software bill of materials, pin dependencies, use reproducible builds and automated tests, keep a requirements-to-test trace and a hazard list. Offer a way to run without Docker. Keep people making every decision, and keep the app out of emergency care. |

### 8.3 Where the server runs: the reasoning

- On the ISS, flight-critical computers are closed, and crew laptops sit on a separate LAN [18][208]. A health app belongs on the LAN side. **Our recommendation:** never plan for the command layer.
- The new laptops have plenty of memory and storage, so performance is not the limit [211]. Approval, offline operation and reliability are. **Our recommendation:** do not ask for a dedicated server on a spacecraft; target an existing laptop first.
- Spaceborne Computer-2 shows that commercial server hardware can run on the ISS through the ISS National Lab [233]. **Our recommendation:** treat it as a later, research-payload route, not the starting point.
- Orion has no server for crew apps, and crews may now carry phones [155][239]. **Our recommendation:** make Demify usable as an offline-capable web app on one device, so the same software covers a station LAN and a capsule with no network.
- At analogs, internet is slow or delayed and the crew must manage alone [204][202]. **Our recommendation:** the crew-side server is the source of truth; Mission Control holds a synced copy.

### 8.4 Offline-first and store-and-forward

- Demify already runs offline and its batch API is idempotent. **Our recommendation:** build on this rather than adding live links.
- Add an outbound sync queue that shows what has and has not reached the ground. Give every new record a client-generated ID so resent batches never double-count, which is what DTN retransmissions and lost answers need [23].
- Store device time, server receive time and mission day. The ISS works on GMT/UTC (unconfirmed). Never depend on internet time servers.
- Accept late data. Ground lab results arrive weeks or months after a sample is drawn [9]. Passive dosimeters are read after return [103]. **Our recommendation:** let late results attach to the original record as a new version.
- Remember that data also flows up: OCT baselines are uplinked [57]. **Our recommendation:** allow importing reference data from the ground, not only exporting.

### 8.5 Data volume and bandwidth budget

| Link | Down | Up | Comment | Src |
|---|---|---|---|---|
| ISS Ku-band (whole station) | About 517 Mbps | About 21 Mbps | About 85% of each orbit; shared | [21] |
| ESA ColKa | Up to 50 Mbit/s | Up to 2 Mbit/s | European path to Columbus | [223] |
| Artemis II O2O | 80 Mbps nominal, 260 peak | Up to 20 Mbps | At least about 1 hour per day planned | [156][228] |
| MDRS | Starlink broadband | Starlink broadband | Rate not given in the sources | [189] |
| HI-SEAS | Email with 20-minute delay | Restricted | Internet content took about 40 minutes | [194] |
| Concordia | Dial-up-level (undated report) | One VPN user at a time | Real isolation in winter | [204] |

- Demify's readings are small: the API caps one batch of 500 readings at 64 KiB, and the API documentation says a whole mission for one crew member is a few thousand readings. **Our recommendation:** readings can sync daily even over the worst link in this table.
- Files are the real cost. Ultrasound clips, OCT scans, X-rays, Holter and raw wearable data are far larger. **Our recommendation:** never put them in the JSON body; use a separate attachment endpoint with chunked upload and a checksum, and sync them only when the link allows.
- **Our recommendation:** follow the Spaceborne Computer-2 lesson [22]. Compute trends and alerts on site and send compact summaries first.

### 8.6 Which devices Demify could realistically take data from

| Source | How Demify could take it | Realistic for | Src |
|---|---|---|---|
| Spot readings: BP, SpO2, temperature, body mass, eye pressure, dipstick results, colony counts, CO2 spot checks | Fast manual forms (already the main path on the ISS), with "how it arrived" (typed on board, relayed by voice, entered on the ground) | Demo and all later stages | [30][9][82] |
| Reaction-time and cognitive tests | Demify's own reaction test, scored like the PVT-B (mean reaction time, lapses) | Demo and pilot | [70] |
| Wearables and actigraphs (Garmin, BioButton, Astroskin-type, ARCHeR-type) | File import (Garmin FIT, CSV) or a bridge script. On `test` this needs a new time-series endpoint (its API holds one value per day and indicator); the pitched build's `/api/readings` already accepts timed sensor readings. | Analog pilot | [164][60][149] |
| Bluetooth or USB devices | A small bridge on a laptop or phone reads the device and posts JSON. This follows the USB-to-laptop pattern of the ISS Timepix monitors (unconfirmed) and the USB-powered rHEALTH ONE. | Analog pilot | [104][68] |
| Lab panels (i-STAT-type) | A multi-value reading with a unit per value and the cartridge type, entered by hand or from an export file | Pilot and later | [9] |
| Imaging (ultrasound, OCT, X-ray) | Store the file and its metadata (body part, device, operator) as an attachment; DICOM where the device exports it (DICOM on ISS units is unconfirmed) | Later pilot and spacecraft | [6][56][161] |
| Radiation dose (CAD-type time series) | Import a dose history as time and dose pairs, kept separate from area monitors | Spacecraft | [102] |
| Medical kit inventory and expiry | Manual log or barcode scanner input; no ISS inventory API exists | Pilot and later | [44] |
| Export to the ground or research archives | FHIR Observation-like JSON plus CSV (our recommendation, not a NASA requirement) | Pilot and later | [184][173] |
| Not possible | Live ISS telemetry, the MDM/1553 command layer, the ISS inventory system, live AED data | None | [18][44] |

### 8.7 Privacy

- **Our recommendation:** follow the PMC model [123]. Each crew member has a private space that only they and their surgeon can read. Behavioural-health notes get a stricter level than vital signs.
- Disclosure is the crew member's choice, as in the Crew-11 case [17]. **Our recommendation:** log consent before any sharing, keep the existing audit trail, and let each crew member export their own data (in the spirit of Privacy Act access rights [139]).
- Several agencies share one crew [125]. **Our recommendation:** tag records by agency and allow sync to more than one ground endpoint.
- **Our recommendation:** encrypt the database volume at rest and keep clinical detail out of shared dashboards, notifications, logs and error messages.

### 8.8 Radiation and reliability

- Commercial laptops on the ISS face bit flips, and ECC is unknown [236]. **Our recommendation:** SQLite in WAL mode with full sync, per-record checksums, an integrity check at start-up, automatic snapshots to a second disk, a container restart policy and a health-check watchdog.
- **Our recommendation:** store records append-only. A correction is a new version that points to the old one. This also handles late lab results.

### 8.9 Power

- The station runs mainly on DC, and laptops need special adapters [212]. Power and cooling allocations for payload computers were not found. A USB-powered analyser draws under 2.5 W [68]. **Our recommendation:** add no hardware on a spacecraft; run on what is already there.

### 8.10 Software approval and certification

- NASA classifies software by criticality (NPR 7150.2) (unconfirmed for a crew health app). **Our recommendation:** keep Demify a research and training tool in which people make every decision, never in the critical path of emergency care, and state "research prototype, not a certified medical device" (never "not a medical device" or "decision support": under EU MDR Rule 11 that wording describes medical device software). Alerts should cite their source and threshold and leave decisions to people, as NASA's own decision-support work does [178].
- Docker approval on station laptops is unknown. **Our recommendation:** support running as a plain Node process too.
- **Our recommendation:** start the paperwork early: a software bill of materials, pinned dependencies, reproducible builds, automated tests and a hazard list.

### 8.11 Which pilot first

**Our recommendation:** Asclepios first, then MDRS. Asclepios is Swiss, small and student-run, and already has a medical student in Mission Control responsible for crew health [188][187]. MDRS has Starlink and Wi-Fi and already practises 15-minute delays, so it suits a sync and delay test [189][190]. HERA and Concordia need NASA or ESA research calls. Vast's Haven-1 research calls are a long-term route [169].

## 9. What we must not claim

- That Demify connects to any ISS device, laptop, network or data link today. It does not.
- That NASA, ESA or any agency uses, tests or endorses Demify.
- That Demify is a certified medical device, diagnoses anything, or replaces flight surgeons, CMOs or Private Medical Conferences.
- That the vital signs in the demo are real crew data. They are simulated. The NOAA and NASA OSDR data are cached snapshots, not live feeds.
- That Demify reads real ISS telemetry, ultrasound, OCT, AED or i-STAT data. No public interface for these was found.
- That we know the data formats of ISS medical devices (for example that the Vivid iq exports DICOM on the ISS). This is unconfirmed.
- That Docker is approved on ISS laptops, or that Demify could be installed there easily.
- That the ISS has "600 Mbps for us". The usable rate is about 517 Mbps, shared by the whole station, with gaps.
- Exact laptop model, unit counts or server details beyond what section 7 marks as reported.
- Anything about the Crew-11 condition beyond what NASA and Mike Fincke made public.
- Medicine doses, or that Demify suggests treatment.
- Any claim marked "(unconfirmed)" in this report, stated as a fact.

## 10. Open questions

1. Current (2024-2026) pack names and contents. Have the 2015 checklist packs been reorganised again?
2. Is the LIFEPAK 1000 still the ISS defibrillator, and are its records sent to the ground?
3. Make and model of the Respiratory Support Pack ventilator.
4. How much IV fluid is on board, and is there any electronic infusion pump?
5. How do Vivid iq images reach flight surgeons: DICOM files, live video or both? Which laptop hosts it?
6. Which ISS medical devices (i-STAT, rHEALTH ONE, KUDUwave, OCT) have an electronic export (USB file, serial, network) that an adapter could read?
7. Models of the tonometer, fundoscope, pulse oximeter, blood pressure device and thermometer.
8. Is Bio-Monitor/Astroskin still used after 2023, and in what file format?
9. How is private medical data kept separate on the downlink (encryption, separate channel)?
10. Which Level of Care applies to the ISS under NASA-STD-3001 Volume 1 Revision C?
11. Does NASA allow Docker or other containers on station laptops or servers, and what is the approval path for crew-facing medical software?
12. Can third-party medical devices join station Wi-Fi today, or must they go through a laptop?
13. Current Ku-band coverage, loss-of-signal durations and S-band rates in 2025-2026.
14. Exact model, count, operating systems and ECC status of the new HP laptops.
15. Status of Spaceborne Computer-2 after 2024, and whether users can host containers on it.
16. Orion medical kit models, and how Orion medical data reach Mission Control.
17. Does Asclepios simulate a communication delay, and what health devices and IT does its Mission Control use?
18. Status of NASA's Medical Data Architecture and Earth Independent Medical Operations work after 2020-2024.

Most of these could be checked if ntrs.nasa.gov, nasa.gov and standards.nasa.gov can be read in full.

## Sources

1. NASA, flight surgeons. https://www.nasa.gov/directorates/esdmd/hhp/flight-surgeons
2. NASA, ISS medical operations, NTRS 20080010877 (2008). https://ntrs.nasa.gov/citations/20080010877
3. NASA report on CHeCS and the redesigned medical packs (2011). https://ntrs.nasa.gov/api/citations/20110011351/downloads/20110011351.pdf
4. CHeCS Medical Hardware Catalog v10.0, NTRS 20110022379 (2011). https://ntrs.nasa.gov/citations/20110022379
5. Health Imaging, LIFEPAK 1000 for the ISS (2008). https://healthimaging.com/node/32039
6. GE HealthCare, Vivid iq launches to the ISS (2025). https://www.gehealthcare.com/en/about/newsroom/press-releases/taking-innovative-technology-to-the-final-frontier-ge-healthcares-vivid-iq-ultrasound-system-launches-to-the-international-space-station
7. NASA Ames, Ultrasound-2 on STS-135. https://www.nasa.gov/ames/space-biosciences/ultrasound-2-sts-135/
8. ESA, advanced ultrasound for the space program. https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/International_Space_Station_Benefits_for_Humanity/Advanced_Ultrasound_for_the_Space_Program_and_on_Earth
9. Clinical Chemistry review of ISS lab diagnostics (2023). https://doi.org/10.1093/clinchem/hvad035
10. NASA OCHMO brief on SANS (2024). https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf
11. NASA, WinSCAT report. https://ntrs.nasa.gov/api/citations/20110008700/downloads/20110008700.pdf
12. Engineering News, NASA takes the KUDUwave audiometer to space (2021). https://www.engineeringnews.co.za/article/nasa-takes-the-kuduwave-audiometer-to-space-2021-02-24
13. Space.com, how astronauts weigh themselves. https://www.space.com/space-exploration/human-spaceflight/how-do-astronauts-weigh-themselves-in-space
14. Diaz et al., ISS formulary shelf life, npj Microgravity (2024). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11266549/
15. LSU Health, first reported spaceflight clot and its treatment. https://www.lsuhsc.edu/newsroom/1ST%20Reported%20Occurrence%20and%20Treatment%20of%20Spaceflight%20Medical%20Risk.html
16. NPR, Crew-11 splashdown (Jan 2026). https://www.npr.org/2026/01/15/nx-s1-5677647/nasa-spacex-crew-11-splashdown-return
17. Space.com, NASA names the evacuated astronaut (Feb 2026). https://www.space.com/space-exploration/human-spaceflight/nasa-reveals-the-astronaut-who-required-1st-medical-evacuation-from-the-international-space-station
18. Military & Aerospace Electronics, Honeywell space station computers. https://www.militaryaerospace.com/computers/article/16707644/honeywell-engineers-enhance-space-station-computers
19. Digital Trends, ISS laptop upgrade from HP (2026). https://www.digitaltrends.com/computing/astronauts-on-the-iss-are-getting-a-laptop-upgrade-from-hp/
20. Digital Trends, crew personal web access (2010). https://digitaltrends.com/computing/nasa-gives-space-station-crew-personal-web-access
21. NASA, ISS Ku-band upgrade summary. https://ntrs.nasa.gov/api/citations/20160009326/downloads/20160009326.pdf
22. Business Wire, HPE completes 24 experiments on the ISS (2022). https://www.businesswire.com/news/home/20220404005739/en/Hewlett-Packard-Enterprise-Drives-Innovation-at-the-Extreme-Edge-on-the-International-Space-Station-with-24-Completed-Experiments
23. NASA, HDTN testing on the ISS (2024). https://ntrs.nasa.gov/api/citations/20240007078/downloads/HDTN_ISS_Testing_2024.pdf
24. NASA, communication delays for crewed Mars missions, ASCEND (2022). https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf
25. NASA, ISS medical kit redesign presentation (2011). https://ntrs.nasa.gov/api/citations/20110010924/downloads/20110010924.pdf
26. NASA, 3.001 Medical Kit Contents and Reference checklist (2015). https://www.nasa.gov/wp-content/uploads/2015/03/medical_kit_checklist_-_full_release.pdf
27. Universe Today, medicine shelf life vs a Mars trip. https://www.universetoday.com/articles/the-shelf-life-of-many-medications-is-shorter-than-a-round-trip-to-mars
28. NASA, venous thromboembolism report (2025). https://www.nasa.gov/wp-content/uploads/2025/04/venous-thromboembolism-vte-report-rev1-april-2025.pdf
29. Izvestia, new medical kit for cosmonauts. https://iz.ru/652211/dmitrii-strugovetc/kosmonavtam-otpraviat-lekarstva
30. NASA, ISS medical capability table (2007). https://ntrs.nasa.gov/api/citations/20070032039/downloads/20070032039.pdf
31. NASA ISS medical emergency manual (2016, via Government Attic). https://www.governmentattic.org/19docs/NASA-ISSmedicalEmergManual_2016.pdf
32. Review: mechanical ventilation in orbit (2004). https://iro.uiowa.edu/esploro/outputs/journalArticle/Mechanical-ventilation-in-orbit-emphasis-on/9984006463502771
33. NASA, Respiratory Support Pack cue card study. https://ntrs.nasa.gov/api/citations/20080026032/downloads/20080026032.pdf
34. Guideline for CPR in space, Scand J Trauma Resusc Emerg Med (2020). https://sjtrem.biomedcentral.com/articles/10.1186/s13049-020-00793-y
35. DAIC, AED on the ISS (2008). https://www.dicardiology.com/node/24705
36. SpaceRef, defibrillator for the ISS (2008). https://spaceref.com/?p=52674
37. Healthcare in Europe, defibrillator in space. https://healthcare-in-europe.com/en/news/defibrillator-in-space.html
38. Rossiyskaya Gazeta, IBMP interview (2012). https://rg.ru/2012/05/04/kosmos.html
39. Interfax, Russian segment medical kits. https://www.interfax-russia.ru/military/news_eng/215535
40. Interfax, Soyuz first-aid kits. https://www.interfax-russia.ru/military/news_eng/215517
41. DOAJ record of the ISS formulary study. https://doaj.org/article/44281b90a3514c2d934c467d2d80c255
42. Wotring, medication stability on the ISS, NASA report. https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140003730.pdf
43. EurekAlert, ISS medication study. https://www.eurekalert.org/news-releases/709405
44. NASA, AMIS medical inventory presentation, AsMA (2024). https://ntrs.nasa.gov/api/citations/20240004505/downloads/AMIS_AsMA_2024_final.pdf
45. NASA OCHMO Technical Brief TB-006, Pharmaceuticals (2023). https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-006-pharmaceuticals.pdf
46. NASA/TM-2011-217033, IVGEN results. https://ntrs.nasa.gov/citations/20110014585
47. JAXA repository mirror of the IVGEN report. https://repository.exst.jaxa.jp/dspace/handle/a-is/246186
48. cislunarspace.cn, IVGen Mini (2026, secondary). https://cislunarspace.cn/en/space-news/2026/04/2026-04-23-nasa-ivgen-mini/
49. Aunon-Chancellor et al., Venous thrombosis during spaceflight, NEJM (2020). https://www.nejm.org/doi/full/10.1056/NEJMc1905875
50. News-Medical, first spaceflight venous thrombosis (2020). https://www.news-medical.net/news/20200102/First-reported-occurrence-and-treatment-of-venous-thrombosis-during-spaceflight.aspx
51. EurekAlert, spaceflight clot treatment. https://www.eurekalert.org/news-releases/824124
52. Marshall-Goebel et al., jugular flow in 11 ISS crew, JAMA Netw Open (2019). https://pmc.ncbi.nlm.nih.gov/articles/PMC6902784/
53. AuntMinnie, Vivid iq deployed in space (2025). https://www.auntminnie.com/clinical-news/ultrasound/news/15768372/ge-healthcare-gehcs-vivid-iq-cardiovascular-ultrasound-system-deployed-in-space
54. NASA station blog, ultrasound scans (Aug 2025). https://www.nasa.gov/blogs/spacestation/2025/08/21/ultrasound-scans-on-station-monitor-and-protect-crew-cardiovascular-health/
55. NASA, ISS research facilities overview (2021). https://www.nasa.gov/wp-content/uploads/2018/09/roi_iss_facilities_april2021.pdf
56. Healio, Spectralis OCT used on the space station (2014). https://cm.healio.com/news/optometry/20140217/spectralis-being-used-on-space-station
57. OCT in spaceflight, PMC7118682. https://pmc.ncbi.nlm.nih.gov/articles/PMC7118682
58. ISS daily summary report, 5 June 2013. https://www.nasa.gov/blogs/stationreport/2013/06/05/iss-daily-summary-report-06-05-13/
59. ISS daily summary report, 26 June 2013. https://www.nasa.gov/blogs/stationreport/2013/06/26/iss-daily-summary-report-6-26-13/
60. Hexoskin, Bio-Monitor/Astroskin launch. https://hexoskin.com/blogs/news/bio-monitor-astroskin-to-launch-to-the-international-space-station
61. Smithsonian Air & Space, Bio-Monitor shirt. https://www.smithsonianmag.com/air-space-magazine/canadian-astronaut-will-test-new-bio-monitor-shirt-space-180961270/
62. Canadian Space Agency, Astroskin. https://www.csa-asc.gc.ca/eng/sciences/astroskin.asp
63. CNES, Cardiolab instruments. https://cardiolab.cnes.fr/en/CARDIOLAB/HLTA.htm
64. ESA, biomedical engineering. https://esa.int/Enabling_Support/Preparing_for_the_Future/Space_for_Earth/Space_for_health/Biomedical_engineering
65. Spaceflight Standard Measures, npj Microgravity (2025). https://www.nature.com/articles/s41526-025-00532-6
66. Wikipedia, Human Research Facility 1 (SLAMMD). https://en.wikipedia.org/wiki/Human_Research_Facility_1
67. ISS daily summary report, 2 May 2013. https://www.nasa.gov/blogs/stationreport/2013/05/02/iss-daily-summary-report-05-02-13/
68. rHEALTH, analyzer demonstrated on the ISS (2022). https://www.rhealth.com/rhealth-news/2022/8/23/nasa-successfully-demonstrates-rhealths-powerful-biomedical-analyzer-onboard-space-station-in-a-first-for-space-medicine
69. NASA, ELA presentation, AsMA (2023). https://ntrs.nasa.gov/api/citations/20230006919/downloads/ELA_AsMA_2023_v4.pdf
70. University of Pennsylvania, Cognition test battery. https://www.med.upenn.edu/uep/cognition.html
71. Cognition in spaceflight, PMC11614644. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11614644/
72. NASA, hearing loss risk record Rev B (2025). https://www.nasa.gov/wp-content/uploads/2025/11/hsrb-hearing-loss-risk-record-rev-b-1-web.pdf
73. ISS daily summary report, 4 June 2015. https://www.nasa.gov/blogs/stationreport/2015/06/04/iss-daily-summary-report-6-04-2015/
74. RussianSpaceWeb, Progress MS-26. https://www.russianspaceweb.com/progress-ms-26.html
75. GCTC journal, Kardiovektor results (2022). https://www.gctc.ru/media/files/Periodicheskie_izdaniya/ppk_2022_2_total_43/9_stat.a-lucizkaa_funtova_kireev.pdf
76. NSBRI, Russian cardiovascular experiments. http://nsbri.org/index.html@p=21281.html
77. IAC 2015, COSMOCARD experiment. https://iafastro.directory/iac/archive/browse/IAC-15/A1/IP/28141/
78. ISS daily summary report, 25 May 2015. https://www.nasa.gov/blogs/stationreport/2015/05/25/iss-daily-summary-report-05-25-2015/
79. TEMOS telemedicine report (2004), GAMMA-1M. https://www.egms.de/static/resources/reports/temos2004/TEMOS.pdf
80. Frontiers in Physiology, Russian space medicine (2022). https://frontiersin.org/articles/10.3389/fphys.2022.921487/full
81. NASA, Air Quality Monitor paper (2017). https://ntrs.nasa.gov/api/citations/20170002579/downloads/20170002579.pdf
82. ISS daily summary report, 7 June 2023. https://www.nasa.gov/blogs/stationreport/2023/06/07/iss-daily-summary-report-6-07-2023/
83. NASA, on-board microbe sequencing (2019). https://ntrs.nasa.gov/api/citations/20190025368/downloads/20190025368.pdf
84. NASA, Major Constituent Analyzer paper (2016). https://ntrs.nasa.gov/api/citations/20160010396/downloads/20160010396.pdf
85. Tech Briefs, wearable CO2 monitor for NASA. https://www.techbriefs.com/component/content/article/28027-sensor-assists-nasa-with-wearable-co2-monitor
86. NASA, personal CO2 monitor paper (2018). https://ntrs.nasa.gov/api/citations/20180007627/downloads/20180007627.pdf
87. NASA, compound specific analyzers. https://ntrs.nasa.gov/citations/20050217459
88. ISS daily summary report, 19 Sept 2022. https://www.nasa.gov/blogs/stationreport/2022/09/19/iss-daily-summary-report-9-19-2022/
89. CORE, AQM operations. https://core.ac.uk/works/24781102
90. ISS daily summary report, 10 Sept 2015. https://www.nasa.gov/blogs/stationreport/2015/09/10/iss-daily-summary-report-09-10-15/
91. Volatile Organic Analyzer operations paper (2012). https://springerlink.bibliotecabuap.elogim.com/content/pdf/10.1007/s12127-012-0107-z.pdf
92. NASA, the operational Anomaly Gas Analyzer, ICES (2026). https://ntrs.nasa.gov/api/citations/20260003174/downloads/AGA%20Paper%20with%20ICES%20Header%20post%20Review.pdf
93. NASA, AQM operations to 2030 (2023). https://ntrs.nasa.gov/citations/20230010644
94. NASA Spinoff, Total Organic Carbon Analyzer. https://spinoff.nasa.gov/node/10680
95. NASA, ISS water monitoring, ICES (2024). https://ntrs.nasa.gov/api/citations/20240005682/downloads/ICES_Paper-Template_2024_112_Final_2.pdf
96. NASA, Colorimetric Water Quality Monitoring Kit. https://ntrs.nasa.gov/citations/20100017254
97. NASA, microbes on the International Space Station. https://www.nasa.gov/humans-in-space/our-relationship-to-microbes-on-the-international-space-station
98. NASA, ISS crew noise exposure, Inter-Noise (2021). https://ntrs.nasa.gov/api/citations/20210016305/downloads/Inter-Noise2021_Paper2219_FINAL%20Manuscript.pdf
99. Svantek, Axiom-4 case study (2025). https://cdn.svantek.com/wp-content/uploads/2025/11/A4_Case-Study__SV104A_SV971A_ISS_Axiom-4_PDF.pdf
100. NASA, ISS acoustics paper (2015). https://ntrs.nasa.gov/api/citations/20150011048/downloads/20150011048.pdf
101. The ISS Crew Active Dosimeter, Life Sci Space Res (2023). https://read.qxmd.com/read/37945094/the-importance-of-time-resolved-personal-dosimetry-in-space-the-iss-crew-active-dosimeter
102. NASA Space Radiation Analysis Group, how radiation is measured. https://srag.jsc.nasa.gov/spaceradiation/how/how.cfm
103. Mirion, from RAM to CAD through Artemis II. https://www.mirion.com/discover/knowledge-hub/articles/stories/from-ram-to-cad-the-evolution-of-astronaut-radiation-monitoring-through-artemis-ii
104. Timepix radiation monitors on the ISS, PMC3941488. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3941488/
105. NASA THREE encyclopedia, ISS-RAD. https://three.jsc.nasa.gov/Encyclopedia/Article/62
106. ESA, European Crew Personal Active Dosimeter. https://www.esa.int/Enabling_Support/Space_Engineering_Technology/European_Crew_Personal_Active_Dosimeter_EuCPAD
107. IAC 2009, Pille-ISS dosimeter system. https://iafastro.directory/iac/archive/browse/IAC-09/A1/4/3436/
108. DLR, DOSIS 3D (2018). https://elib.dlr.de/125417/1/ME-SBA-2018-Berger%20WRMISS%202018_DOSIS%203D.pdf
109. NASA, Solid State Lighting Assemblies (2016). https://ntrs.nasa.gov/api/citations/20160005080/downloads/20160005080.pdf
110. SAE 2009-01-2367, ISS crew quarters. https://papers.sae.org/publications/technical-papers/content/2009-01-2367/
111. NASA, ISS crew quarters, NTRS 20090014830. https://ntrs.nasa.gov/citations/20090014830
112. Exercise data collection on the ISS, Extreme Physiology & Medicine (2016). https://extremephysiolmed.biomedcentral.com/track/pdf/10.1186/s13728-016-0050-4
113. NASA, ISS exercise hardware (2009). https://ntrs.nasa.gov/api/citations/20090007467/downloads/20090007467.pdf
114. NASA, JSC exercise countermeasures (OnePortal). https://www.nasa.gov/reference/jsc-exercise-countermeasures
115. In-flight exercise records, PMC9898566 (2022). https://pmc.ncbi.nlm.nih.gov/articles/PMC9898566
116. ESA, Sophie Adenot on the CEVIS bike (Feb 2026). https://www.esa.int/ESA_Multimedia/Images/2026/02/Sophie_Adenot_exercising_on_the_CEVIS_bike
117. Danish Aerospace, FERGO flight ergometer. https://danishaerospace.com/en/products-sep/fergo
118. NASA image, E4D maintenance (April 2026). https://www.nasa.gov/image-detail/amf-iss074e0490816/
119. RussianSpaceWeb, Zvezda treadmill. https://russianspaceweb.com/iss_sm_treadmill.html
120. UHCL SHOP 2023, exercise is space medicine. https://www.uhcl.edu/hhpi/spaceflight-human-optimization-performance-summit/documents/shop-23-presentation-exercise-is-space-medicine.pdf
121. NASA AsMA 2021 abstract, CMO training. https://ntrs.nasa.gov/citations/20205008925
122. NewSpace Economy, ISS emergency procedures (2025). https://newspaceeconomy.ca/2025/09/20/life-above-earth-emergency-procedures-and-medical-capabilities-on-the-international-space-station
123. NASA podcast, Mission Control crew health consoles. https://www.nasa.gov/podcasts/houston-we-have-a-podcast/mission-control-crew-health-consoles
124. NASA, biomedical flight controllers. https://www.nasa.gov/directorates/esdmd/hhp/biomedical-flight-controllers/
125. Canadian Space Agency, medical support. https://www.asc-csa.gc.ca/eng/astronauts/space-medicine/medical-support.asp
126. Drug Discovery News, keeping astronauts healthy. https://www.drugdiscoverynews.com/keeping-astronauts-healthy-in-space-15204
127. SpacePolicyOnline, Crew-11 return not an emergency. https://spacepolicyonline.com/news/nasa-decides-to-bring-crew-11-home-early-but-not-an-emergency/
128. Spaceflight Now, Crew-11 to cut mission short (Jan 2026). https://spaceflightnow.com/2026/01/09/crew-11-to-cut-mission-short-and-return-to-earth-due-to-medical-issue/
129. Space.com, Crew-11 returns to Earth (Jan 2026). https://www.space.com/space-exploration/international-space-station/spacex-crew-11-astronauts-return-to-earth-after-1st-ever-medical-evacuation-of-iss
130. Smithsonian, first medical evacuation of the ISS (Jan 2026). https://www.smithsonianmag.com/smart-news/nasa-to-bring-iss-crew-home-early-because-of-an-astronauts-health-issue-marking-the-first-medical-evacuation-of-the-spacecraft-180987983/
131. Scientific American, evacuated astronauts return (2026). https://www.scientificamerican.com/article/evacuated-iss-astronauts-return-to-earth-as-nasa-prepares-for-artemis-moon/
132. CBS News, Mike Fincke statement (Feb 2026). https://www.cbsnews.com/amp/news/mike-fincke-astronaut-medical-issue-aboard-iss
133. Space.com, Crew-11 post-flight press conference. https://www.space.com/space-exploration/human-spaceflight/medically-evacuated-crew-11-astronauts-to-discuss-their-shortened-iss-mission-today-watch-it-live
134. We Report Space, when the ISS needs 911 (secondary). https://www.wereportspace.com/blog/when-the-iss-needs-911
135. NASA, interpretation of NASA-STD-3001 Levels of Care. https://ntrs.nasa.gov/api/citations/20170004345/downloads/20170004345.pdf
136. NASA OCHMO Technical Brief, spaceflight medical care (Rev C). https://www.nasa.gov/wp-content/uploads/2023/07/ochmo-tb-033-spaceflight-experience-medical-care-rev-c.pdf
137. NASA-STD-3001 Volume 1 Revision C (2023). https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf
138. NASA TM-20205010009, Level of Care IV system for lunar orbit. https://ntrs.nasa.gov/api/citations/20205010009/downloads/NASA-TM-20205010009.pdf
139. Federal Register, NASA 10HIMS system of records (Oct 2023). https://www.govinfo.gov/content/pkg/FR-2023-10-10/pdf/2023-22412.pdf
140. NASA, TREAT Astronauts Act. https://www.nasa.gov/directorates/esdmd/hhp/treat/about-treat-astronauts-act/
141. Federal Register, TREAT Astronauts interim final rule (2020). https://www.federalregister.gov/documents/2020/03/18/2020-04784/to-research-evaluate-assess-and-treat-treat-astronauts
142. OMB information collection naming LSAH (2026). https://omb.report/icr/202606-2700-004/doc/172109800.pdf
143. NASA Life Sciences Portal, MRID book. https://nlsp.nasa.gov/explore/lsah/mrid_book.pdf
144. NTRS 20230007569, Commercial Crew Program medical operational challenges. https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_nasa_ntrs_20230007569
145. NASA, Orion medical system: 128 conditions (2021). https://ntrs.nasa.gov/citations/20210025203
146. NASA, Orion spacecraft medical kit, AsMA (2022). https://ntrs.nasa.gov/api/citations/20220006714/downloads/MPCV-AsMA-2022-Orion_Spacecraft_Medical_Kit.pptx.pdf
147. NASA, Orion medical system development (2024). https://ntrs.nasa.gov/api/citations/20240004890/downloads/Orion%20Medical%20System%20Development.pdf
148. NASA, Artemis medical system overview, ASCEND (2023). https://ntrs.nasa.gov/api/citations/20230015294/downloads/ASCEND_Artemis_Med_System_Dvlpnt_Ovrvw_Final.pdf
149. Agencia FAPESP, Brazilian actigraph on Artemis II (2026). https://agencia.fapesp.br/58065
150. Universe Magazine, wrist device on Artemis II (2026). https://universemagazine.com/en/wrist-device-monitored-the-astronauts-health-during-the-flight-to-the-moon/
151. NASA, ARCHeR. https://www.nasa.gov/reference/archer
152. CTV News, Artemis II organ chips (2026). https://www.ctvnews.ca/sci-tech/article/why-nasa-sent-organ-chips-of-the-artemis-ii-crew-into-space/
153. NASA, radiation seminar slides (2025). https://ntrs.nasa.gov/api/citations/20250002757/downloads/Slides_Seminar_2025.pdf
154. Astrobiology.com, Advacam chips on Orion (2026). https://astrobiology.com/2026/02/05/tricorder-tech-cosmic-radiation-aboard-artemis-ii-orion-will-be-monitored-by-six-specialized-chips-supplied-by-advacam/
155. CACM, how NASA built Artemis II's fault-tolerant computer. https://cacm.acm.org/news/how-nasa-built-artemis-iis-fault-tolerant-computer/
156. NASA, O2O presentation (2025). https://ntrs.nasa.gov/api/citations/20250000154/downloads/2025_01_K_Shtyrkova_O2O.pdf
157. SonoScape press release, X5 in space (2021). https://prnewswire.com/news-releases/sonoscapes-x5-is-aboard-to-deliver-ultrasound-imaging-in-space-301336236.html
158. BioSpectrum Asia, Chinese space medical monitoring. https://www.biospectrumasia.com/index.php/news/27/18619/china-prepares-for-human-ultrasound-imaging-in-an-aerospace-medical-research.html
159. Tomorrow's World Today, Polaris Dawn health research (2024). https://tomorrowsworldtoday.com/?p=35524
160. TrialX, wearable devices in space health research. https://trialx.com/space-health-research-wearable-devices/
161. RSNA press release, first X-rays in space (2026). https://www.rsna.org/media/press/2026/2663
162. Radiology Business, first diagnostic-quality X-rays in spaceflight. https://radiologybusiness.com/topics/healthcare-management/healthcare-quality/portable-system-captures-1st-diagnostic-quality-x-rays-during-spaceflight
163. Radiology journal article on the Fram2 X-rays. https://pubs.rsna.org/doi/10.1148/radiol.260258
164. TrialX, Fram2 health data collection. https://trialx.com/facilitating-health-research-data-collection-for-the-first-human-spaceflight-to-earths-polar-regions-fram2/
165. TrialX, how health data is collected in space missions. https://trialx.com/how-health-data-is-collected-in-space-missions/
166. Payload, Haven-1 delayed to 2027. https://payloadspace.com/vast-delays-haven-1-launch-to-2027/
167. Vast, designing Haven-1. https://www.vastspace.com/updates/designing-haven-1-vasts-human-in-the-loop-approach
168. Vast and Cedars-Sinai partnership. https://www.vastspace.com/updates/vast-and-cedars-sinai-partner-on-microgravity-science-and-crew-health
169. Vast, call for research proposals (2025). https://www.vastspace.com/updates/vast-announces-call-for-research-proposals
170. Space Diplomacy, who does ER in space. https://spacediplomacy.substack.com/p/who-does-er-in-space
171. Behind the Black, Axiom station schedule (secondary). https://behindtheblack.com/?p=120741
172. NASA ExMC abstract on ISS medical operations (2024). https://ntrs.nasa.gov/citations/20240004905
173. NASA, Medical Data Architecture Test Bed 1 (2017). https://ntrs.nasa.gov/citations/20170000744
174. NASA, Medical Data Architecture (2018). https://ntrs.nasa.gov/api/citations/20180000767/downloads/20180000767.pdf
175. NASA, Medical Data Architecture Test Bed 3 (2020). https://ntrs.nasa.gov/citations/20200000568
176. NASA, AMOS paper (2024). https://ntrs.nasa.gov/api/citations/20240012964/downloads/Amos%20Paper%20with%20Figures%20and%20Legends.pdf
177. NASA, AMOS abstract (2022). https://ntrs.nasa.gov/citations/20220014327
178. NASA Ames, clinical decision support for Earth-independent medical operations. https://www.nasa.gov/centers-and-facilities/ames/ames-science/ames-space-biosciences/a-clinical-decision-support-system-for-earth-independent-medical-operations
179. NASA ExMC presentation, IWS (2024). https://ntrs.nasa.gov/api/citations/20240001379/downloads/2024%20IWS%20SoSA%20FINAL.pdf
180. NASA HRP, Flexible Ultrasound System. https://hrp.grc.nasa.gov/explore/exploration-medical-capability/flexible-ultrasound-system/
181. BNN Bloomberg (Reuters), NASA to cancel Gateway for a Moon base (Mar 2026). https://www.bnnbloomberg.ca/business/2026/03/24/nasa-to-spend-us20-billion-on-moon-base-cancel-orbiting-lunar-station/
182. NASA, LunaNet Interoperability Specification v5 (2025). https://www.nasa.gov/wp-content/uploads/2025/02/lunanet-interoperability-specification-v5-baseline.pdf
183. SpaceNews, Spaceborne Computer-2 upgrade and SBC-3. https://spacenews.com/?p=440886
184. Community aerospace medicine FHIR Implementation Guide (not NASA). https://awatson1978.github.io/aerospace-medicine-ig/toc.html
185. Asclepios blog. https://asclepios.ch/?p=11685
186. Asclepios blog (Asclepios VI, 2026). https://asclepios.ch/?p=14061
187. Swissinfo, Moon mission in the Gotthard. https://www.swissinfo.ch/eng/science/moon-mission-in-the-gotthard-how-claude-nicollier-trains-with-students-in-the-bunker/87279459
188. SRF, medical student in the Gotthard Moon mission. https://www.srf.ch/radio-srf-1/mondmission-im-gotthard-wie-eine-medizinstudentin-das-leben-auf-dem-mond-simuliert-1
189. RedOrbit, Starlink at the Mars Desert Research Station. https://redorbit.com/mars-society-installs-starlink-at-mars-desert-research-station
190. Florida Tech, simulated Mars mission at MDRS. https://news.fit.edu/science/all-florida-tech-crew-completes-weeklong-simulated-mars-mission-in-utah/
191. Outschool, Live from Mars. https://outschool.com/campaigns/live-from-mars
192. IEEE Spectrum, a dry run at Mars. https://spectrum.ieee.org/a-dry-run-at-mars/particle-3
193. Scientific American blog, what it's like to live on Mars (HI-SEAS). https://www.scientificamerican.com/blog/guest-blog/what-it-s-like-to-live-on-mars/
194. Quartz, HI-SEAS year-long mission (2015). https://qz.com/490943/nasa-funded-recruits-begin-a-year-long-isolation-mission-to-simluate-conditions-on-mars
195. Mars Chronicles, when a Mars simulation goes wrong. https://www.hjkc.de/_blog/10486-mars-chroniken-when-a-mars-simulation-goes-wrong/
196. NASA, HERA crew navigates communication delays. https://www.nasa.gov/humans-in-space/houston-do-you-copy-hera-crew-navigates-communication-delays
197. NASA, HERA overview (2017). https://ntrs.nasa.gov/api/citations/20170003940/downloads/20170003940.pdf
198. Good Morning America, CHAPEA crew exits after 378 days (2024). https://www.goodmorningamerica.com/news/story/nasas-mars-simulator-crew-emerged-after-378-days-111755446
199. Universe Today, CHAPEA mission 1 begins (2023). https://www.universetoday.com/162265/nasa-locks-four-volunteers-into-a-one-year-mission-in-a-simulated-mars-habitat/
200. Universe Magazine, CHAPEA mission 2 (2026). https://universemagazine.com/en/nasas-second-crew-spent-378-days-in-martian-isolation/
201. autoevolution, CHAPEA mission 2 exit date (2026). https://www.autoevolution.com/news/second-crew-of-mars-astronauts-nasa-locked-up-for-a-year-are-coming-out-on-october-31-277265.html
202. ESA, Spaceship Concordia. https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Concordia/Spaceship_Concordia
203. ESA, Winter over (2022). https://esa.int/ESA_Multimedia/Images/2022/08/Winter_over
204. ITPro, software maintenance at Concordia. https://www.itpro.com/infrastructure/network-internet/370075/performing-software-maintenance-at-the-end-of-the-earth
205. ENEA, Concordia prepares for Moon and Mars missions (2026). https://www.media.enea.it/en/press-releases-and-news/years-archive/year-2026/space-antarctica-the-concordia-base-prepares-for-human-missions-on-the-moon-and-mars.html
206. Digital Trends, ISS laptops move to Linux (2013). https://www.digitaltrends.com/computing/international-space-station-ditches-windows-for-linux/
207. TechRepublic, from the ThinkPad to the iPad on the ISS. https://www.techrepublic.com/pictures/photos-from-the-thinkpad-to-the-ipad-the-tech-used-on-the-iss/
208. Gizmodo, how astronauts use laptops (2014). https://gizmodo.com/how-astronauts-use-laptops-on-the-international-space-s-1654962539
209. NASA, ISS communications handbook (2019). https://ntrs.nasa.gov/api/citations/20190028718/downloads/20190028718.pdf
210. Tech Times, NASA upgrades ISS computers (Apr 2026). https://www.techtimes.com/articles/316063/20260422/nasa-upgrades-iss-computers-hp-zbook-g9-laptops-faster-space-operations.htm
211. PC Gamer, new ISS laptops with 128 GB RAM (2026). https://www.pcgamer.com/hardware/gaming-laptops/theres-no-memory-crisis-in-space-as-astronauts-on-the-iss-are-getting-new-laptops-with-128-gb-of-ram-and-a-seriously-beefy-specs-sheet/
212. Yahoo Tech, ISS laptop upgrade (2026). https://tech.yahoo.com/science/articles/astronauts-iss-getting-laptop-upgrade-182341624.html
213. ThinkPad 750C radiation test on Mir (1994). https://data.zhenzhi.com/details/1/1003380025
214. NASA, ThinkPad T61p radiation testing. https://ntrs.nasa.gov/api/citations/20120013297/downloads/20120013297.pdf
215. NASA/Boeing, ISS Joint Station LAN briefing (2009). https://ntrs.nasa.gov/api/citations/20090013859/downloads/20090013859.pdf
216. NASA, ISS wireless presentation (2015). https://ntrs.nasa.gov/api/citations/20150009488/downloads/20150009488.pdf
217. Office Watch, using Outlook from orbit (2009). https://office-watch.com/2009/using-outlook-from-orbit
218. Route Fifty, crew email in space (1999). https://www.route-fifty.com/digital-government/1999/02/buzz-lightyear-you-have-mail/309727/
219. NASA, ISS Ku-band planning (2016). https://ntrs.nasa.gov/api/citations/20160007352/downloads/20160007352.pdf
220. Universe Today, ISS gets a 600 Mbps connection (2019). https://www.universetoday.com/143221/upgraded-iss-now-has-a-600-megabit-per-second-internet-connection/
221. NASA Near Space Network services brochure. https://explorers.larc.nasa.gov/APSMEX25/SMEX/pdf_files/Prog05e_NSN_Services_Brochure.pdf
222. NASA, TDRS fact sheet. https://nasa.gov/wp-content/uploads/2022/04/tdrsfactsheet_3.pdf
223. ESA, astronauts to boost European connectivity (ColKa). https://www.esa.int/Applications/Telecommunications_Integrated_Applications/Astronauts_to_boost_European_connectivity
224. NASA, SCaN Testbed Ka-band results (2017). https://ntrs.nasa.gov/api/citations/20170004117/downloads/20170004117.pdf
225. Gunter's Space Page, ILLUMA-T. https://space.skyrocket.de/doc_sdat/illuma-t.htm
226. NASA, ILLUMA-T, NTRS 20250000325. https://ntrs.nasa.gov/citations/20250000325
227. NASA, LCRD results, Ka Conference (2024). https://ntrs.nasa.gov/api/citations/20240011470/downloads/LCRD%20KaConf%202024.pdf
228. NASA Goddard, O2O. https://www.nasa.gov/goddard/esc/o2o/
229. Federal News Network, Nikki Desch on laser communications (Jul 2026). https://federalnewsnetwork.com/space-operations/2026/07/space-satellite-exchange-2026-nasas-nikki-desch-on-the-future-of-laser-communications/
230. NASA, O2O SPIE paper (2025). https://ntrs.nasa.gov/api/citations/20250000856/downloads/K_Shtyrkova_SPIE_PW2025.pdf
231. R&D World, HDTN wins R&D 100 award. https://www.rdworldonline.com/nasa-rd-100-winner-enables-high-speed-data-transfer-from-space/
232. HPE, Spaceborne Computer timeline. https://www.hpe.com/info/spaceborne-timeline
233. ISS National Lab, Spaceborne Computer-2 on NG-20. https://www.issnationallab.org/release-ng20-hpe-spaceborne-computer2/
234. DatacenterDynamics, upgraded Spaceborne Computer-2. https://datacenterdynamics.com/en/news/hpe-readies-launch-of-upgraded-iss-based-spaceborne-computer-2
235. Computer Weekly, HPE space computer progress report. https://www.computerweekly.com/news/252515535/HPE-offers-up-progress-report-on-how-its-space-bound-supercomputer-is-performing
236. NASA, radiation effects on commercial electronics, NTRS 20200001591. https://ntrs.nasa.gov/citations/20200001591
237. Honeywell, technologies on Artemis II (Apr 2026). https://aerospace.honeywell.com/us/en/about-us/press-release/2026/04/mission-critical-technologies-enable-nasas-crewed-artemis-ii-mission
238. NASA, NSREC poster (2023). https://ntrs.nasa.gov/api/citations/20230010122/downloads/2023-NSREC-Poster.pdf
239. AppleInsider, NASA approves personal iPhones (Feb 2026). https://appleinsider.com/articles/26/02/05/iphone-in-space-nasa-gives-approval-for-personal-iphones-to-artemis-astronauts
240. MacRumors, NASA allows iPhones on space flights (Feb 2026). https://www.macrumors.com/2026/02/06/nasa-allows-iphones-on-space-flights/
