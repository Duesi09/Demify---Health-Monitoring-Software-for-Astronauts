import "server-only";
import { config, currentMission } from "../config";
import { SCENARIO_LABEL, simulateDaily, simulateLive, simulateSeries } from "../sources/simulator";
import { getScenario } from "../store/scenarios";
import { estimateDoseRate, getSpaceWeather } from "../sources/swpc";
import { getCrew, listCrew, listReadings } from "../store/readings";
import type {
  Assessment,
  BodyRegionId,
  CrewMember,
  IndicatorId,
  Reading,
  Scenario,
  Status,
} from "../types";
import {
  BODY_REGIONS,
  INDICATORS,
  evaluateValue,
  judgement,
  meetsPersistence,
  persistenceLabel,
  type ValueEvaluation,
} from "./knowledge";

/**
 * Assessment engine: turns raw readings into per-indicator status, findings,
 * actions and escalation flags, then rolls them up per body region and crew.
 * Escalation follows the explicit rules in knowledge.ts (single-value limits,
 * symptom bands) plus the persistence rules below; a critical band alone
 * never pages the flight surgeon.
 */

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce<Status>((w, s) => (RANK[s] > RANK[w] ? s : w), "unknown");
}

const REAL_CONTINUOUS_MAX_AGE_MS = 6 * 3_600_000;
/** Readings stamped further ahead than this (device clock skew) are ignored. */
export const FUTURE_SKEW_MS = 5 * 60_000;
/** Space-weather data older than this is labelled stale in the finding. */
const SPACE_WEATHER_STALE_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Daily check-ins are rarely exactly 24 h apart: allow this much slack on hour-based persistence rules. */
const PERSIST_GRACE_MS = HOUR_MS;
/**
 * Longest gap between two consecutive readings that still counts as
 * "persisting" for an hour-based rule (project rule). Daily check-ins drift
 * (08:00 one day, 19:00 the next), so up to 36 h between readings keeps the
 * run going; two fevers three days apart with nothing in between do not make
 * 72 h of fever.
 */
export const PERSIST_MAX_GAP_MS = 36 * HOUR_MS;

/** False for unparseable timestamps and for readings dated in the future. */
function notInFuture(r: Reading, now: number): boolean {
  const t = Date.parse(r.takenAt);
  return Number.isFinite(t) && t <= now + FUTURE_SKEW_MS;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** All readings for a crew member in the window: stored + simulated telemetry. */
export async function readingsFor(crew: CrewMember, hours = 24): Promise<Reading[]> {
  const since = Date.now() - hours * 3_600_000;
  const stored = await listReadings({ crewId: crew.id, since: new Date(since).toISOString() });
  // Continuous telemetry only needs the last day; daily check-ins cover the whole window.
  const now = Date.now();
  const scenario = await getScenario(crew.id, now);
  const sim = config.simulateTelemetry
    ? [...simulateSeries(crew, Math.max(since, now - 24 * 3_600_000)), ...simulateDaily(crew, since)]
    : [];
  // A live sample at "now" lets assessments react within seconds; during a
  // training scenario it is produced even when demo telemetry is off.
  if (config.simulateTelemetry || scenario) sim.push(...simulateLive(crew, now, scenario));
  return [...sim, ...stored].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/**
 * Representative current value for an indicator:
 *  - continuous wearable signals: median of the last 60 min at rest
 *    (readings tagged note="exercise" are skipped) -> robust to noise
 *  - manual / discrete indicators: latest reading
 * Real (manual/sensor) readings always win over simulated ones.
 */
export function currentValue(
  id: IndicatorId,
  rs: Reading[],
  now: number = Date.now(),
): { value: number; takenAt: string; source: Reading["source"]; note?: string } | null {
  // A future-dated reading (bad device clock, bad input) would otherwise sort
  // last and override every later real reading until that date.
  const all = rs.filter((r) => r.indicator === id && notInFuture(r, now));
  if (!all.length) return null;
  const def = INDICATORS[id];
  // A real (manual/sensor) reading wins over simulated telemetry, but for
  // continuous vitals only while it is recent: an old spot check must not
  // mask a week of newer telemetry.
  const realMaxAgeMs = def.continuous ? REAL_CONTINUOUS_MAX_AGE_MS : Infinity;
  const real = all.filter((r) => r.source !== "simulated" && now - Date.parse(r.takenAt) <= realMaxAgeMs);
  const pool = real.length ? real : all.filter((r) => r.source === "simulated");
  if (!pool.length) {
    const last = all[all.length - 1];
    return { value: last.value, takenAt: last.takenAt, source: last.source };
  }
  const last = pool[pool.length - 1];
  // Acute event (training scenario): judge the current sample, not the
  // 60-minute median, which would hide a heart attack for half an hour.
  if (last.note?.startsWith("scenario:")) {
    return { value: last.value, takenAt: last.takenAt, source: last.source, note: last.note };
  }
  if (!def.continuous || pool === real) {
    return { value: last.value, takenAt: last.takenAt, source: last.source };
  }
  const cutoff = Date.parse(last.takenAt) - 60 * 60_000;
  const window = pool.filter((r) => Date.parse(r.takenAt) >= cutoff && r.note !== "exercise");
  // During an exercise block the whole window may be exercise: fall back to
  // the latest resting readings rather than judging exercise values as rest.
  const resting = pool.filter((r) => r.note !== "exercise");
  const use = window.length ? window : resting.length ? resting.slice(-6) : pool.slice(-6);
  return {
    value: Number(median(use.map((r) => r.value)).toFixed(def.decimals)),
    takenAt: last.takenAt,
    source: last.source,
  };
}

/** One value per UTC day: the day's latest reading, real entries winning over simulated ones. */
function dailyValues(id: IndicatorId, rs: Reading[], now: number): Map<number, number> {
  const byDay = new Map<number, Reading>();
  for (const r of rs) {
    if (r.indicator !== id || !notInFuture(r, now)) continue;
    const day = Math.floor(Date.parse(r.takenAt) / DAY_MS);
    const prev = byDay.get(day);
    if (prev && prev.source !== "simulated" && r.source === "simulated") continue;
    if (!prev || r.takenAt >= prev.takenAt || prev.source === "simulated") byDay.set(day, r);
  }
  return new Map([...byDay].map(([d, r]) => [d, r.value]));
}

export interface TrendFlag {
  status: Status;
  detail: string;
}

/**
 * Multi-day trend rules stated in the indicator ranges (knowledge.ts),
 * evaluated on one value per day relative to the day of the current value.
 * They raise the status to caution and never escalate on their own:
 *  - mood:   a drop of >= 2 within the previous 3 days
 *  - stress: a rise of >= 2 within the previous 3 days
 */
export function trendFlag(
  id: IndicatorId,
  cur: { value: number; takenAt: string },
  rs: Reading[],
  now: number = Date.now(),
): TrendFlag | null {
  if (id !== "mood" && id !== "stress") return null;
  const days = dailyValues(id, rs, now);
  const today = Math.floor(Date.parse(cur.takenAt) / DAY_MS);
  if (!Number.isFinite(today)) return null;
  days.set(today, cur.value);
  const before = [1, 2, 3].map((k) => days.get(today - k)).filter((v): v is number => v != null);
  if (id === "mood" && before.length) {
    const drop = Math.max(...before) - cur.value;
    if (drop >= 2) return { status: "caution", detail: `mood down ${drop} points over 3 days` };
  }
  if (id === "stress" && before.length) {
    const rise = cur.value - Math.min(...before);
    if (rise >= 2) return { status: "caution", detail: `stress up ${rise} points over 3 days` };
  }
  return null;
}

export interface PersistenceFlag {
  /** The rule is met: escalate. */
  met: boolean;
  /** History counted so far, e.g. "3 days in a row so far"; null for a single value. */
  progress: string | null;
}

/**
 * Persistence rules from knowledge.ts (IndicatorDef.persistence), evaluated
 * only when the current value itself meets the rule's condition:
 *  - days:  one value per UTC day (real entries win), the condition holds on
 *           N consecutive days ending with the current value's day
 *           (stress >= 8 on 2 days, mood <= 2 on 2 days, sleep < 6 h on 7 days)
 *  - hours: the condition holds on every at-rest reading back to at least N h
 *           before the current value (temperature >= 38.1 °C for 24 h), with
 *           a 1 h slack for daily check-in timing and consecutive readings
 *           at most 36 h apart (PERSIST_MAX_GAP_MS; a longer gap ends the
 *           run). Crew/sensor values are judged on their own, simulated
 *           telemetry on its own.
 */
export function persistenceFlag(
  id: IndicatorId,
  cur: { value: number; takenAt: string; source: Reading["source"] },
  rs: Reading[],
  now: number = Date.now(),
): PersistenceFlag | null {
  const rule = INDICATORS[id].persistence;
  if (!rule || !meetsPersistence(id, cur.value)) return null;
  const curT = Date.parse(cur.takenAt);
  if (!Number.isFinite(curT)) return null;
  if (rule.days) {
    const days = dailyValues(id, rs, now);
    const today = Math.floor(curT / DAY_MS);
    days.set(today, cur.value);
    let run = 0;
    while (run < rule.days) {
      const v = days.get(today - run);
      if (v == null || !meetsPersistence(id, v)) break;
      run++;
    }
    return { met: run >= rule.days, progress: run > 1 ? `${run} days in a row so far` : null };
  }
  if (rule.hours) {
    const real = cur.source !== "simulated";
    const pool = rs
      .filter(
        (r) =>
          r.indicator === id &&
          notInFuture(r, now) &&
          r.note !== "exercise" &&
          (r.source !== "simulated") === real &&
          Date.parse(r.takenAt) <= curT,
      )
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    let start = curT;
    // Qualifying readings in the run taken before the current value.
    let earlier = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const t = Date.parse(pool[i].takenAt);
      if (!meetsPersistence(id, pool[i].value) || start - t > PERSIST_MAX_GAP_MS) break;
      if (t < curT) earlier++;
      start = Math.min(start, t);
    }
    const span = curT - start;
    return {
      met: span >= rule.hours * HOUR_MS - PERSIST_GRACE_MS,
      // Never "single value" while an earlier qualifying reading is in the run.
      progress: span >= HOUR_MS ? `${Math.floor(span / HOUR_MS)} h so far` : earlier > 0 ? "under 1 h so far" : null,
    };
  }
  return null;
}

function finding(
  id: IndicatorId,
  ev: ValueEvaluation,
  crew: CrewMember,
  detail?: string,
  progress?: string | null,
): string {
  const def = INDICATORS[id];
  const { value, status } = ev;
  const v = `${value.toFixed(def.decimals)} ${def.unit}`;
  const base = crew.baseline[id];
  let delta = "";
  if (base != null && base !== 0) {
    const pct = ((value - base) / base) * 100;
    if (Math.abs(pct) >= 5) delta = ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)} % vs pre-flight baseline)`;
  }
  // The wording follows `escalate`, not the band: "contact the flight
  // surgeon" only when an escalation rule is met.
  const urgency = ev.escalate
    ? status === "critical"
      ? "critical: contact the flight surgeon"
      : "contact the flight surgeon"
    : status === "critical"
      ? "re-check and log"
      : "monitor closely";
  const word = detail ? `${detail}, ${urgency}` : judgement(def, ev, progress);
  return `${def.short} ${v}${delta}: ${word}.`;
}

function formatAge(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

/** NOAA radiation environment as it applies to the dose-rate indicator. */
interface RadiationEnv {
  /** Estimated dose rate (mSv/day) from the >= 10 MeV proton flux. */
  rate: number;
  /** NOAA S-scale level (0..5) of the current flux. */
  sLevel: number;
  /** Status implied by the S-level alone (S1-S2 caution, S3+ critical). */
  sStatus: Status;
  /** Time of the proton measurement, not the time of this request. */
  takenAt: string;
  /** Set when the data is an offline snapshot or older than a few hours. */
  staleNote: string | null;
}

async function radiationEnvironment(now: number): Promise<RadiationEnv | null> {
  try {
    const sw = await getSpaceWeather();
    const est = estimateDoseRate(sw.data.current.p10, currentMission());
    const measured = Date.parse(sw.data.current.t ?? "");
    const fetched = Date.parse(sw.fetchedAt);
    const t = Number.isFinite(measured) ? measured : Number.isFinite(fetched) ? fetched : now;
    const age = Math.max(0, now - t);
    const staleNote =
      sw.freshness === "snapshot"
        ? `Based on an offline NOAA snapshot from ${formatAge(age)} ago; may not reflect current conditions.`
        : age > SPACE_WEATHER_STALE_MS
          ? `NOAA proton data is ${formatAge(age)} old.`
          : null;
    return { rate: est.rate, sLevel: sw.data.sLevel, sStatus: est.status, takenAt: new Date(t).toISOString(), staleNote };
  } catch {
    return null;
  }
}

export interface CrewAssessment {
  crew: CrewMember;
  overall: Status;
  assessments: Assessment[];
  regions: Record<BodyRegionId, Status>;
  escalations: Assessment[];
  /** Source of each assessed value, for UI provenance labels. */
  sources: Partial<Record<IndicatorId, Reading["source"]>>;
  /** Active training scenario for this crew member, if any (label it as a DRILL). */
  scenario: (Scenario & { label: string }) | null;
}

export async function assessCrewMember(crewId: string): Promise<CrewAssessment | null> {
  const crew = await getCrew(crewId);
  if (!crew) return null;
  const scenario = await getScenario(crew.id);
  // Readings for discrete check-ins can be older; look back 7 days.
  const rs = await readingsFor(crew, 24 * 7);

  const now = Date.now();
  // Live radiation environment feeds the dose-rate indicator when no dosimeter
  // value exists, and its solar particle event (SPE) alert level always applies.
  const rad = await radiationEnvironment(now);

  const assessments: Assessment[] = [];
  const sources: CrewAssessment["sources"] = {};
  for (const id of Object.keys(INDICATORS) as IndicatorId[]) {
    const def = INDICATORS[id];
    let cur = currentValue(id, rs, now);
    if (!cur && id === "radiationDoseRate" && rad) {
      cur = { value: rad.rate, takenAt: rad.takenAt, source: "noaa-swpc" };
    }
    if (!cur) {
      assessments.push({
        indicator: id,
        status: "unknown",
        value: null,
        unit: def.unit,
        takenAt: null,
        finding: `No ${def.short.toLowerCase()} recorded yet.`,
        actions: [],
        escalate: false,
      });
      continue;
    }
    // Bands, single-value escalation and personal-baseline rule, shared with
    // the check-in form and action.
    const ev = evaluateValue(id, cur.value, crew.baseline[id]);
    let detail: string | undefined;
    let progress: string | null = null;
    let note = "";

    const trend = trendFlag(id, cur, rs, now);
    if (trend && RANK[trend.status] > RANK[ev.status]) {
      ev.status = trend.status;
      detail = trend.detail;
    }

    // Repeated values: escalate once the rule is met, otherwise say how much
    // of it the history already shows.
    const persist = persistenceFlag(id, cur, rs, now);
    if (persist?.met) {
      const rule = def.persistence!;
      ev.escalate = true;
      ev.repeatRule = null;
      if (rule.status && RANK[rule.status] > RANK[ev.status]) ev.status = rule.status;
      detail = `${persistenceLabel(def)}${rule.name ? ` (${rule.name})` : ""}`;
    } else if (persist) {
      progress = persist.progress;
    }

    if (def.stormAlert && rad) {
      const fromNoaa = cur.source === "noaa-swpc";
      // "Any SPE alert" (knowledge.ts): S1-S2 at least caution, S3+ critical,
      // and every S >= 1 escalates. A stale snapshot does not override a dosimeter.
      if (rad.sLevel >= 1 && (fromNoaa || !rad.staleNote)) {
        if (RANK[rad.sStatus] > RANK[ev.status]) ev.status = rad.sStatus;
        // Escalate only on current data: an old offline snapshot captured
        // during a storm must not page the flight surgeon for weeks.
        if (!rad.staleNote) {
          ev.escalate = true;
          detail = `S${rad.sLevel} solar radiation storm in progress: follow the storm shelter protocol`;
        } else {
          detail = `last known NOAA data showed an S${rad.sLevel} solar radiation storm; verify with onboard dosimeters`;
        }
      }
      if (fromNoaa) note = ` Estimated from NOAA GOES proton flux.${rad.staleNote ? ` ${rad.staleNote}` : ""}`;
    }

    sources[id] = cur.source;
    assessments.push({
      indicator: id,
      status: ev.status,
      value: ev.value,
      unit: def.unit,
      takenAt: cur.takenAt,
      finding: finding(id, ev, crew, detail, progress) + note,
      actions: ev.status === "nominal" ? [] : def.actions,
      escalate: ev.escalate,
      ...(cur.note?.startsWith("scenario:") ? { drill: true } : {}),
    });
  }

  const byId = new Map(assessments.map((a) => [a.indicator, a]));
  const regions = Object.fromEntries(
    Object.values(BODY_REGIONS).map((r) => [r.id, worst(r.indicators.map((i) => byId.get(i)?.status ?? "unknown"))]),
  ) as Record<BodyRegionId, Status>;

  return {
    crew,
    overall: worst(assessments.map((a) => a.status)),
    assessments,
    regions,
    escalations: assessments.filter((a) => a.escalate),
    sources,
    scenario: scenario ? { ...scenario, label: SCENARIO_LABEL[scenario.type] } : null,
  };
}

export async function assessAllCrew(): Promise<CrewAssessment[]> {
  const crew = await listCrew();
  const out = await Promise.all(crew.map((c) => assessCrewMember(c.id)));
  return out.filter((x): x is CrewAssessment => x !== null);
}
