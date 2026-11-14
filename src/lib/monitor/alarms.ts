import type { IndicatorId, LiveVitals, MonitorAlarm } from "../types";

/**
 * Patient-monitor alarm limits. Modelled on common bedside-monitor defaults
 * (adult): "high" = red, life-threatening (IEC 60601-1-8 high priority),
 * "medium" = yellow. These are deliberately acute, beat-to-beat alarms; the
 * slower health assessment (thresholds, trends, escalations) lives in
 * src/lib/health.
 */
export const ALARM_LIMITS = {
  hr: { highHigh: 150, high: 120, low: 45, lowLow: 40 },
  sys: { highHigh: 180, high: 160, low: 90, lowLow: 80 },
  spo2: { low: 92, lowLow: 88 },
  resp: { high: 28, low: 8, apnea: 4 },
  stMm: { high: 1 },
} as const;

type Draft = Omit<MonitorAlarm, "id" | "crewId" | "crewName" | "drill"> & { key: string };

export function computeAlarms(v: Omit<LiveVitals, "alarms">): MonitorAlarm[] {
  const out: Draft[] = [];
  const add = (key: string, priority: MonitorAlarm["priority"], text: string, indicator?: IndicatorId) =>
    out.push({ key, priority, text, indicator });
  const L = ALARM_LIMITS;

  if (v.rhythm === "vf") add("vfib", "high", "VFIB / NO PULSE", "heartRate");
  else if (v.rhythm === "vt") add("vtach", "high", "VTACH", "heartRate");

  if (v.hr != null && v.rhythm !== "vf" && v.rhythm !== "vt") {
    const hr = Math.round(v.hr);
    if (hr > L.hr.highHigh) add("hr", "high", `HR ${hr} > ${L.hr.highHigh}`, "heartRate");
    else if (hr > L.hr.high) add("hr", "medium", `HR HIGH ${hr} > ${L.hr.high}`, "heartRate");
    else if (hr < L.hr.lowLow) add("hr", "high", `HR ${hr} < ${L.hr.lowLow}`, "heartRate");
    else if (hr < L.hr.low) add("hr", "medium", `HR LOW ${hr} < ${L.hr.low}`, "heartRate");
  }
  if (v.stMm >= L.stMm.high) add("st", "high", `ST ELEVATION ${v.stMm.toFixed(1)} mm`, "stDeviation");
  if (v.pvcPerMin >= 6) add("pvc", "medium", `PVCs ${v.pvcPerMin}/min`, "heartRate");

  if (v.sys != null) {
    const sys = Math.round(v.sys);
    if (sys > L.sys.highHigh) add("abp", "high", `ABP SYS ${sys} > ${L.sys.highHigh}`, "systolicBP");
    else if (sys > L.sys.high) add("abp", "medium", `ABP SYS HIGH ${sys} > ${L.sys.high}`, "systolicBP");
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
    else if (r > L.resp.high) add("resp", "medium", `RESP HIGH ${r} > ${L.resp.high}`, "respRate");
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
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
}
