import type { BodyRegionId, HazardId, IndicatorId, Status } from "../types";

/**
 * Demify medical knowledge base.
 *
 * Every threshold carries a `basis` tag so the UI can be honest about where a
 * number comes from:
 *   NASA = NASA / CSA primary source (NASA-STD-3001, OCHMO technical briefs, HRP)
 *   CLIN = standard general clinical range (AHA, ADA, NEWS2, MedlinePlus)
 *   APP  = band derived for this app from the sources; NOT an official limit
 *
 * Full research notes with every reference: docs/research/health-knowledge-base.md
 * Research prototype, not a certified medical device: these bands drive a
 * research and training simulation. Flight surgeons stay the authority.
 *
 * Escalation (contact the flight surgeon) is NOT implied by a critical band.
 * It comes only from the explicit rules on each indicator:
 *   escalateAbove / escalateBelow  one value strictly beyond the limit
 *   escalateFromBand               band-type indicators (ST segment, SpO2,
 *                                  temperature, vision): any value in that band
 *   persistence                    repeated values (evaluated with history in
 *                                  assess.ts); one value alone never escalates
 *   stormAlert                     a current NOAA solar radiation storm
 * The Guidance "Automatic flag" table is generated from the same fields
 * (escalationFlags), so the stated rules and the code cannot drift apart.
 * Crew actions never name a drug, a dose or an amount: clinical steps defer to
 * the onboard medical checklist and the flight surgeon.
 */

export type Basis = "NASA" | "CLIN" | "APP";

export interface SourceRef {
  label: string;
  url: string;
}

/** Comparison of one value against a persistence threshold. */
export type Comparison = ">" | ">=" | "<" | "<=";

/**
 * Escalation that needs repeated values. A single value never escalates by
 * this rule; assess.ts (persistenceFlag) checks it against the history.
 */
export interface PersistenceRule {
  op: Comparison;
  value: number;
  /** Daily values (one per UTC day): the condition holds on this many consecutive days, today included. */
  days?: number;
  /** Continuous values: the condition holds without a lower reading for this many hours. */
  hours?: number;
  /** Short name shown when the rule is met, e.g. "sleep debt". */
  name?: string;
  /** Status the indicator takes while the rule is met (default: its band status). */
  status?: Status;
}

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  /** Plausible input range for forms / validation. */
  inputRange: [number, number];
  /**
   * Piecewise classification, ascending: value < steps[i][0] => steps[i][1].
   * Values >= the last step get `top`.
   */
  steps: Array<[number, Status]>;
  top: Status;
  basis: Basis;
  /** Human readable bands for the UI. */
  ranges: { nominal: string; caution: string; critical: string };
  /** One value strictly above this escalates (contact the flight surgeon). */
  escalateAbove?: number;
  /** One value strictly below this escalates. */
  escalateBelow?: number;
  /**
   * Band-type indicators: any value classified in this band or worse
   * escalates on its own (ST elevation, SpO2 <= 90 %, a NEWS2 critical
   * temperature, a new vision change).
   */
  escalateFromBand?: "caution" | "critical";
  /** Escalation that needs repeated values (see PersistenceRule). */
  persistence?: PersistenceRule;
  /** Any current NOAA S1+ solar radiation storm escalates (assess.ts). */
  stormAlert?: boolean;
  /** Advice in the finding for a caution value (default "monitor closely"). */
  cautionAdvice?: string;
  /** Continuous wearable signal (assessed on a short window, excluding exercise). */
  continuous?: boolean;
  regions: BodyRegionId[];
  hazards: HazardId[];
  spaceflightEffect: string;
  measurement: string;
  actions: string[];
  escalation: string;
  sources: SourceRef[];
}

const S = {
  std3001: { label: "NASA-STD-3001 Vol. 1 Rev C", url: "https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf" },
  std3001co2: { label: "NASA-STD-3001 Vol. 2, V2 6004", url: "https://standards.nasa.gov/standard/NASA/NASA-STD-3001-VOL-2" },
  radTB: { label: "NASA OCHMO-TB-020 Radiation Protection", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-020-radiation-protection.pdf" },
  co2TB: { label: "NASA OCHMO-TB-004 Carbon Dioxide", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf" },
  sansTB: { label: "NASA OCHMO-MTB-001 SANS", url: "https://www.nasa.gov/wp-content/uploads/2024/02/ochmo-mtb-001-sans.pdf" },
  boneTB: { label: "NASA OCHMO-MTB-013 Bone Loss", url: "https://www.nasa.gov/wp-content/uploads/2026/02/ochmo-mtb-013-bone-loss.pdf" },
  sleepTB: { label: "NASA OCHMO-TB-041 Sleep", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf" },
  circTB: { label: "NASA OCHMO-MTB-009 Circadian Desynchrony", url: "https://www.nasa.gov/wp-content/uploads/2026/03/ochmo-mtb-009-circadian-desynchrony.pdf" },
  waterTB: { label: "NASA OCHMO-TB-027 Water", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-027-water.pdf" },
  nutritionTB: { label: "NASA OCHMO-TB-013 Food & Nutrition", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-013-food-and-nutrition.pdf" },
  behaviorTB: { label: "NASA OCHMO-TB-016 Behavioral Health", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf" },
  orthoTB: { label: "NASA OCHMO-TB-019 Orthostatic Intolerance", url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-019-orthostatic-intolerance.pdf" },
  cardioRisk: { label: "NASA HRP: Risk of Cardiovascular Adaptations", url: "https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/" },
  immuneRisk: { label: "NASA HRP: Risk of Altered Immune Responses", url: "https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/" },
  sleepRisk: { label: "NASA HRP: Inadequate Sleep & Irregular Schedules", url: "https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/" },
  bhRisk: { label: "NASA HRP: Behavioral Conditions", url: "https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/" },
  boneRisk: { label: "NASA HRP: Spaceflight-Induced Bone Changes", url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/" },
  sansRisk: { label: "NASA HRP: SANS", url: "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/" },
  fitnessRisk: { label: "NASA HRP: Reduced Fitness", url: "https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/" },
  hypoxiaRisk: { label: "NASA HRP: Risk of Hypoxia", url: "https://www.nasa.gov/reference/risk-of-hypoxia/" },
  exercise: { label: "NASA: Astronaut Exercise", url: "https://www.nasa.gov/general/astronaut-exercise/" },
  bioMonitor: { label: "CSA Bio-Monitor", url: "https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp" },
  csaRad: { label: "CSA: Monitoring radiation for astronaut health", url: "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp" },
  udmi: { label: "Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF 2018)", url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617" },
  aha: { label: "AHA blood pressure categories", url: "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings" },
  ahaHr: { label: "AHA heart rate", url: "https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse" },
  ada: { label: "ADA diagnosis & hypoglycemia levels", url: "https://diabetes.org/about-diabetes/diagnosis" },
  spo2: { label: "MedlinePlus pulse oximetry", url: "https://medlineplus.gov/lab-tests/pulse-oximetry/" },
  wbc: { label: "MedlinePlus WBC count", url: "https://medlineplus.gov/lab-tests/white-blood-count-wbc/" },
  news2: { label: "RCP NEWS2", url: "https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/" },
} satisfies Record<string, SourceRef>;

export const INDICATORS: Record<IndicatorId, IndicatorDef> = {
  heartRate: {
    id: "heartRate",
    label: "Resting heart rate",
    short: "Heart rate",
    unit: "bpm",
    decimals: 0,
    inputRange: [25, 220],
    steps: [[40, "critical"], [50, "caution"], [101, "nominal"], [131, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: { nominal: "50–100 bpm (fit crews often rest in the 50s)", caution: "40–49 or 101–130 bpm", critical: "< 40 or > 130 bpm, or with symptoms" },
    escalateAbove: 130,
    escalateBelow: 40,
    continuous: true,
    regions: ["heart"],
    hazards: ["gravity", "radiation", "isolation"],
    spaceflightEffect:
      "Microgravity shifts fluid headward and the heart becomes more spherical; arrhythmia risk rises and orthostatic tachycardia or fainting is common after landing.",
    measurement: "CSA Bio-Monitor smart shirt (ECG), ECG kit, CEVIS cycle display.",
    actions: [
      "Rest seated for 5 minutes and measure again.",
      "Check caffeine, medication and recent exercise.",
      "Drink fluids; before landing follow the pre-landing fluid-loading procedure and wear compression garments.",
    ],
    escalation: "Below 40 or above 130 bpm at rest, or chest pain, fainting or palpitations.",
    sources: [S.ahaHr, S.cardioRisk, S.orthoTB, S.bioMonitor],
  },
  systolicBP: {
    id: "systolicBP",
    label: "Blood pressure, systolic",
    short: "Systolic BP",
    unit: "mmHg",
    decimals: 0,
    inputRange: [50, 260],
    // 181: up to 180 is caution; the AHA hypertensive crisis is "> 180".
    steps: [[80, "critical"], [90, "caution"], [130, "nominal"], [181, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: {
      nominal: "90–129 mmHg",
      caution: "80–89 (low), 130–139 (AHA stage 1) or 140–180 (AHA stage 2): re-check in 15 minutes",
      critical: "< 80 or > 180 mmHg (AHA hypertensive crisis)",
    },
    escalateAbove: 180,
    escalateBelow: 80,
    cautionAdvice: "re-check in 15 minutes",
    continuous: true,
    regions: ["heart"],
    hazards: ["gravity"],
    spaceflightEffect:
      "24-hour blood pressure drops about 8–10 mmHg in flight as fluid redistributes. Low pressure and fainting are typical right after landing.",
    measurement: "Automated BP cuff, CSA Bio-Monitor.",
    actions: [
      "Sit quietly for 5 minutes, arm at heart level, and repeat the measurement.",
      "Review salt, fluid and caffeine intake.",
      "If low: hydrate and avoid fast posture changes; if high: rest and re-check in 15 minutes.",
    ],
    escalation: "Systolic above 180 or below 80 mmHg, or any reading with headache, chest pain, vision change or dizziness.",
    sources: [S.aha, S.cardioRisk, S.orthoTB],
  },
  diastolicBP: {
    id: "diastolicBP",
    label: "Blood pressure, diastolic",
    short: "Diastolic BP",
    unit: "mmHg",
    decimals: 0,
    inputRange: [30, 160],
    // 121: up to 120 is caution; the AHA hypertensive crisis is "> 120".
    steps: [[40, "critical"], [60, "caution"], [80, "nominal"], [121, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: {
      nominal: "60–79 mmHg",
      caution: "40–59 (low), 80–89 (AHA stage 1) or 90–120 mmHg (AHA stage 2): re-check in 15 minutes",
      critical: "< 40 or > 120 mmHg (AHA hypertensive crisis)",
    },
    escalateAbove: 120,
    escalateBelow: 40,
    cautionAdvice: "re-check in 15 minutes",
    continuous: true,
    regions: ["heart"],
    hazards: ["gravity"],
    spaceflightEffect: "Fluid shifts and reduced plasma volume change vascular tone; diastolic values usually move with systolic.",
    measurement: "Automated BP cuff, CSA Bio-Monitor.",
    actions: ["Repeat the measurement after 5 minutes of rest.", "Track together with systolic pressure and heart rate."],
    escalation: "Diastolic above 120 or below 40 mmHg, or any reading with symptoms.",
    sources: [S.aha, S.cardioRisk],
  },
  spo2: {
    id: "spo2",
    label: "Blood oxygen saturation",
    short: "SpO₂",
    unit: "%",
    decimals: 0,
    inputRange: [50, 100],
    steps: [[91, "critical"], [95, "caution"]],
    top: "nominal",
    basis: "CLIN",
    ranges: { nominal: "95–100 %", caution: "91–94 %", critical: "≤ 90 %" },
    // Symptom-type: any critical value (<= 90 %) escalates.
    escalateFromBand: "critical",
    continuous: true,
    regions: ["lungs", "blood"],
    hazards: ["environment"],
    spaceflightEffect:
      "ISS air is at sea-level pressure, but exploration vehicles plan reduced cabin pressure, so mild hypoxia (confusion, headache, poor sleep) becomes possible.",
    measurement: "Fingertip pulse oximeter, CSA Bio-Monitor.",
    actions: ["Warm the finger and measure again.", "Check cabin O₂ and CO₂ readings.", "Rest and breathe slowly."],
    escalation: "SpO₂ ≤ 90 % (check the probe first), or shortness of breath.",
    sources: [S.spo2, S.hypoxiaRisk, S.bioMonitor],
  },
  bodyTemp: {
    id: "bodyTemp",
    label: "Body temperature",
    short: "Temperature",
    unit: "°C",
    decimals: 1,
    inputRange: [32, 43],
    // NEWS2 temperature bands. Uppers sit half-way between one-decimal
    // values (value < upper), so 35.0 is critical, 36.0 caution, 38.0 nominal,
    // 39.0 caution and 39.1 critical.
    steps: [[35.05, "critical"], [36.05, "caution"], [38.05, "nominal"], [39.05, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: {
      nominal: "36.1–38.0 °C (NEWS2 0 points)",
      caution: "35.1–36.0 or 38.1–39.0 °C (NEWS2 1 point)",
      critical: "≤ 35.0 °C (NEWS2 3 points) or ≥ 39.1 °C (NEWS2 2 points; rating it critical is our project rule)",
    },
    // Any critical value (<= 35.0 or >= 39.1 °C) escalates; a fever of
    // 38.1 °C or more escalates once it persists 24 h (project rule).
    escalateFromBand: "critical",
    persistence: { op: ">=", value: 38.1, hours: 24 },
    continuous: true,
    regions: ["blood", "skin"],
    hazards: ["environment"],
    spaceflightEffect:
      "Core temperature rises up to ~1 °C over long missions (impaired heat loss without convection), so compare against your own in-flight baseline.",
    measurement: "Thermometer; CSA Bio-Monitor skin temperature.",
    actions: ["Drink fluids and rest.", "Check for signs of infection (sore throat, rash, cough).", "Reduce exercise intensity while elevated."],
    escalation:
      "35.0 °C or below, 39.1 °C or above, 38.1 °C or more persisting 24 h (project rule), or fever with rash, stiff neck or low WBC.",
    sources: [S.news2, S.immuneRisk, S.bioMonitor],
  },
  respRate: {
    id: "respRate",
    label: "Respiratory rate",
    short: "Resp. rate",
    unit: "/min",
    decimals: 0,
    inputRange: [4, 60],
    steps: [[9, "critical"], [12, "caution"], [21, "nominal"], [25, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: { nominal: "12–20 /min", caution: "9–11 or 21–24 /min", critical: "≤ 8 or ≥ 25 /min" },
    // Whole breaths per minute: > 24 is >= 25 and < 9 is <= 8 (the critical band).
    escalateAbove: 24,
    escalateBelow: 9,
    continuous: true,
    regions: ["lungs"],
    hazards: ["environment"],
    spaceflightEffect: "Breathing rate rises with cabin CO₂; elevated rate at rest can be an early CO₂ or infection signal.",
    measurement: "CSA Bio-Monitor (breathing rate and volume), manual count over 60 s.",
    actions: ["Count again over a full minute at rest.", "Check cabin CO₂."],
    escalation: "Above 24 or below 9 /min at rest, or any breathing difficulty.",
    sources: [S.news2, S.co2TB, S.bioMonitor],
  },
  glucose: {
    id: "glucose",
    label: "Blood glucose (fasting)",
    short: "Glucose",
    unit: "mg/dL",
    decimals: 0,
    inputRange: [20, 600],
    steps: [[54, "critical"], [70, "caution"], [100, "nominal"], [251, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: { nominal: "70–99 mg/dL", caution: "54–69 (level 1 low) or 100–250 mg/dL", critical: "< 54 (level 2 low) or > 250 mg/dL" },
    escalateBelow: 54,
    // Project rule: a single value above 400 mg/dL escalates at once (safety
    // ceiling). Below it a high value is re-tested first (meter error, sugar
    // on the finger) and escalates only on two days in a row (project rule).
    escalateAbove: 400,
    persistence: { op: ">", value: 250, days: 2 },
    regions: ["gut", "blood"],
    hazards: ["gravity", "distance"],
    spaceflightEffect:
      "ISS crews typically eat only ~80 % of their energy needs, so lows are possible when meals are skipped; insulin resistance has also been reported in flight.",
    measurement: "Point-of-care glucose meter (finger stick).",
    actions: [
      "If low: follow the onboard low-blood-sugar procedure.",
      "If high: drink water and review recent food intake; re-test fasting next morning.",
    ],
    escalation: "Below 54 mg/dL, above 400 mg/dL (project rule), or above 250 mg/dL on two days in a row (project rule).",
    sources: [S.ada, S.nutritionTB],
  },
  sleepHours: {
    id: "sleepHours",
    label: "Sleep last night",
    short: "Sleep",
    unit: "h",
    decimals: 1,
    inputRange: [0, 16],
    steps: [[5, "critical"], [7, "caution"], [10.01, "nominal"]],
    top: "caution",
    basis: "NASA",
    ranges: { nominal: "7–10 h (NASA schedules an 8.5 h sleep period)", caution: "5–6.9 h or > 10 h", critical: "< 5 h, or < 6 h for 7+ days" },
    persistence: { op: "<", value: 6, days: 7, name: "sleep debt", status: "critical" },
    regions: ["brain"],
    hazards: ["isolation", "environment"],
    spaceflightEffect:
      "Crews average only ~6–6.5 h. 16 sunrises a day, noise, CO₂ and workload disrupt circadian rhythm; a week under 6 h equals 24–36 h without sleep.",
    measurement: "Wrist actigraphy and sleep log.",
    actions: [
      "Protect the full 8.5 h sleep period.",
      "Bright/blue-enriched light 1–2 h after waking; avoid it 1–2 h before bed.",
      "No caffeine 6–12 h before sleep.",
    ],
    escalation: "Under 6 h on 7 days in a row (sleep debt), or poor sleep before critical tasks (docking, EVA, landing).",
    sources: [S.sleepTB, S.circTB, S.sleepRisk],
  },
  mood: {
    id: "mood",
    label: "Mood (1 = very low, 10 = great)",
    short: "Mood",
    unit: "/10",
    decimals: 0,
    inputRange: [1, 10],
    steps: [[3, "critical"], [5, "caution"]],
    top: "nominal",
    basis: "APP",
    ranges: { nominal: "5–10", caution: "3–4, or a drop of ≥ 2 over 3 days", critical: "1–2, or any hopelessness" },
    persistence: { op: "<=", value: 2, days: 2 },
    regions: ["brain"],
    hazards: ["isolation", "distance"],
    spaceflightEffect:
      "Isolation, confinement and distance from Earth raise the risk of anxiety and depression; 2 of 7 Shuttle-Mir astronauts reported depressive symptoms.",
    measurement: "Daily self-report; journaling; monthly WinSCAT cognitive test.",
    actions: [
      "Schedule personal time and a call with family.",
      "Journal, tend the plant experiment, talk with a crewmate.",
      "Discuss workload adjustments with the commander.",
    ],
    escalation: "Score ≤ 2 on two days in a row, or any thought of self-harm: request a private psychological conference now.",
    sources: [S.behaviorTB, S.bhRisk],
  },
  stress: {
    id: "stress",
    label: "Stress (1 = calm, 10 = overwhelmed)",
    short: "Stress",
    unit: "/10",
    decimals: 0,
    inputRange: [1, 10],
    steps: [[5, "nominal"], [8, "caution"]],
    top: "critical",
    basis: "APP",
    ranges: { nominal: "1–4", caution: "5–7, or a rise of ≥ 2 over 3 days", critical: "8–10" },
    persistence: { op: ">=", value: 8, days: 2 },
    regions: ["brain"],
    hazards: ["isolation", "distance", "environment"],
    spaceflightEffect: "Work overload, team conflict and the closed environment raise stress hormones, which also suppress immune function.",
    measurement: "Daily self-report.",
    actions: ["Take a structured break; breathing exercise (4-7-8).", "Raise workload concerns at the daily planning conference."],
    escalation: "8 or more on two days in a row.",
    sources: [S.behaviorTB, S.bhRisk],
  },
  radiationDoseRate: {
    id: "radiationDoseRate",
    label: "Radiation dose rate",
    short: "Dose rate",
    unit: "mSv/day",
    decimals: 2,
    inputRange: [0, 1000],
    // 10.01: exactly 10.00 is still caution ("2–10"); critical is "> 10".
    steps: [[2, "nominal"], [10.01, "caution"]],
    top: "critical",
    basis: "APP",
    ranges: {
      nominal: "Mission GCR background (ISS ≈ 0.3–0.8, lunar ≈ 1.4, Mars transit ≈ 1.8 mSv/day)",
      caution: "2–10 mSv/day, or an S1–S2 solar radiation storm: prepare shelter, defer EVAs",
      critical: "> 10 mSv/day or an S3+ solar radiation storm: go to storm shelter",
    },
    escalateAbove: 10,
    stormAlert: true,
    regions: ["blood", "eyes", "skin", "brain"],
    hazards: ["radiation"],
    spaceflightEffect:
      "Galactic cosmic rays are a constant background; solar particle events can raise dose rates by orders of magnitude within hours. Neutrons make up ~30 % of ISS dose.",
    measurement: "Personal and area dosimeters, CSA CANS neutron spectrometer, NOAA GOES proton flux.",
    actions: ["Follow the radiation alert: shelter behind ~10 cm water-equivalent (water bags, stowage).", "Defer EVAs.", "Log dosimeter readings."],
    escalation: "Above 10 mSv/day, or any current solar particle event alert (NOAA S1 or higher).",
    sources: [S.radTB, S.std3001, S.csaRad],
  },
  radiationCumulative: {
    id: "radiationCumulative",
    label: "Cumulative effective dose",
    short: "Total dose",
    unit: "mSv",
    decimals: 0,
    inputRange: [0, 2000],
    // 480.01: exactly 480 (80 %) is still caution; critical is "> 80 %".
    steps: [[300, "nominal"], [480.01, "caution"]],
    top: "critical",
    basis: "NASA",
    ranges: { nominal: "< 50 % of the 600 mSv career limit", caution: "50–80 % of the limit", critical: "> 80 % of the limit or projected breach" },
    escalateAbove: 480,
    regions: ["blood", "eyes", "skin", "brain"],
    hazards: ["radiation"],
    spaceflightEffect: "NASA's career limit of 600 mSv effective dose keeps the added risk of cancer death below 3 %. ALARA applies at all times.",
    measurement: "Dosimetry log.",
    actions: ["Keep EVA and shelter discipline to stay ALARA.", "Review planned high-exposure activities with ground."],
    escalation: "Above 480 mSv (80 % of the career limit; the 80 % mark is a project rule), or projected to exceed 80 % of any limit.",
    sources: [S.std3001, S.radTB],
  },
  bodyMassChange: {
    id: "bodyMassChange",
    label: "Body mass change vs pre-flight",
    short: "Body mass",
    unit: "%",
    decimals: 1,
    inputRange: [-30, 30],
    steps: [[-5, "critical"], [-2, "caution"], [2.01, "nominal"]],
    top: "caution",
    basis: "APP",
    ranges: { nominal: "within ± 2 %", caution: "2–5 % loss or > 2 % gain", critical: "> 5 % loss" },
    escalateBelow: -5,
    regions: ["gut", "muscles"],
    hazards: ["distance", "gravity"],
    spaceflightEffect: "Under-eating, menu fatigue and muscle loss reduce body mass; ISS crews typically lose 2–5 %.",
    measurement: "SLAMMD (Space Linear Acceleration Mass Measurement Device).",
    actions: ["Meet daily energy targets; add snacks you like.", "Keep resistance exercise to protect muscle mass."],
    escalation: "Loss above 5 %.",
    sources: [S.nutritionTB],
  },
  boneLoss: {
    id: "boneLoss",
    label: "Estimated bone loss rate",
    short: "Bone loss",
    unit: "%/month",
    decimals: 1,
    inputRange: [0, 5],
    steps: [[0.81, "nominal"], [1.51, "caution"]],
    top: "critical",
    basis: "APP",
    ranges: { nominal: "≤ 0.8 %/month", caution: "0.8–1.5 %/month", critical: "> 1.5 %/month, or hip/spine > 5 % total" },
    escalateAbove: 1.5,
    regions: ["skeleton"],
    hazards: ["gravity"],
    spaceflightEffect:
      "Without countermeasures weight-bearing bones lose 1–1.5 % per month; released calcium raises kidney-stone risk. NASA requires hip/spine BMD ≥ 95 % of pre-flight.",
    measurement: "DXA only before/after flight; in flight estimated from exercise adherence and urine calcium.",
    actions: ["Complete daily ARED resistance sessions.", "Bone-protection measures per the medical plan."],
    escalation: "Estimated loss above 1.5 %/month, low exercise adherence for 3+ days, bone or back pain, or kidney-stone symptoms (flank pain, blood in urine).",
    sources: [S.boneTB, S.boneRisk, S.std3001],
  },
  exerciseMinutes: {
    id: "exerciseMinutes",
    label: "Exercise today",
    short: "Exercise",
    unit: "min",
    decimals: 0,
    inputRange: [0, 400],
    steps: [[30, "critical"], [90, "caution"]],
    top: "nominal",
    basis: "NASA",
    ranges: { nominal: "≥ 90 min (NASA: 1.5–2 h/day, 6–7 days/week)", caution: "30–89 min", critical: "< 30 min" },
    persistence: { op: "<", value: 60, days: 3 },
    regions: ["muscles", "skeleton", "heart"],
    hazards: ["gravity"],
    spaceflightEffect:
      "Without exercise crews lose 10–12 % of strength and aerobic fitness on average. NASA requires VO₂max and strength ≥ 80 % of pre-flight.",
    measurement: "ARED, T2 treadmill and CEVIS cycle logs.",
    actions: ["Complete the prescribed ARED + treadmill/cycle session.", "Make up missed sessions within the week."],
    escalation: "Under 60 min/day on 3 days in a row (project rule).",
    sources: [S.exercise, S.fitnessRisk, S.std3001],
  },
  hydration: {
    id: "hydration",
    label: "Water intake today",
    short: "Hydration",
    unit: "L",
    decimals: 1,
    inputRange: [0, 8],
    steps: [[1.5, "critical"], [2.5, "caution"]],
    top: "nominal",
    basis: "NASA",
    ranges: { nominal: "≥ 2.5 L/day (+0.24 L per EVA hour)", caution: "1.5–2.4 L", critical: "< 1.5 L or acute mass loss ≥ 2.5 %" },
    regions: ["gut", "skeleton"],
    hazards: ["gravity"],
    spaceflightEffect: "Thirst is blunted in microgravity; crews average only 2.0–2.3 L. Dehydration raises kidney-stone and fainting risk.",
    measurement: "Drink log, urine colour, body mass.",
    actions: ["Drink a glass of water now and every hour until you reach the daily target.", "Check urine colour."],
    escalation: "Signs of dehydration (dizziness, dark urine) despite drinking.",
    sources: [S.waterTB],
  },
  wbc: {
    id: "wbc",
    label: "White blood cell count",
    short: "WBC",
    unit: "×10⁹/L",
    decimals: 1,
    inputRange: [0, 60],
    steps: [[2, "critical"], [4.5, "caution"], [11.01, "nominal"], [30.01, "caution"]],
    top: "critical",
    basis: "CLIN",
    ranges: { nominal: "4.5–11.0", caution: "2.0–4.4 or 11.1–30", critical: "< 2.0 or > 30" },
    escalateBelow: 2,
    escalateAbove: 30,
    regions: ["blood"],
    hazards: ["environment", "radiation", "isolation"],
    spaceflightEffect:
      "Spaceflight dysregulates the immune system: latent viruses reactivate (shingles, cold sores), rashes and allergies become more common.",
    measurement: "Blood sample (usually returned to Earth); saliva samples in flight.",
    actions: ["Strict hand hygiene; limit shared items.", "Report rashes, cold sores or fever."],
    escalation: "Below 2.0 ×10⁹/L, above 30 ×10⁹/L (project rule), fever together with low WBC, or a shingles-type rash.",
    sources: [S.wbc, S.immuneRisk, S.std3001],
  },
  cabinCO2: {
    id: "cabinCO2",
    label: "Cabin CO₂ partial pressure",
    short: "Cabin CO₂",
    unit: "mmHg",
    decimals: 1,
    inputRange: [0, 15],
    steps: [[2.5, "nominal"], [3.01, "caution"]],
    top: "critical",
    basis: "NASA",
    ranges: {
      nominal: "< 2.5 mmHg (< 3,300 ppm; 7-day average target, OCHMO-TB-004)",
      caution: "2.5–3.0 mmHg",
      critical: "> 3.0 mmHg as a 1-hour average (NASA-STD-3001 V2 6004 limit)",
    },
    // The NASA limit is a 1-hour average. Demify does not average: one
    // reading above 3 mmHg is treated as a breach (prototype simplification).
    escalateAbove: 3,
    regions: ["lungs", "brain", "eyes"],
    hazards: ["environment"],
    spaceflightEffect:
      "Without convection CO₂ pools around the face. Headache odds roughly double per +1 mmHg (Law 2014, cited in OCHMO-TB-004); CO₂ may contribute to SANS.",
    measurement:
      "ECLSS cabin monitors, personal CO₂ monitors. The NASA limit is defined as a 1-hour average; this prototype treats a single high reading as a breach.",
    actions: ["Move to a well-ventilated module; position a fan.", "Check CO₂ scrubbers (CDRA).", "Reduce exercise while CO₂ is high."],
    escalation: "Above 3 mmHg (NASA 1-hour average limit; here a single reading counts), or headache or vision change with high CO₂.",
    sources: [S.std3001co2, S.co2TB],
  },
  visionChange: {
    id: "visionChange",
    label: "Vision symptoms (0 none – 3 severe)",
    short: "Vision",
    unit: "/3",
    decimals: 0,
    inputRange: [0, 3],
    steps: [[1, "nominal"], [3, "caution"]],
    top: "critical",
    basis: "APP",
    ranges: { nominal: "0 – no change", caution: "1–2 – new near-vision blur, needing stronger glasses, headache", critical: "3 – vision not correctable with glasses" },
    // Symptom-type: any score >= 1 ("any new visual change") escalates.
    escalateFromBand: "caution",
    regions: ["eyes"],
    hazards: ["gravity", "environment"],
    spaceflightEffect:
      "~70 % of long-duration crews show signs of Spaceflight Associated Neuro-ocular Syndrome (optic disc swelling, choroidal folds); 18 % clinically significant.",
    measurement: "Eye charts, OCT, fundoscope, ocular ultrasound in 'eye weeks' (flight day 30, 90, return-30).",
    actions: ["Switch to the next pair of backup glasses (crews fly 3+ strengths).", "Keep cabin CO₂ low."],
    escalation: "Any new visual change: OCT and fundoscope exam with ground support.",
    sources: [S.sansTB, S.sansRisk],
  },
  stDeviation: {
    id: "stDeviation",
    label: "ST segment deviation (ECG)",
    short: "ST segment",
    unit: "mm",
    decimals: 1,
    inputRange: [-10, 10],
    // New ST elevation >= 1 mm is the STEMI criterion; marked depression
    // suggests ischaemia.
    steps: [[-2, "critical"], [-0.5, "caution"], [1, "nominal"]],
    top: "critical",
    basis: "CLIN",
    ranges: {
      nominal: "−0.5 to +0.9 mm",
      caution: "−0.6 to −2.0 mm depression (possible ischaemia)",
      critical: "≥ 1 mm elevation (STEMI criterion) or > 2 mm depression",
    },
    // Symptom-type: any critical value escalates.
    escalateFromBand: "critical",
    continuous: true,
    regions: ["heart"],
    hazards: ["gravity", "radiation", "distance"],
    spaceflightEffect:
      "Spaceflight remodels the heart and radiation adds long-term cardiovascular risk. A heart attack far from Earth must be recognised and treated by the crew itself: there is no emergency room and evacuation takes days. Reference: new ST elevation ≥ 1 mm in two contiguous leads is the STEMI criterion, a medical emergency; crewed vehicles carry a defibrillator (AED) and an advanced cardiac life support kit for the onboard procedures.",
    measurement: "Continuous ECG (CSA Bio-Monitor shirt, ISS ECG kit); 12-lead ECG transmitted to the flight surgeon.",
    actions: [
      "Stop all activity; the crew member rests, monitored, with the Crew Medical Officer.",
      "Record and transmit a 12-lead ECG to the flight surgeon immediately.",
      "Follow the onboard medical checklist for chest pain; contact the flight surgeon.",
    ],
    escalation: "Any ST elevation ≥ 1 mm, ST depression > 2 mm, or chest pain: medical emergency, contact the flight surgeon now.",
    sources: [S.udmi, S.cardioRisk, S.bioMonitor],
  },
};

export function classify(id: IndicatorId, value: number): Status {
  const def = INDICATORS[id];
  if (!Number.isFinite(value)) return "unknown";
  for (const [upper, status] of def.steps) {
    if (value < upper) return status;
  }
  return def.top;
}

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

/**
 * Escalation on ONE value: an explicit limit (strict > / <) or, for
 * symptom-type indicators, a value in the escalating band. A critical band on
 * its own never escalates; repeated values are judged in assess.ts.
 */
export function needsEscalation(id: IndicatorId, value: number): boolean {
  const def = INDICATORS[id];
  if (!Number.isFinite(value)) return false;
  if (def.escalateAbove != null && value > def.escalateAbove) return true;
  if (def.escalateBelow != null && value < def.escalateBelow) return true;
  if (def.escalateFromBand && RANK[classify(id, value)] >= RANK[def.escalateFromBand]) return true;
  return false;
}

function compare(op: Comparison, a: number, b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}

/** True when one value counts toward the indicator's persistence rule. */
export function meetsPersistence(id: IndicatorId, value: number): boolean {
  const rule = INDICATORS[id].persistence;
  return !!rule && Number.isFinite(value) && compare(rule.op, roundToIndicator(id, value), rule.value);
}

const OP_SYMBOL: Record<Comparison, string> = { ">": ">", ">=": "≥", "<": "<", "<=": "≤" };

function formatLimit(def: IndicatorDef, v: number): string {
  return `${String(v).replace("-", "−")} ${def.unit}`;
}

/** e.g. "≥ 8 /10 on 2 days in a row" or "≥ 38.1 °C persisting 24 h". */
export function persistenceLabel(def: IndicatorDef): string | null {
  const r = def.persistence;
  if (!r) return null;
  const cond = `${OP_SYMBOL[r.op]} ${formatLimit(def, r.value)}`;
  if (r.days) return `${cond} on ${r.days} days in a row`;
  if (r.hours) return `${cond} persisting ${r.hours} h`;
  return cond;
}

/**
 * The values an escalateFromBand rule covers, in words: the critical range
 * text without its notes ("≤ 35.0 °C or ≥ 39.1 °C"), or for a caution band
 * that starts above a single nominal step, "≥ 1 /3".
 */
export function bandEscalationLabel(def: IndicatorDef): string | null {
  if (def.escalateFromBand === "critical") return def.ranges.critical.replace(/\s*\([^)]*\)/g, "").trim();
  if (def.escalateFromBand === "caution") {
    const [first, ...rest] = def.steps;
    const allAbove = rest.every(([, s]) => RANK[s] >= RANK.caution) && RANK[def.top] >= RANK.caution;
    if (first && first[1] === "nominal" && allAbove) return `≥ ${formatLimit(def, first[0])}`;
    return "any caution or critical value";
  }
  return null;
}

/**
 * Every automatic escalation rule of an indicator in words, generated from
 * the same fields the code evaluates (Guidance "Automatic flag" column).
 */
export function escalationFlags(def: IndicatorDef): string[] {
  const out: string[] = [];
  if (def.escalateBelow != null) out.push(`< ${formatLimit(def, def.escalateBelow)}`);
  if (def.escalateAbove != null) out.push(`> ${formatLimit(def, def.escalateAbove)}`);
  const band = bandEscalationLabel(def);
  if (band) out.push(band.startsWith("any ") ? `A${band.slice(1)}` : `Any value ${band}`);
  const p = persistenceLabel(def);
  if (p) out.push(p);
  if (def.stormAlert) out.push("Any current S1+ solar radiation storm");
  return out;
}

/** Rounds a value to the precision the indicator is stored and displayed with. */
export function roundToIndicator(id: IndicatorId, value: number): number {
  return Number(value.toFixed(INDICATORS[id].decimals));
}

/** A large shift from the personal pre-flight value (continuous signals only). */
export const BASELINE_SHIFT_RATIO = 0.25;

export interface ValueEvaluation {
  /** The value rounded to `decimals`: what is stored and what was classified. */
  value: number;
  status: Status;
  /** This value alone meets an escalation rule (explicit limit or symptom band). */
  escalate: boolean;
  /** True when the status was raised to caution only by the personal-baseline rule. */
  baselineShift: boolean;
  /**
   * Label of the persistence rule this value counts toward when it does not
   * escalate on its own: repeated values escalate, a single one does not.
   */
  repeatRule: string | null;
}

/**
 * Single source of truth for judging one value. Used by the check-in live
 * preview, the check-in server action and the assessment engine so that the
 * preview and the saved result can never disagree:
 *  1. round to the indicator's precision (the stored value),
 *  2. classify against the population bands,
 *  3. personal-baseline rule: for continuous signals, a shift of >= 25 % from
 *     the pre-flight baseline raises nominal to caution,
 *  4. escalate only on a single-value rule (needsEscalation), never on the
 *     critical band alone; note a persistence rule the value counts toward.
 */
export function evaluateValue(id: IndicatorId, raw: number, baseline?: number | null): ValueEvaluation {
  const def = INDICATORS[id];
  const value = roundToIndicator(id, raw);
  let status = classify(id, value);
  let baselineShift = false;
  if (
    status === "nominal" &&
    def.continuous &&
    baseline != null &&
    baseline !== 0 &&
    Math.abs((value - baseline) / baseline) >= BASELINE_SHIFT_RATIO
  ) {
    status = "caution";
    baselineShift = true;
  }
  const escalate = needsEscalation(id, value);
  const repeatRule = !escalate && meetsPersistence(id, value) ? persistenceLabel(def) : null;
  return { value, status, escalate, baselineShift, repeatRule };
}

/**
 * The judgement part of a finding. It follows `escalate`, not the band: only
 * an escalation says to contact the flight surgeon. `progress` describes the
 * history counted so far toward a persistence rule ("3 days in a row so far").
 */
export function judgement(
  def: IndicatorDef,
  ev: Pick<ValueEvaluation, "status" | "escalate" | "baselineShift" | "repeatRule">,
  progress?: string | null,
): string {
  if (ev.escalate) return ev.status === "critical" ? "critical: contact the flight surgeon" : "contact the flight surgeon";
  const band =
    ev.status === "critical"
      ? "in the critical band"
      : ev.status === "caution"
        ? ev.baselineShift
          ? "large change from your baseline"
          : "outside normal range"
        : "within normal range";
  if (ev.repeatRule) return `${band}, ${progress ?? "single value"}; repeated values escalate (${ev.repeatRule})`;
  if (ev.status === "critical") return `${band}: re-check and log`;
  if (ev.status === "caution") return `${band}, ${ev.baselineShift ? "monitor closely" : (def.cautionAdvice ?? "monitor closely")}`;
  return ev.status === "nominal" ? band : "no data";
}

/* ------------------------------------------------------------------------- */

export interface HazardDef {
  id: HazardId;
  name: string;
  summary: string;
  effects: string[];
  url: string;
}

export const HAZARDS: Record<HazardId, HazardDef> = {
  radiation: {
    id: "radiation",
    name: "Space radiation",
    summary: "Galactic cosmic rays and solar particle events outside Earth's protective atmosphere and magnetic field.",
    effects: ["Higher lifetime cancer risk", "Central nervous system and cognitive effects", "Degenerative heart, vessel and eye disease", "Acute sickness and blood-forming organ damage in large solar events"],
    url: "https://www.nasa.gov/hrp/hazard-space-radiation/",
  },
  isolation: {
    id: "isolation",
    name: "Isolation & confinement",
    summary: "Small crews living and working in a confined space for months, far from family.",
    effects: ["Sleep loss and circadian desynchronisation", "Anxiety and depression", "Team conflict and work overload"],
    url: "https://www.nasa.gov/hrp/hazard-isolation-and-confinement/",
  },
  distance: {
    id: "distance",
    name: "Distance from Earth",
    summary: "Mars is ~140 million miles away; one-way communication delays reach 20 minutes and evacuation is impossible.",
    effects: ["Crew must diagnose and treat themselves", "Limited medical supplies", "Food must last the mission (nutrition)"],
    url: "https://www.nasa.gov/hrp/hazard-distance-from-earth/",
  },
  gravity: {
    id: "gravity",
    name: "Gravity fields",
    summary: "Weightlessness in transit and partial gravity on the Moon (1/6 g) and Mars (3/8 g), plus transitions between them.",
    effects: ["Bone loss 1–1.5 % per month", "Muscle and fitness loss", "Headward fluid shift and SANS", "Orthostatic intolerance after landing", "Kidney stones, motion sickness"],
    url: "https://www.nasa.gov/hrp/hazard-gravity-fields/",
  },
  environment: {
    id: "environment",
    name: "Hostile, closed environment",
    summary: "The spacecraft's air, water, temperature, noise, lighting and microbes are all engineered and shared.",
    effects: ["CO₂ headaches", "Immune changes and microbial risk", "Stress hormone elevation", "Noise and light disturb sleep"],
    url: "https://www.nasa.gov/hrp/hazard-hostile-closed-environments/",
  },
};

/* ------------------------------------------------------------------------- */

export interface BodyRegionDef {
  id: BodyRegionId;
  name: string;
  function: string;
  spaceEffects: string;
  hazards: HazardId[];
  indicators: IndicatorId[];
}

export const BODY_REGIONS: Record<BodyRegionId, BodyRegionDef> = {
  brain: {
    id: "brain",
    name: "Brain & mind",
    function: "Thinking, decision making, mood, balance and sleep regulation.",
    spaceEffects:
      "Radiation can affect the central nervous system and cognition; isolation drives stress and depression; fluid shifts and vestibular changes cause motion sickness; CO₂ causes headaches.",
    hazards: ["radiation", "isolation", "gravity", "environment"],
    indicators: ["mood", "stress", "sleepHours", "cabinCO2"],
  },
  eyes: {
    id: "eyes",
    name: "Eyes",
    function: "Vision for flying, robotics and every experiment.",
    spaceEffects:
      "The headward fluid shift causes SANS: optic disc swelling, retinal folds and a flattened eyeball. Radiation raises cataract risk (lens dose limits).",
    hazards: ["gravity", "radiation", "environment"],
    indicators: ["visionChange", "cabinCO2", "radiationCumulative"],
  },
  heart: {
    id: "heart",
    name: "Heart & vessels",
    function: "Pumps blood and oxygen to every organ.",
    spaceEffects:
      "The heart becomes rounder and does less work; blood volume drops, causing low blood pressure and fainting at landing. Radiation adds long-term degenerative risk.",
    hazards: ["gravity", "radiation"],
    indicators: ["heartRate", "stDeviation", "systolicBP", "diastolicBP", "exerciseMinutes"],
  },
  lungs: {
    id: "lungs",
    name: "Lungs",
    function: "Gas exchange: oxygen in, carbon dioxide out.",
    spaceEffects: "Cabin CO₂ build-up and reduced-pressure exploration cabins (hypoxia risk) stress breathing.",
    hazards: ["environment"],
    indicators: ["spo2", "respRate", "cabinCO2"],
  },
  skeleton: {
    id: "skeleton",
    name: "Bones & skeleton",
    function: "Support, protection of organs and the body's calcium store.",
    spaceEffects:
      "Weight-bearing bones lose 1–1.5 % per month; the spine lengthens up to 3 %; released calcium raises kidney-stone risk.",
    hazards: ["gravity"],
    indicators: ["boneLoss", "exerciseMinutes", "hydration"],
  },
  muscles: {
    id: "muscles",
    name: "Muscles",
    function: "Movement, posture and the strength needed for EVAs and landing.",
    spaceEffects: "Strength and aerobic fitness drop 10–12 % on average; some crew lose more than 20 % without countermeasures.",
    hazards: ["gravity"],
    indicators: ["exerciseMinutes", "bodyMassChange"],
  },
  blood: {
    id: "blood",
    name: "Blood & immune system",
    function: "Carries oxygen, fights infection and heals injuries.",
    spaceEffects:
      "Immune dysregulation reactivates dormant viruses; red cell mass falls ('space anemia'); blood-forming organs have strict radiation limits.",
    hazards: ["environment", "isolation", "radiation"],
    indicators: ["wbc", "bodyTemp", "spo2", "radiationDoseRate"],
  },
  gut: {
    id: "gut",
    name: "Gut & nutrition",
    function: "Digestion, energy supply and the microbiome.",
    spaceEffects: "The microbiome shifts in a closed environment; long-shelf-life food loses nutrients and causes menu fatigue, so crews under-eat.",
    hazards: ["environment", "distance"],
    indicators: ["bodyMassChange", "glucose", "hydration"],
  },
  skin: {
    id: "skin",
    name: "Skin",
    function: "Barrier against microbes and regulation of body temperature.",
    spaceEffects: "Rashes, slow healing and infections are more common; skin has its own radiation dose limits.",
    hazards: ["radiation", "environment"],
    indicators: ["bodyTemp", "radiationDoseRate", "wbc"],
  },
};

/** Indicators an astronaut can enter in the daily check-in form, in order. */
export const CHECK_IN_INDICATORS: IndicatorId[] = [
  "heartRate",
  "systolicBP",
  "diastolicBP",
  "spo2",
  "bodyTemp",
  "glucose",
  "sleepHours",
  "mood",
  "stress",
  "hydration",
  "exerciseMinutes",
  "bodyMassChange",
  "visionChange",
  "radiationCumulative",
];
