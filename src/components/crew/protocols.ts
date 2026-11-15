import { INDICATORS } from "@/lib/health/knowledge";
import { groundActionUnderLink, linkPolicy, type LinkMode } from "@/lib/link";
import { REPORTED_NOT_MEASURED, SEIZURE_ACTIVE_S } from "@/lib/monitor/drills";
import type { LiveVitals, MonitorAlarm, ScenarioType } from "@/lib/types";

/**
 * Emergency-response checklists for the crew page (client-safe data): a
 * training simulation of how pre-approved procedures are timed under signal
 * delay.
 *
 * Wording is deliberately procedural, not prescriptive: every clinical step
 * defers to the onboard medical checklist and the flight surgeon. No drug
 * names, doses or amounts (guarded by tests/clinical-safety.test.ts).
 *
 * In a blackout (linkPolicy mode "blackout", e.g. solar conjunction) there is
 * no one to contact: no step tells the crew to contact or transmit to the
 * flight surgeon "immediately" or to act "under flight surgeon direction".
 * Those steps follow the onboard procedures and transmit when contact returns
 * (guarded by tests/blackout-protocol.test.ts).
 *
 * Stroke and seizure checklists restate public first-aid guidance only:
 * American Stroke Association F.A.S.T. (Face drooping, Arm weakness, Speech
 * difficulty, Time to call; note when the symptoms started / last known
 * well), https://www.stroke.org/en/about-stroke/stroke-symptoms, and CDC
 * "First aid for seizures",
 * https://www.cdc.gov/epilepsy/first-aid-for-seizures/index.html.
 * Steps marked "Microgravity (project text)" are our own adaptation, not
 * from those sources and not clinically reviewed. No restraint during a
 * seizure (CDC: do not hold them down).
 */

export type ProtocolId = ScenarioType | "general";

/** Client-side copy of SCENARIO_LABEL (src/lib/sources/simulator.ts is server-only). */
export const SCENARIO_NAME: Record<ScenarioType, string> = {
  stemi: "Acute myocardial infarction (STEMI)",
  vf: "Cardiac arrest (ventricular fibrillation)",
  "hypertensive-crisis": "Hypertensive crisis",
  stroke: "Stroke signs reported (F.A.S.T.)",
  seizure: "Seizure with convulsions",
};

/** Convulsion time of the seizure drill, as the button and the docs say it. */
const SEIZURE_DURATION = `${SEIZURE_ACTIVE_S / 60} minutes`;

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
  {
    type: "stroke",
    label: "Simulate stroke signs (F.A.S.T.)",
    effect: `The crew reports F.A.S.T. signs: face drooping, arm weakness, speech difficulty. ${REPORTED_NOT_MEASURED}: vital signs cannot show a stroke; the monitor shows raised blood pressure, otherwise near baseline.`,
  },
  {
    type: "seizure",
    label: "Simulate seizure",
    effect: `Convulsions for about ${SEIZURE_DURATION}: motion artefact on ECG, pleth and resp, rising heart rate, falling SpO₂; then recovery values.`,
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
  /** Link mode the steps were written for (blackout: no contact with the ground). */
  mode: LinkMode;
}

/**
 * Blackout wording for indicator crew actions that assume a link to the
 * ground (knowledge.ts actions are written for a live or delayed link).
 */
const BLACKOUT_ACTION: Record<string, string> = {
  [INDICATORS.stDeviation.actions[1]]: "Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.",
  [INDICATORS.stDeviation.actions[2]]: "Follow the onboard medical checklist for chest pain.",
};

/**
 * A crew action as written for this link mode (unchanged unless in a
 * blackout): the ECG and chest-pain steps are rewritten in full, other
 * actions that need the ground wait for contact (groundActionUnderLink).
 */
export function actionUnderLink(text: string, mode: LinkMode): string {
  return mode === "blackout" ? (BLACKOUT_ACTION[text] ?? groundActionUnderLink(text, mode)) : text;
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
  const mode = linkPolicy(opts.commDelaySeconds).mode;
  const blackout = mode === "blackout";
  const surgeon = surgeonStep(opts.commDelaySeconds, opts.missionName);
  const st = INDICATORS.stDeviation.actions.map((a) => actionUnderLink(a, mode));
  switch (id) {
    case "stemi":
      return {
        id,
        mode,
        title: "Suspected heart attack (STEMI)",
        steps: [
          { id: "rest", text: st[0], detail: "Note the time symptoms began (chest pain, breathlessness, sweating, nausea)." },
          { id: "ecg", text: st[1] },
          {
            id: "checklist",
            text: st[2],
            detail: blackout
              ? "Any medication only per the onboard medical procedures."
              : "Any medication only as the onboard medical checklist or the flight surgeon directs.",
          },
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
        mode,
        title: "Cardiac arrest (VF / pulseless VT)",
        steps: [
          {
            id: "confirm",
            text: "Confirm: unresponsive, not breathing normally, no pulse. Call out “cardiac arrest” to the crew.",
            detail: blackout
              ? "If a pulse is present, follow the onboard arrhythmia checklist instead; transmit the log when contact returns."
              : "If a pulse is present, follow the onboard arrhythmia checklist instead and contact the flight surgeon.",
          },
          {
            id: "cpr",
            text: "Start chest compressions now in the microgravity CPR position per onboard procedure.",
            detail: "Restrain the patient or brace the rescuer (e.g. handstand or reverse bear-hug position) so compressions are effective.",
          },
          { id: "aed", text: "Bring the AED, attach the pads and follow its voice prompts; shock only when the device advises." },
          {
            id: "resume",
            text: blackout
              ? "Resume CPR straight after each shock; switch compressors about every 2 minutes."
              : "Resume CPR immediately after each shock; switch compressors about every 2 minutes.",
          },
          {
            id: "acls",
            text: blackout
              ? "Follow the onboard advanced cardiac life support (ACLS) checklist as it directs; no flight surgeon input until contact returns."
              : "Follow the onboard advanced cardiac life support (ACLS) checklist under flight surgeon direction.",
          },
          surgeon,
          { id: "log", text: "Keep this sheet: record every shock, rhythm check and medication time." },
        ],
      };
    case "hypertensive-crisis":
      return {
        id,
        mode,
        title: "Hypertensive crisis (BP > 180/120 mmHg)",
        steps: [
          { id: "rest", text: "Stop activity; rest quietly, restrained, with continuous monitoring." },
          { id: "repeat", text: INDICATORS.systolicBP.actions[0] },
          {
            id: "symptoms",
            text: "Check for warning symptoms: severe headache, chest pain, vision change, confusion, breathlessness.",
            detail: "Any of these with BP > 180/120 is a medical emergency.",
          },
          {
            id: "checklist",
            text: blackout
              ? "Follow the onboard medical checklist for high blood pressure; medication only per the onboard medical procedures."
              : "Follow the onboard medical checklist for high blood pressure; medication only per flight surgeon direction.",
          },
          surgeon,
          { id: "trend", text: "Re-measure every 5–15 minutes and log each value with its time." },
        ],
      };
    case "stroke":
      return {
        id,
        mode,
        title: "Suspected stroke (F.A.S.T.)",
        steps: [
          {
            id: "fast",
            text: "Check F.A.S.T.: Face drooping (ask them to smile), Arm weakness (ask them to raise both arms), Speech difficulty (ask them to repeat a simple sentence).",
            detail:
              "Microgravity (project text): an arm cannot drift downward without gravity; compare whether one arm is weaker or harder to hold in place than the other.",
          },
          {
            id: "time",
            text: "Note the time the symptoms started, or when the crew member was last known well.",
            detail: `${REPORTED_NOT_MEASURED}: vital signs cannot show a stroke.`,
          },
          {
            id: "rest",
            text: "Stop all activity; the crew member rests, restrained and monitored, with the Crew Medical Officer.",
            detail: "Microgravity (project text): keep them from drifting into hardware.",
          },
          {
            id: "checklist",
            text: blackout
              ? "Follow the onboard medical checklist for stroke signs."
              : "Follow the onboard medical checklist for stroke signs.",
            detail: blackout
              ? "F.A.S.T. “Time to call”: with no contact, act on the onboard procedures; transmit when contact returns."
              : "F.A.S.T. “Time to call”: on Earth the emergency number, onboard the flight surgeon.",
          },
          surgeon,
          {
            id: "recheck",
            text: "Repeat the F.A.S.T. check and log each result with its time; keep continuous blood pressure, ECG and SpO₂ monitoring.",
          },
        ],
      };
    case "seizure":
      return {
        id,
        mode,
        title: "Seizure (convulsions)",
        steps: [
          { id: "stay", text: "Stay with the crew member; call out “seizure” to the crew." },
          { id: "time", text: "Time the seizure: note when it started and when it ends." },
          {
            id: "safe",
            text: "Keep them safe from injury: move hardware and loose objects away.",
            detail:
              "Microgravity (project text): guide them away from hardware without holding them down; keep them from drifting into hardware.",
          },
          { id: "mouth", text: "Do not put anything in their mouth. Do not hold them down." },
          { id: "side", text: "When the seizure ends, turn them on their side." },
          {
            id: "emergency",
            text: blackout
              ? "A first seizure, a seizure longer than 5 minutes, a second seizure, trouble breathing or waking afterwards, or an injury is an emergency: follow the onboard medical checklist."
              : "A first seizure, a seizure longer than 5 minutes, a second seizure, trouble breathing or waking afterwards, or an injury is an emergency: follow the onboard medical checklist.",
            ...(blackout ? { detail: "No contact: act on the onboard procedures; transmit when contact returns." } : {}),
          },
          surgeon,
          { id: "log", text: "Keep this sheet: record start and end time, what was seen and the vital signs after the seizure." },
        ],
      };
    default: {
      const ind = opts.alarm?.indicator ? INDICATORS[opts.alarm.indicator] : null;
      return {
        id: "general",
        mode,
        title: opts.alarm ? `High-priority alarm: ${opts.alarm.text}` : "High-priority alarm",
        steps: [
          {
            id: "check",
            text: "Check the crew member first, then the sensor: responsive? breathing? electrodes, cuff and probe in place?",
          },
          ...(ind?.actions ?? []).map((text, i) => ({ id: `act-${i}`, text: actionUnderLink(text, mode) })),
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
  // NO PULSE: VF alarm text "VFIB / NO PULSE" and the phone pulse demo's "NO PULSE (phone signal lost)".
  const arrest = high.find((a) => /VFIB|VTACH|NO PULSE/.test(a.text));
  if (arrest) return { id: "vf", alarm: arrest };
  const st = high.find((a) => a.indicator === "stDeviation");
  if (st) return { id: "stemi", alarm: st };
  const bp = high.find((a) => a.indicator === "systolicBP" && v.sys != null && v.sys > 180);
  if (bp) return { id: "hypertensive-crisis", alarm: bp };
  return { id: "general", alarm: high[0] };
}
