/**
 * Core domain model for Demify. Every module (data sources, assessment engine,
 * UI) speaks these types, so keep them stable and serializable (plain JSON).
 */

/** Traffic-light status used everywhere in the UI. */
export type Status = "nominal" | "caution" | "critical" | "unknown";

/** Health indicators the system knows about. */
export type IndicatorId =
  | "heartRate"
  | "systolicBP"
  | "diastolicBP"
  | "spo2"
  | "bodyTemp"
  | "respRate"
  | "glucose"
  | "sleepHours"
  | "mood"
  | "stress"
  | "radiationDoseRate"
  | "radiationCumulative"
  | "bodyMassChange"
  | "boneLoss"
  | "exerciseMinutes"
  | "hydration"
  | "wbc"
  | "cabinCO2"
  | "visionChange"
  | "stDeviation";

/** Five NASA HRP hazards of human spaceflight. */
export type HazardId =
  | "radiation"
  | "isolation"
  | "distance"
  | "gravity"
  | "environment";

/** Clickable regions of the human figure. */
export type BodyRegionId =
  | "brain"
  | "eyes"
  | "heart"
  | "lungs"
  | "skeleton"
  | "muscles"
  | "blood"
  | "gut"
  | "skin";

/** Where a reading came from. Shown in the UI so crews know what to trust. */
export type ReadingSource =
  | "manual" // typed in by the astronaut
  | "sensor" // pushed by a device via POST /api/readings
  | "simulated" // demo telemetry generator, clearly labelled in the UI
  | "osdr" // NASA Open Science Data Repository (real crew/study data)
  | "noaa-swpc"; // NOAA Space Weather Prediction Center (live)

export interface Reading {
  id: string;
  crewId: string;
  indicator: IndicatorId;
  value: number;
  unit: string;
  /** ISO 8601 timestamp */
  takenAt: string;
  source: ReadingSource;
  note?: string;
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  /** Baseline values recorded pre-flight, used for relative-change checks. */
  baseline: Partial<Record<IndicatorId, number>>;
}

export interface Threshold {
  /** Inclusive nominal band. */
  nominal: [number, number];
  /** Inclusive caution band(s); anything outside nominal+caution is critical. */
  caution: [number, number];
}

export interface Assessment {
  indicator: IndicatorId;
  status: Status;
  value: number | null;
  unit: string;
  takenAt: string | null;
  /** Short human readable finding, e.g. "Resting HR elevated (+18% vs baseline)". */
  finding: string;
  /** Concrete actions the crew can take now. */
  actions: string[];
  /** True if the result warrants contacting flight surgeons on the ground. */
  escalate: boolean;
  /** True when the value comes from an active training scenario (drill). */
  drill?: boolean;
}

export type MissionProfileId = "iss" | "artemis-lunar" | "mars-transit";

export interface MissionProfile {
  id: MissionProfileId;
  name: string;
  /** Typical GCR background dose rate in mSv/day (quiet sun). */
  baselineDoseRate: number;
  /**
   * One-way signal delay to Earth in seconds (comms delay hazard). Not always
   * straight-line light time: see delayBasis for what the number stands for.
   */
  commDelaySeconds: number;
  /** Where commDelaySeconds comes from, e.g. "light time at about 384,400 km". */
  delayBasis: string;
  /** Gravity relative to Earth. */
  gravity: number;
  durationDays: number;
}

/** Envelope every external data source returns, so the UI can show provenance. */
export interface SourceResult<T> {
  data: T;
  source: string;
  /** "live" = fetched now, "cache" = fetched earlier, "snapshot" = bundled offline copy */
  freshness: "live" | "cache" | "snapshot";
  fetchedAt: string;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Live patient monitor + emergency training scenarios                        */
/* ------------------------------------------------------------------------- */

/**
 * Training scenarios a crew can trigger to rehearse a medical emergency.
 * They only change SIMULATED telemetry and are always labelled as drills.
 *  - stemi: acute ST-elevation myocardial infarction (heart attack)
 *  - vf: cardiac arrest with ventricular fibrillation
 *  - hypertensive-crisis: blood pressure > 180/120
 *  - stroke: stroke signs (F.A.S.T.) reported by the crew; vital signs cannot
 *    show a stroke, so the monitor stays near baseline (raised BP)
 *  - seizure: a seizure with convulsions for a bounded time (motion artefact,
 *    tachycardia, falling SpO2), then recovery values
 */
export type ScenarioType = "stemi" | "vf" | "hypertensive-crisis" | "stroke" | "seizure";

export interface Scenario {
  crewId: string;
  type: ScenarioType;
  /** ISO 8601 */
  startedAt: string;
}

/** Heart rhythm the ECG waveform renderer should draw. */
export type Rhythm = "sinus" | "sinus-tachycardia" | "sinus-bradycardia" | "vt" | "vf";

export type AlarmPriority = "high" | "medium";

/** One active patient-monitor alarm (IEC 60601-1-8 style priorities). */
export interface MonitorAlarm {
  /** Stable id, e.g. "plt:hr-high"; used to acknowledge/silence. */
  id: string;
  crewId: string;
  crewName: string;
  priority: AlarmPriority;
  /** Monitor-style message, e.g. "HR HIGH 132 > 120" or "VFIB". */
  text: string;
  /** Indicator that triggered it, if any. */
  indicator?: IndicatorId;
  /** True when produced by a training scenario. */
  drill: boolean;
  /**
   * True when the alarm comes from a crew report (e.g. F.A.S.T. stroke signs
   * in the stroke drill), not from a measured value.
   */
  reported?: boolean;
}

/**
 * Instantaneous vital signs for the live monitor. Numbers are null when the
 * parameter cannot be measured (e.g. no pulse in VF: no SpO2/pleth, HR "---").
 */
export interface LiveVitals {
  crewId: string;
  crewName: string;
  /** ISO 8601 time of this sample. */
  t: string;
  hr: number | null;
  rhythm: Rhythm;
  /** ST segment deviation in mm (0.1 mV) on lead II; positive = elevation. */
  stMm: number;
  /** Premature ventricular contractions per minute (0 = none). */
  pvcPerMin: number;
  /**
   * Motion artefact on the ECG, pleth and resp waveforms, 0 (none) to 1
   * (convulsions in the seizure drill). Absent means none.
   */
  motionArtifact?: number;
  sys: number | null;
  dia: number | null;
  /** Mean arterial pressure. */
  map: number | null;
  spo2: number | null;
  resp: number | null;
  temp: number | null;
  /**
   * Where the numbers come from. Waveforms are always synthesised from them.
   * "none": a sensor-only crew member (see lib/crew-mode.ts) with no recent
   * sensor data, so every numeric is null (no signal).
   */
  source: "simulated" | "sensor" | "mixed" | "none";
  /**
   * Current activity (from the schedule / accelerometer). Wearable alarms are
   * activity-aware: a heart rate of 140 is expected on the treadmill.
   */
  activity: "rest" | "exercise" | "sleep";
  scenario: (Scenario & { elapsedS: number; label: string }) | null;
  alarms: MonitorAlarm[];
}
