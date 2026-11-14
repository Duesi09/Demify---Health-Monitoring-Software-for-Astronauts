import { INDICATORS } from "@/lib/health/knowledge";
import { linkPolicy } from "@/lib/link";
import type { LiveVitals, MonitorAlarm, ScenarioType } from "@/lib/types";

/**
 * Emergency-response checklists for the crew page (client-safe data): a
 * training simulation of how pre-approved procedures are timed under signal
 * delay.
 *
 * Wording is deliberately procedural, not prescriptive: every clinical step
 * defers to the onboard medical checklist and the flight surgeon. No drug
 * names, doses or amounts (guarded by tests/clinical-safety.test.ts).
 */

export type ProtocolId = ScenarioType | "general";

/** Client-side copy of SCENARIO_LABEL (src/lib/sources/simulator.ts is server-only). */
export const SCENARIO_NAME: Record<ScenarioType, string> = {
  stemi: "Acute myocardial infarction (STEMI)",
  vf: "Cardiac arrest (ventricular fibrillation)",
  "hypertensive-crisis": "Hypertensive crisis",
};

export const DRILL_BUTTONS: Array<{ type: ScenarioType; label: string; effect: string }> = [
  {
    type: "stemi",
    label: "Simulate heart attack (STEMI)",
    effect: "ST elevation on the ECG, rising heart rate, PVCs and falling SpO₂ over the next minutes.",
  },
  {
    type: "vf",
    label: "Simulate cardiac arrest (VF)",
    effect: "Ventricular fibrillation: chaotic ECG, no pulse, no blood pressure or pleth.",
  },
  {
    type: "hypertensive-crisis",
    label: "Simulate hypertensive crisis",
    effect: "Blood pressure climbing above 180/120 mmHg with a rising heart rate.",
  },
];

export interface ProtocolStep {
  id: string;
  text: string;
  /** Optional second line (why / how). */
  detail?: string;
}

export interface Protocol {
  id: ProtocolId;
  title: string;
  steps: ProtocolStep[];
}

/**
 * The flight-surgeon step, timed by the signal-delay policy (linkPolicy in
 * src/lib/link.ts): call while acting on a near real-time link, act first and
 * send updates on a delayed one, prepare the report during a blackout.
 */
function surgeonStep(commDelaySeconds: number | null, missionName: string): ProtocolStep {
  const policy = linkPolicy(commDelaySeconds);
  if (policy.mode === "blackout") {
    return {
      id: "surgeon",
      text: "Prepare the report for the flight surgeon: time of onset, rhythm, vital signs, actions taken.",
      detail: `${missionName}: ${policy.label}. Act on the onboard procedures; transmit when contact returns.`,
    };
  }
  return {
    id: "surgeon",
    text: "Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.",
    detail:
      policy.mode === "delayed"
        ? `${missionName}: signal delay ${policy.summary}. Do not wait for an answer before acting; follow the onboard checklist and send updates.`
        : `${missionName}: signal delay ${policy.summary}, near real-time consultation is possible.`,
  };
}

export function buildProtocol(
  id: ProtocolId,
  /** commDelaySeconds: one-way delay in seconds, null for no contact (blackout); missionName names the link in the step text. */
  opts: { commDelaySeconds: number | null; missionName: string; alarm?: MonitorAlarm | null },
): Protocol {
  const surgeon = surgeonStep(opts.commDelaySeconds, opts.missionName);
  const st = INDICATORS.stDeviation.actions;
  switch (id) {
    case "stemi":
      return {
        id,
        title: "Suspected heart attack (STEMI)",
        steps: [
          { id: "rest", text: st[0], detail: "Note the time symptoms began (chest pain, breathlessness, sweating, nausea)." },
          { id: "ecg", text: st[1] },
          { id: "checklist", text: st[2], detail: "Any medication only as the onboard medical checklist or the flight surgeon directs." },
          {
            id: "aed",
            text: "Have the defibrillator (AED) ready per the onboard procedure.",
            detail: "Keep the pads within reach: STEMI can deteriorate into ventricular fibrillation.",
          },
          surgeon,
          { id: "monitor", text: "Keep continuous ECG, blood pressure and SpO₂ monitoring; record vitals every 5 minutes." },
        ],
      };
    case "vf":
      return {
        id,
        title: "Cardiac arrest (VF / pulseless VT)",
        steps: [
          {
            id: "confirm",
            text: "Confirm: unresponsive, not breathing normally, no pulse. Call out “cardiac arrest” to the crew.",
            detail: "If a pulse is present, follow the onboard arrhythmia checklist instead and contact the flight surgeon.",
          },
          {
            id: "cpr",
            text: "Start chest compressions now in the microgravity CPR position per onboard procedure.",
            detail: "Restrain the patient or brace the rescuer (e.g. handstand or reverse bear-hug position) so compressions are effective.",
          },
          { id: "aed", text: "Bring the AED, attach the pads and follow its voice prompts; shock only when the device advises." },
          { id: "resume", text: "Resume CPR immediately after each shock; switch compressors about every 2 minutes." },
          { id: "acls", text: "Follow the onboard advanced cardiac life support (ACLS) checklist under flight surgeon direction." },
          surgeon,
          { id: "log", text: "Keep this sheet: record every shock, rhythm check and medication time." },
        ],
      };
    case "hypertensive-crisis":
      return {
        id,
        title: "Hypertensive crisis (BP > 180/120 mmHg)",
        steps: [
          { id: "rest", text: "Stop activity; rest quietly, restrained, with continuous monitoring." },
          { id: "repeat", text: INDICATORS.systolicBP.actions[0] },
          {
            id: "symptoms",
            text: "Check for warning symptoms: severe headache, chest pain, vision change, confusion, breathlessness.",
            detail: "Any of these with BP > 180/120 is a medical emergency.",
          },
          { id: "checklist", text: "Follow the onboard medical checklist for high blood pressure; medication only per flight surgeon direction." },
          surgeon,
          { id: "trend", text: "Re-measure every 5–15 minutes and log each value with its time." },
        ],
      };
    default: {
      const ind = opts.alarm?.indicator ? INDICATORS[opts.alarm.indicator] : null;
      return {
        id: "general",
        title: opts.alarm ? `High-priority alarm: ${opts.alarm.text}` : "High-priority alarm",
        steps: [
          {
            id: "check",
            text: "Check the crew member first, then the sensor: responsive? breathing? electrodes, cuff and probe in place?",
          },
          ...(ind?.actions ?? []).map((text, i) => ({ id: `act-${i}`, text })),
          surgeon,
        ],
      };
    }
  }
}

/**
 * Which checklist applies right now: the drill's protocol while a training
 * scenario runs, otherwise the protocol matching the most serious
 * high-priority alarm. Null when nothing high-priority is active.
 */
export function activeProtocol(v: LiveVitals): { id: ProtocolId; alarm: MonitorAlarm | null } | null {
  if (v.scenario) return { id: v.scenario.type, alarm: null };
  const high = v.alarms.filter((a) => a.priority === "high");
  if (!high.length) return null;
  const arrest = high.find((a) => /VFIB|VTACH/.test(a.text));
  if (arrest) return { id: "vf", alarm: arrest };
  const st = high.find((a) => a.indicator === "stDeviation");
  if (st) return { id: "stemi", alarm: st };
  const bp = high.find((a) => a.indicator === "systolicBP" && v.sys != null && v.sys > 180);
  if (bp) return { id: "hypertensive-crisis", alarm: bp };
  return { id: "general", alarm: high[0] };
}
