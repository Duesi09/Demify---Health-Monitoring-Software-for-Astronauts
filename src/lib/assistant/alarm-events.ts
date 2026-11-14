import type { RetrievalTier } from "@onboard/library.mjs";
import { BLACKOUT_ADVICE } from "../link";
import type { Citation, Freshness } from "../onboard/types";
import type { AlarmPriority, MonitorAlarm } from "../types";

/**
 * The assistant's response to an alarm Demify raised (pure, client- and
 * server-safe). The trigger is always Demify's deterministic alarms (GET
 * /api/alarms: the patient-monitor alarms and the active training
 * scenarios); the assistant never raises, rates or clears an alarm. It
 * responds with the matching checklist passages from the library at once
 * (fixed query, no model call) and, when a local language model runs, a
 * walk-through of them afterwards. It advises, never decides.
 *
 * One event per crew member in alarm, high priority first. A drill (training
 * scenario) is one event for its whole run; other alarms are keyed by the
 * most serious alarm, so a walk-through is requested once per alarm, not on
 * every poll. Works for any scenario or alarm type: the event uses the
 * scenario label and the alarm text as Demify shows them.
 */

/** Top line of every alarm panel. */
export const EVENT_ACT_NOW = "Start the checklist now and alert the crew. Do not wait for the assistant.";
/** Tag of an event that comes from a training scenario. */
export const DRILL_TAG = "Training scenario (drill)";
/** Accessible name of the "!" on the Assistant nav item. */
export const NAV_ALERT_LABEL = "Active alarm: the assistant has guidance";
/** Anchor of the alarm panels on /assistant. */
export const ALARM_PANEL_ID = "alarm-guidance";

/** The flight-surgeon line under the act-now line (from the library's "The flight-surgeon step"). */
export function flightSurgeonLine(blackout: boolean): string {
  if (blackout) {
    return `No contact with the ground: ${BLACKOUT_ADVICE}. Prepare the report for the flight surgeon: time of onset, rhythm, vital signs, actions taken.`;
  }
  return "Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.";
}

/** Under a walk-through written or shown during a blackout: the model may still repeat the checklist's contact step. */
export const BLACKOUT_STEP_NOTE =
  "No contact with the ground: wherever a step says to contact the flight surgeon, prepare the report instead and transmit it when contact returns.";

/** A training scenario as GET /api/alarms (or LiveVitals.scenario) reports it. */
export interface EventScenario {
  crewId: string;
  type: string;
  startedAt: string;
  /** Display label, e.g. "Acute myocardial infarction (STEMI)". */
  label?: string;
}

export interface AlarmEvent {
  /** Stable while the same drill runs, or the same most serious alarm stays active. */
  key: string;
  crewId: string;
  crewName: string;
  /** Highest priority of this crew member's alarms. */
  level: AlarmPriority;
  /** From a training scenario (drill). */
  drill: boolean;
  scenario: { type: string; label: string; startedAt: string } | null;
  /** High priority first. */
  alarms: Pick<MonitorAlarm, "id" | "priority" | "text">[];
  /** What the panel is about: the scenario label of a drill, else the most serious alarm's text. */
  title: string;
}

const rank = (p: AlarmPriority) => (p === "high" ? 0 : 1);

/** The part of an alarm id after "<crewId>:" ("ms2:hr" -> "hr"). */
function alarmKind(a: Pick<MonitorAlarm, "id" | "crewId">): string {
  return a.id.startsWith(`${a.crewId}:`) ? a.id.slice(a.crewId.length + 1) : a.id;
}

/**
 * One event per crew member with an active high- or medium-priority alarm,
 * crews with a high-priority alarm first (then by crew id, stable).
 */
export function alarmEvents(alarms: MonitorAlarm[], scenarios: EventScenario[] = []): AlarmEvent[] {
  const byCrew = new Map<string, MonitorAlarm[]>();
  for (const a of alarms) {
    if (a.priority !== "high" && a.priority !== "medium") continue;
    const list = byCrew.get(a.crewId) ?? [];
    list.push(a);
    byCrew.set(a.crewId, list);
  }
  const events: AlarmEvent[] = [];
  for (const [crewId, list] of byCrew) {
    const sorted = [...list].sort((x, y) => rank(x.priority) - rank(y.priority) || (alarmKind(x) < alarmKind(y) ? -1 : alarmKind(x) > alarmKind(y) ? 1 : 0));
    const top = sorted[0];
    const sc = scenarios.find((s) => s.crewId === crewId) ?? null;
    const drill = sc != null || sorted.some((a) => a.drill);
    const scenario = sc ? { type: sc.type, label: sc.label?.trim() || sc.type, startedAt: sc.startedAt } : null;
    events.push({
      key: scenario ? `${crewId}|drill|${scenario.type}|${scenario.startedAt}` : `${crewId}|alarm|${alarmKind(top)}`,
      crewId,
      crewName: top.crewName,
      level: sorted.some((a) => a.priority === "high") ? "high" : "medium",
      drill,
      scenario,
      alarms: sorted.map((a) => ({ id: a.id, priority: a.priority, text: a.text })),
      title: scenario ? scenario.label : top.text,
    });
  }
  return events.sort((x, y) => rank(x.level) - rank(y.level) || (x.crewId < y.crewId ? -1 : x.crewId > y.crewId ? 1 : 0));
}

/** True while any high- or medium-priority alarm is active (the "!" on the Assistant nav item). */
export function hasGuidanceAlarm(alarms: Pick<MonitorAlarm, "priority">[]): boolean {
  return alarms.some((a) => a.priority === "high" || a.priority === "medium");
}

/** Monitor text without values, limits and symbols: "SpO2 LOW 90 < 92" -> "SpO2 LOW". */
export function alarmWords(text: string): string {
  return text
    .replace(/(?<![\p{L}\d])[-+]?\d+(?:[.,]\d+)?(?:\s*(?:mmHg|mm|bpm|%|\/\s*min)(?![\p{L}]))?/giu, " ")
    .replace(/[<>≤≥=*/·|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The fixed library queries for an event, tried in this order until one
 * finds usable passages: the drill's scenario label, then each alarm's
 * text (most serious first), then the general high-priority checklist.
 * Built from Demify's own labels only, so new scenario and alarm types work
 * without changes here.
 */
export function eventQueries(e: Pick<AlarmEvent, "scenario" | "alarms">): string[] {
  const out: string[] = [];
  if (e.scenario) out.push(`${e.scenario.label} checklist`, e.scenario.label);
  for (const a of e.alarms) {
    const w = alarmWords(a.text);
    if (w) out.push(`${w} alarm checklist`, `${w} alarm`);
  }
  out.push("high-priority alarm checklist");
  return [...new Set(out.map((q) => q.trim()).filter(Boolean))];
}

/**
 * The fixed question of the walk-through (English; the model sees it in
 * the <question> block). Only words the library itself uses, so the
 * grounding check has nothing foreign to object to. In a blackout it says
 * so, so the walk-through follows the blackout procedure (the prompt's
 * ground-link status line says it too).
 */
export function walkthroughQuestion(e: Pick<AlarmEvent, "scenario" | "alarms" | "drill" | "title">, blackout = false): string {
  const subject = e.scenario ? e.scenario.label : alarmWords(e.title) || e.title;
  const link = blackout ? ` The ground link is down (no contact): ${BLACKOUT_ADVICE}.` : "";
  return `Alarm: "${subject}"${e.drill ? " (training drill)" : ""}.${link} Walk the crew through the response checklist for this alarm, step by step.`;
}

/** The walk-through of one event by the local language model (POST /api/assistant/event). */
export interface AlarmWalkthrough {
  /** Event key plus the link mode it was written for. */
  key: string;
  /**
   * answered: checked model text citing the event's passages;
   * passages-only: no model text (no model, model failed, or the text failed a check; see reason);
   * no-answer: the model found nothing in the passages; busy: the model is answering other questions (ask again later).
   */
  status: "answered" | "passages-only" | "no-answer" | "busy";
  answer: string | null;
  reason?: string;
  model: string | null;
  groundLink: "up" | "down";
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
}

/** The instant response to one event (GET /api/assistant/event). */
export interface AlarmGuidance {
  event: AlarmEvent;
  /** The fixed query that found the passages (null when none did). */
  query: string | null;
  /** The matching checklist passages, numbered [1]..[n] (the walk-through cites the same numbers). */
  citations: Citation[];
  freshness: Pick<Freshness, "librarySyncedAt" | "libraryAgeText" | "stale">;
  retrieval: RetrievalTier;
  fallbackReason?: string;
  integrityFailures: number;
  /** The finished walk-through for the current link mode, if there is one already. */
  walkthrough: AlarmWalkthrough | null;
}

export interface AlarmGuidanceResponse {
  events: AlarmGuidance[];
  /** No contact: ground-link switch down, or the conjunction profile (?link=conjunction). */
  blackout: boolean;
  /** A walk-through can be requested (a language model is ready). */
  model: { ready: boolean; name: string | null; reason?: string };
  at: string;
}
