import { parseLinkParam, withLink } from "@/lib/link";
import type { LiveVitals, MonitorAlarm } from "@/lib/types";

/** Pure helpers for the global alarm bar (client- and server-safe, no React). */

export type AlarmLevel = "high" | "medium";

/** Where an alarm's numbers come from (from LiveVitals.source of that crew member). */
export type TelemetrySource = LiveVitals["source"];

export interface CrewAlarmGroup {
  crewId: string;
  crewName: string;
  /** Highest priority among this crew member's alarms. */
  level: AlarmLevel;
  /** True when any alarm of this crew member comes from a training scenario. */
  drill: boolean;
  /** High priority first, in the server's order otherwise. */
  alarms: MonitorAlarm[];
}

/** Monitor-style priority prefix: *** high, ** medium. */
export function priorityMark(a: Pick<MonitorAlarm, "priority">): string {
  return a.priority === "high" ? "***" : "**";
}

/** "*** PILOT · ST ELEVATION 3.1 mm" */
export function alarmLine(a: MonitorAlarm): string {
  return `${priorityMark(a)} ${a.crewName.toUpperCase()} · ${a.text}`;
}

/** Highest active priority, or null when there is nothing to show. */
export function alarmLevel(alarms: MonitorAlarm[]): AlarmLevel | null {
  if (!alarms.length) return null;
  return alarms.some((a) => a.priority === "high") ? "high" : "medium";
}

/** One group per crew member; crews with a high-priority alarm come first. */
export function groupByCrew(alarms: MonitorAlarm[]): CrewAlarmGroup[] {
  const map = new Map<string, CrewAlarmGroup>();
  for (const a of alarms) {
    let g = map.get(a.crewId);
    if (!g) {
      g = { crewId: a.crewId, crewName: a.crewName, level: "medium", drill: false, alarms: [] };
      map.set(a.crewId, g);
    }
    g.alarms.push(a);
    if (a.priority === "high") g.level = "high";
    if (a.drill) g.drill = true;
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.alarms.sort((x, y) => (x.priority === y.priority ? 0 : x.priority === "high" ? -1 : 1));
  }
  return groups.sort((x, y) => (x.level === y.level ? 0 : x.level === "high" ? -1 : 1));
}

/** Data label for a crew member's telemetry (SIMULATED / DEVICE + SIMULATED), or null for DEVICE data. */
export function telemetryLabel(source: TelemetrySource | undefined): string | null {
  if (source === "simulated") return "SIMULATED";
  if (source === "mixed") return "DEVICE + SIMULATED";
  return null;
}

/* ------------------------------------------------------------------------- */
/* Server-state refresh key                                                   */
/* ------------------------------------------------------------------------- */

/** Minimal scenario shape needed for the refresh key. */
export interface ScenarioRef {
  crewId: string;
  type: string;
  startedAt: string;
}

/**
 * Stable, order-independent key for what the server-rendered pages show
 * (overall status, regions, findings, escalation banner): the highest alarm
 * priority per crew member plus every active training scenario (crew, type,
 * start time). It changes when a drill starts or ends, or when a crew
 * member's alarm level escalates or clears, even if that crew member was
 * already in alarm. Individual alarms flapping within one level do not
 * change it, so they do not trigger a server re-render each poll.
 */
export function serverStateKey(alarms: MonitorAlarm[], scenarios: ScenarioRef[] = []): string {
  const level = new Map<string, AlarmLevel>();
  for (const a of alarms) {
    if (a.priority === "high" || !level.has(a.crewId)) level.set(a.crewId, a.priority);
  }
  const lv = [...level].map(([c, l]) => `${c}=${l}`).sort();
  const sc = scenarios.map((s) => `${s.crewId}~${s.type}@${s.startedAt}`).sort();
  return `${lv.join(",")}|${sc.join(",")}`;
}

/* ------------------------------------------------------------------------- */
/* "New alarm" detection                                                      */
/* ------------------------------------------------------------------------- */

/** An alarm is the same condition when id AND priority match. */
export function alarmIdentity(a: Pick<MonitorAlarm, "id" | "priority">): string {
  return `${a.id}#${a.priority}`;
}

/** Ids that disappear and come back within this window are not new (flapping). */
export const FLAP_WINDOW_MS = 15_000;

/**
 * Memory of recently active alarm conditions: per identity (id + priority)
 * the last time it was seen active. Treat as immutable.
 */
export interface AlarmTracker {
  lastSeen: ReadonlyMap<string, number>;
  /** Identities active in the latest poll. */
  active: ReadonlySet<string>;
}

export const EMPTY_TRACKER: AlarmTracker = { lastSeen: new Map(), active: new Set() };

/**
 * Compares a poll with what was recently active and returns the alarms that
 * count as NEW (they end an active silence and are announced), plus the
 * updated tracker.
 *
 *  - First poll (tracker null): every alarm is new.
 *  - Escalation (same id, medium -> high) is new: IEC 60601-1-8 treats a
 *    higher priority as a new alarm condition.
 *  - De-escalation (high -> medium) is not new: the condition was already
 *    raised at a higher priority.
 *  - Flapping: an identity (or the same id at a higher priority) seen within
 *    the last `windowMs` is not new, so an HR hovering around a limit does
 *    not keep cancelling Silence or re-announcing.
 */
export function trackAlarms(
  tracker: AlarmTracker | null,
  alarms: MonitorAlarm[],
  now: number,
  windowMs = FLAP_WINDOW_MS,
): { fresh: MonitorAlarm[]; tracker: AlarmTracker } {
  const prev = tracker?.lastSeen ?? new Map<string, number>();
  const recent = (key: string) => {
    const t = prev.get(key);
    return t != null && now - t <= windowMs;
  };
  const fresh = tracker
    ? alarms.filter((a) => {
        if (recent(alarmIdentity(a))) return false;
        if (a.priority === "medium" && recent(alarmIdentity({ id: a.id, priority: "high" }))) return false;
        return true;
      })
    : [...alarms];

  const lastSeen = new Map<string, number>();
  for (const [k, t] of prev) if (now - t <= windowMs) lastSeen.set(k, t);
  const active = new Set<string>();
  for (const a of alarms) {
    const k = alarmIdentity(a);
    lastSeen.set(k, now);
    active.add(k);
  }
  return { fresh, tracker: { lastSeen, active } };
}

/**
 * Marks the alarms active at the last poll as still seen at `now`. Call it
 * when polling resumes after a pause (hidden tab): those alarms were never
 * observed to clear, so they must not count as new afterwards.
 */
export function resumeTracker(tracker: AlarmTracker | null, now: number): AlarmTracker | null {
  if (!tracker) return null;
  const lastSeen = new Map(tracker.lastSeen);
  for (const k of tracker.active) lastSeen.set(k, now);
  return { lastSeen, active: tracker.active };
}

/** Screen-reader text for newly raised alarms. */
export function announce(fresh: MonitorAlarm[]): string {
  if (!fresh.length) return "";
  const parts = fresh.map(
    (a) =>
      `${a.priority === "high" ? "High priority" : "Medium priority"} alarm: ${a.crewName}, ${a.text}` +
      (a.drill ? " (training scenario, not a real emergency)" : ""),
  );
  return parts.join(". ") + ".";
}

/** "1:47" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The crew monitor of `crewId`, keeping the current page's signal-delay
 * profile (`linkParam`: the ?link= value; unknown or missing is dropped).
 */
export function monitorHref(crewId: string, linkParam?: string | null): string {
  return withLink(`/crew/${encodeURIComponent(crewId)}`, parseLinkParam(linkParam));
}

/** True when `pathname` is the crew page (or a sub-page) of `crewId`. */
export function isCrewPage(pathname: string | null, crewId: string): boolean {
  if (!pathname) return false;
  const base = `/crew/${encodeURIComponent(crewId)}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}
