import type { MonitorAlarm } from "@/lib/types";

/** Pure helpers for the global alarm bar (client- and server-safe, no React). */

export type AlarmLevel = "high" | "medium";

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

/** Stable key for the set of crew members in alarm (order-independent). */
export function crewSetKey(alarms: MonitorAlarm[]): string {
  return [...new Set(alarms.map((a) => a.crewId))].sort().join(",");
}

/** Alarms whose id was not active in the previous poll. */
export function newAlarms(prevIds: ReadonlySet<string> | null, alarms: MonitorAlarm[]): MonitorAlarm[] {
  if (!prevIds) return alarms;
  return alarms.filter((a) => !prevIds.has(a.id));
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
