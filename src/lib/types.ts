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
  | "visionChange";

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
}

export type MissionProfileId = "iss" | "artemis-lunar" | "mars-transit";

export interface MissionProfile {
  id: MissionProfileId;
  name: string;
  /** Typical GCR background dose rate in mSv/day (quiet sun). */
  baselineDoseRate: number;
  /** One-way light time to Earth in seconds (comms delay hazard). */
  commDelaySeconds: number;
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
