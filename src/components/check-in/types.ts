import type { IndicatorId, Status } from "@/lib/types";

/** Plain-data contract between the check-in Server Action and the client form. */

export interface CheckInInput {
  crewId: string;
  values: Partial<Record<IndicatorId, number>>;
  note?: string;
}

export interface CheckInItem {
  indicator: IndicatorId;
  value: number;
  unit: string;
  status: Status;
  finding: string;
  actions: string[];
  escalate: boolean;
}

export type CheckInResult =
  | {
      ok: true;
      crewName: string;
      takenAt: string;
      items: CheckInItem[];
      /** Overall crew-member status after this check-in (all indicators). */
      overall: Status;
      /** Escalations from other indicators that were not part of this check-in. */
      otherEscalations: { indicator: IndicatorId; finding: string }[];
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<IndicatorId, string>>;
    };

/** Form groups, in display order. Indicators not listed here fall into "Other". */
export const CHECK_IN_GROUPS: { id: string; title: string; description: string; indicators: IndicatorId[] }[] = [
  {
    id: "vitals",
    title: "Vitals",
    description: "Measure at rest, seated, before exercise. Glucose fasting, before breakfast.",
    indicators: ["heartRate", "systolicBP", "diastolicBP", "spo2", "bodyTemp", "glucose"],
  },
  {
    id: "mind",
    title: "Sleep & mind",
    description: "How you slept last night and how you feel right now. Answer honestly: this is for you.",
    indicators: ["sleepHours", "mood", "stress"],
  },
  {
    id: "activity",
    title: "Nutrition & activity",
    description: "Totals for the previous day; body mass from the last SLAMMD measurement.",
    indicators: ["hydration", "exerciseMinutes", "bodyMassChange"],
  },
  {
    id: "environment",
    title: "Environment & radiation",
    description: "New vision symptoms and your personal dosimeter total.",
    indicators: ["visionChange", "radiationCumulative"],
  },
];

/** Indicators entered with segmented buttons instead of a number field. */
export const SCALE_LABELS: Partial<Record<IndicatorId, Record<number, string>>> = {
  mood: { 1: "very low", 10: "great" },
  stress: { 1: "calm", 10: "overwhelmed" },
  visionChange: { 0: "none", 1: "mild", 2: "moderate", 3: "severe" },
};
