"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { ALARM_PANEL_ID, DRILL_TAG, EVENT_ACT_NOW, alarmEvents, flightSurgeonLine, type AlarmEvent } from "@/lib/assistant/alarm-events";
import { PULSE_LOSS_ALARM_TEXT } from "@/lib/monitor/pulse-loss";
import { AssistantBot } from "./assistant-bot";
import { useActiveAlarms } from "./use-active-alarms";
import { useGroundLink } from "./use-ground-link";

/** First checks shown in the bubble for the phone pulse demo's NO PULSE alarm (same as the library checklist). */
export const PULSE_LOSS_STEPS = [
  "Check the crew member now: responsive? breathing normally? pulse?",
  "Not responsive, not breathing normally: call out cardiac arrest, start chest compressions, bring the AED.",
  "Responsive: put the fingertip back on the camera; the pulse should return.",
] as const;

export interface BubbleContent {
  key: string;
  title: string;
  crewName: string;
  drill: boolean;
  steps: string[];
}

/**
 * What the bubble shows for the most serious high-priority alarm event, or
 * null when no high-priority alarm is active. Pure (tested).
 */
export function bubbleContent(events: AlarmEvent[], blackout: boolean): BubbleContent | null {
  const e = events.find((x) => x.level === "high");
  if (!e) return null;
  const pulseLost = e.alarms.some((a) => a.text === PULSE_LOSS_ALARM_TEXT);
  return {
    key: e.key,
    title: pulseLost ? "No pulse: possible cardiac arrest" : e.title,
    crewName: e.crewName,
    drill: e.drill,
    steps: pulseLost ? [...PULSE_LOSS_STEPS, flightSurgeonLine(blackout)] : [EVENT_ACT_NOW, flightSurgeonLine(blackout)],
  };
}

/**
 * Small assistant bubble (bottom right) while a high-priority alarm is active:
 * the assistant bot, what the alarm is about, the first steps and a button to
 * the full walk-through on /assistant. Reads Demify's deterministic alarms
 * (the shared /api/alarms store); the assistant never raises or clears one.
 * Closing it hides it for this alarm only; a new alarm shows it again.
 */
export function AssistantBubble() {
  const pathname = usePathname();
  const { alarms, scenarios } = useActiveAlarms();
  const { state } = useGroundLink();
  const [closed, setClosed] = useState<string | null>(null);

  if (pathname === "/assistant" || pathname === "/pulse") return null;
  const content = bubbleContent(alarmEvents(alarms ?? [], scenarios), state ? !state.up : false);
  if (!content || closed === content.key) return null;

  return (
    <aside
      role="alert"
      aria-label="Assistant guidance for the active alarm"
      className="fixed bottom-4 right-4 z-50 w-[min(370px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-critical/30 bg-surface text-fg shadow-[0_18px_50px_rgba(15,23,41,0.22)]"
    >
      <div className="h-1 w-full bg-critical" aria-hidden />
      <div className="flex items-start gap-3 p-4">
        <AssistantBot size={46} alert className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-critical">
            {content.crewName}
            {content.drill ? ` · ${DRILL_TAG}` : ""}
          </p>
          <h2 className="mt-0.5 text-[15.5px] font-semibold leading-snug">{content.title}</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13px] leading-snug text-fg/85">
            {content.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Link
            href={`/assistant#${ALARM_PANEL_ID}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-2 text-[13px] font-semibold text-bg hover:opacity-90"
          >
            Open the assistant: step-by-step walk-through
            <ArrowRight size={15} aria-hidden />
          </Link>
          <p className="mt-2 text-[11px] leading-snug text-muted">Training alarm. The assistant advises; the crew decides.</p>
        </div>
        <button
          type="button"
          onClick={() => setClosed(content.key)}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
