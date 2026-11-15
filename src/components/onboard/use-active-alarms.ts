"use client";

import { useSyncExternalStore } from "react";
import type { EventScenario } from "@/lib/assistant/alarm-events";
import type { MonitorAlarm } from "@/lib/types";

/**
 * One shared, light poll of GET /api/alarms for the whole page: the "!" on
 * the Assistant nav item and the alarm panels on /assistant read the same
 * store, so one request every ALARMS_POLL_MS serves them all (paused while
 * the tab is hidden, each request aborted after REQUEST_TIMEOUT_MS). The
 * snapshot object only changes when an alarm (its priority or text) or a
 * training scenario changes; the nav badge reads only the alarm level
 * (useAlarmLevel), so it re-renders when that changes and not otherwise.
 *
 * The alarms are Demify's deterministic alarms (rule engine and training
 * scenarios); this store only reads them.
 */

export const ALARMS_POLL_MS = 3000;
const REQUEST_TIMEOUT_MS = 4000;

export interface ActiveAlarmsSnapshot {
  /** null until the first answer. */
  alarms: MonitorAlarm[] | null;
  scenarios: EventScenario[];
}

const EMPTY: ActiveAlarmsSnapshot = { alarms: null, scenarios: [] };

let snapshot: ActiveAlarmsSnapshot = EMPTY;
let snapshotKey = "";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;

/** Identity of a poll: alarms (id, priority, text) and training scenarios. */
export function alarmsKey(
  alarms: Pick<MonitorAlarm, "id" | "priority" | "text">[],
  scenarios: Pick<EventScenario, "crewId" | "type" | "startedAt">[],
): string {
  const a = alarms.map((x) => `${x.id}#${x.priority}#${x.text}`).sort();
  const s = scenarios.map((x) => `${x.crewId}~${x.type}@${x.startedAt}`).sort();
  return `${a.join(",")}|${s.join(",")}`;
}

function isAlarm(v: unknown): v is MonitorAlarm {
  const a = v as MonitorAlarm | null;
  return typeof a === "object" && a !== null && typeof a.id === "string" && typeof a.crewId === "string" && typeof a.text === "string";
}

function isScenario(v: unknown): v is EventScenario {
  const s = v as EventScenario | null;
  return typeof s === "object" && s !== null && typeof s.crewId === "string" && typeof s.type === "string" && typeof s.startedAt === "string";
}

async function poll(): Promise<void> {
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/alarms", { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return;
    const body = (await res.json()) as { alarms?: unknown; scenarios?: unknown };
    if (ctrl.signal.aborted) return;
    const alarms = Array.isArray(body.alarms) ? body.alarms.filter(isAlarm) : [];
    const scenarios = Array.isArray(body.scenarios)
      ? body.scenarios.filter(isScenario).map((s) => ({ crewId: s.crewId, type: s.type, startedAt: s.startedAt, ...(s.label ? { label: s.label } : {}) }))
      : [];
    const key = alarmsKey(alarms, scenarios);
    if (snapshot.alarms !== null && key === snapshotKey) return;
    snapshotKey = key;
    snapshot = { alarms, scenarios };
    listeners.forEach((l) => l());
  } catch {
    // Network error or timeout: keep the last known alarms (the alarm bar reports a broken feed).
  } finally {
    clearTimeout(timeout);
    if (inflight === ctrl) inflight = null;
  }
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (!document.hidden) await poll();
    if (listeners.size) schedule(ALARMS_POLL_MS);
  }, delay);
}

function onVisible(): void {
  if (!document.hidden && listeners.size) schedule(0);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    schedule(0);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      inflight?.abort();
      inflight = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/** The active alarms and training scenarios (alarms null before the first answer). */
export function useActiveAlarms(): ActiveAlarmsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Highest priority among the active high- and medium-priority alarms, or null. */
export function alarmLevelOf(alarms: Pick<MonitorAlarm, "priority">[] | null): "high" | "medium" | null {
  if (!alarms?.length) return null;
  if (alarms.some((a) => a.priority === "high")) return "high";
  return alarms.some((a) => a.priority === "medium") ? "medium" : null;
}

const getLevel = () => alarmLevelOf(snapshot.alarms);
const getServerLevel = () => null;

/** The level of the active alarms only (re-renders when it changes, not on every alarm change). */
export function useAlarmLevel(): "high" | "medium" | null {
  return useSyncExternalStore(subscribe, getLevel, getServerLevel);
}
