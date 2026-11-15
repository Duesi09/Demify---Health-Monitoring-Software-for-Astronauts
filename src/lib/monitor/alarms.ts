import type { IndicatorId, LiveVitals, MonitorAlarm } from "../types";
import { SEIZURE_ALARM_TEXT, SEIZURE_ENDED_ALARM_TEXT, STROKE_ALARM_TEXT, seizureActive } from "./drills";

/**
 * Patient-monitor alarm limits. Modelled on common bedside-monitor defaults
 * (adult): "high" = red, life-threatening (IEC 60601-1-8 high priority),
 * "medium" = yellow. These are deliberately acute, beat-to-beat alarms; the
 * slower health assessment (thresholds, trends, escalations) lives in
 * src/lib/health.
 */
export const ALARM_LIMITS = {
  hr: { highHigh: 150, high: 120, low: 45, lowLow: 40 },
  /** During scheduled exercise (ARED / treadmill / cycle) higher rates are expected. */
  hrExercise: { highHigh: 185, high: 170 },
  /** During sleep lower rates are expected. */
  hrSleep: { low: 40, lowLow: 35 },
  sys: { highHigh: 180, high: 160, low: 90, lowLow: 80 },
  /**
   * During scheduled exercise systolic pressure rises normally. Exercise-testing
   * practice (ACC/AHA, Fletcher et al., Circulation 2013) treats a systolic
   * pressure above 250 mmHg as a reason to stop exercise; about 210 mmHg and
   * more is commonly called an exaggerated blood-pressure response. Drills always
   * use the resting limits (a scenario sets activity "rest").
   */
  sysExercise: { highHigh: 250, high: 210 },
  spo2: { low: 92, lowLow: 88 },
  resp: { high: 28, low: 8, apnea: 4 },
  respExercise: { high: 45 },
  stMm: { high: 1 },
} as const;

type Draft = Omit<MonitorAlarm, "id" | "crewId" | "crewName" | "drill"> & { key: string };

/**
 * Training alarms that come from the drill itself, not from a measured value:
 * the stroke drill is a crew report of F.A.S.T. signs (vital signs cannot show
 * a stroke), the seizure drill raises its alarm while the convulsions last and
 * a medium recovery alarm after. See src/lib/monitor/drills.ts for sources.
 */
function scenarioAlarms(v: Omit<LiveVitals, "alarms">): Draft[] {
  switch (v.scenario?.type) {
    case "stroke":
      return [{ key: "stroke", priority: "high", text: STROKE_ALARM_TEXT, reported: true }];
    case "seizure":
      return seizureActive(v.scenario.elapsedS)
        ? [{ key: "seizure", priority: "high", text: SEIZURE_ALARM_TEXT }]
        : [{ key: "seizure", priority: "medium", text: SEIZURE_ENDED_ALARM_TEXT }];
    default:
      return [];
  }
}

export function computeAlarms(v: Omit<LiveVitals, "alarms">): MonitorAlarm[] {
  const out: Draft[] = [];
  const add = (key: string, priority: MonitorAlarm["priority"], text: string, indicator?: IndicatorId) =>
    out.push({ key, priority, text, indicator });
  const L = ALARM_LIMITS;

  out.push(...scenarioAlarms(v));
  if (v.rhythm === "vf") add("vfib", "high", "VFIB / NO PULSE", "heartRate");
  else if (v.rhythm === "vt") add("vtach", "high", "VTACH", "heartRate");

  if (v.hr != null && v.rhythm !== "vf" && v.rhythm !== "vt") {
    const hr = Math.round(v.hr);
    const hi = v.activity === "exercise" ? L.hrExercise : L.hr;
    const lo = v.activity === "sleep" ? L.hrSleep : L.hr;
    if (hr > hi.highHigh) add("hr", "high", `HR ${hr} > ${hi.highHigh}`, "heartRate");
    else if (hr > hi.high) add("hr", "medium", `HR HIGH ${hr} > ${hi.high}`, "heartRate");
    else if (hr < lo.lowLow) add("hr", "high", `HR ${hr} < ${lo.lowLow}`, "heartRate");
    else if (hr < lo.low) add("hr", "medium", `HR LOW ${hr} < ${lo.low}`, "heartRate");
  }
  if (v.stMm >= L.stMm.high) add("st", "high", `ST ELEVATION ${v.stMm.toFixed(1)} mm`, "stDeviation");
  if (v.pvcPerMin >= 6) add("pvc", "medium", `PVCs ${v.pvcPerMin}/min`, "heartRate");

  if (v.sys != null) {
    const sys = Math.round(v.sys);
    const hiSys = v.activity === "exercise" ? L.sysExercise : L.sys;
    if (sys > hiSys.highHigh) add("abp", "high", `ABP SYS ${sys} > ${hiSys.highHigh}`, "systolicBP");
    else if (sys > hiSys.high) add("abp", "medium", `ABP SYS HIGH ${sys} > ${hiSys.high}`, "systolicBP");
    else if (sys < L.sys.lowLow) add("abp", "high", `ABP SYS ${sys} < ${L.sys.lowLow}`, "systolicBP");
    else if (sys < L.sys.low) add("abp", "medium", `ABP SYS LOW ${sys} < ${L.sys.low}`, "systolicBP");
  }
  if (v.spo2 != null) {
    const s = Math.round(v.spo2);
    if (s < L.spo2.lowLow) add("spo2", "high", `SpO2 ${s} < ${L.spo2.lowLow}`, "spo2");
    else if (s < L.spo2.low) add("spo2", "medium", `SpO2 LOW ${s} < ${L.spo2.low}`, "spo2");
  }
  if (v.resp != null) {
    const r = Math.round(v.resp);
    if (r <= L.resp.apnea) add("resp", "high", r === 0 ? "APNEA" : `RESP ${r} ≤ ${L.resp.apnea}`, "respRate");
    else if (r > (v.activity === "exercise" ? L.respExercise.high : L.resp.high))
      add("resp", "medium", `RESP HIGH ${r} > ${v.activity === "exercise" ? L.respExercise.high : L.resp.high}`, "respRate");
    else if (r < L.resp.low) add("resp", "medium", `RESP LOW ${r} < ${L.resp.low}`, "respRate");
  }

  const drill = v.scenario != null;
  return out
    .map((d) => ({
      id: `${v.crewId}:${d.key}`,
      crewId: v.crewId,
      crewName: v.crewName,
      priority: d.priority,
      text: d.text,
      indicator: d.indicator,
      drill,
      ...(d.reported ? { reported: true } : {}),
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
}
