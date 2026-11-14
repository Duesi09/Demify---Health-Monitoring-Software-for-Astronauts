import "server-only";
import { config } from "../config";
import { physioAt, SCENARIO_LABEL } from "../sources/simulator";
import { getCrew, listCrew, listReadings } from "../store/readings";
import { listScenarios } from "../store/scenarios";
import type { CrewMember, IndicatorId, LiveVitals, Scenario } from "../types";
import { computeAlarms } from "./alarms";

/** Sensor readings newer than this replace simulated numerics on the monitor. */
const SENSOR_FRESH_MS = 2 * 60_000;

const SENSOR_FIELDS: Array<[IndicatorId, "hr" | "sys" | "dia" | "spo2" | "resp" | "temp"]> = [
  ["heartRate", "hr"],
  ["systolicBP", "sys"],
  ["diastolicBP", "dia"],
  ["spo2", "spo2"],
  ["respRate", "resp"],
  ["bodyTemp", "temp"],
];

async function liveFor(crew: CrewMember, scenario: Scenario | null, now: number): Promise<LiveVitals> {
  // A drill always drives the monitor from the simulator, even when sensors exist.
  const sim = config.simulateTelemetry || scenario ? physioAt(crew, now, scenario) : null;
  const vals: Record<"hr" | "sys" | "dia" | "spo2" | "resp" | "temp", number | null> = {
    hr: sim?.hr ?? null,
    sys: sim?.sys ?? null,
    dia: sim?.dia ?? null,
    spo2: sim?.spo2 ?? null,
    resp: sim?.resp ?? null,
    temp: sim?.temp ?? null,
  };
  let sensorCount = 0;
  if (!scenario) {
    const since = new Date(now - SENSOR_FRESH_MS).toISOString();
    const recent = await listReadings({ crewId: crew.id, since });
    for (const [indicator, key] of SENSOR_FIELDS) {
      const r = recent.filter((x) => x.indicator === indicator && x.source === "sensor").at(-1);
      if (r) {
        vals[key] = r.value;
        sensorCount++;
      }
    }
  }
  const hr = vals.hr;
  const rhythm = sim?.rhythm ?? (hr == null ? "sinus" : hr > 100 ? "sinus-tachycardia" : hr < 50 ? "sinus-bradycardia" : "sinus");
  const map = vals.sys != null && vals.dia != null ? (vals.sys + 2 * vals.dia) / 3 : null;
  const round = (v: number | null, d = 0) => (v == null ? null : Number(v.toFixed(d)));
  const base: Omit<LiveVitals, "alarms"> = {
    crewId: crew.id,
    crewName: crew.name,
    t: new Date(now).toISOString(),
    hr: round(hr),
    rhythm,
    stMm: Number((sim?.stMm ?? 0).toFixed(1)),
    pvcPerMin: sim?.pvcPerMin ?? 0,
    ...(sim && sim.motion > 0 ? { motionArtifact: Number(sim.motion.toFixed(2)) } : {}),
    sys: round(vals.sys),
    dia: round(vals.dia),
    map: round(map),
    spo2: vals.spo2 == null ? null : Math.min(100, Math.round(vals.spo2)),
    resp: round(vals.resp),
    temp: round(vals.temp, 1),
    source: sensorCount === 0 ? "simulated" : sensorCount === SENSOR_FIELDS.length ? "sensor" : "mixed",
    activity: sim?.activity ?? "rest",
    scenario: scenario
      ? {
          ...scenario,
          elapsedS: Math.max(0, Math.round((now - Date.parse(scenario.startedAt)) / 1000)),
          label: SCENARIO_LABEL[scenario.type],
        }
      : null,
  };
  return { ...base, alarms: computeAlarms(base) };
}

export async function getLiveVitals(crewId: string, now = Date.now()): Promise<LiveVitals | null> {
  const crew = await getCrew(crewId);
  if (!crew) return null;
  const scenario = (await listScenarios(now)).find((s) => s.crewId === crewId) ?? null;
  return liveFor(crew, scenario, now);
}

export async function getAllLiveVitals(now = Date.now()): Promise<LiveVitals[]> {
  const [crew, scenarios] = await Promise.all([listCrew(), listScenarios(now)]);
  return Promise.all(crew.map((c) => liveFor(c, scenarios.find((s) => s.crewId === c.id) ?? null, now)));
}
