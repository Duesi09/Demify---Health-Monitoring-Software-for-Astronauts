"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ALARM_LIMITS } from "@/lib/monitor/alarms";
import type { IndicatorId, LiveVitals, MonitorAlarm } from "@/lib/types";
import { mmss } from "./waveform";

/** Clinical parameter colours, in refined keynote tones. */
export const MONITOR_COLOR = {
  ecg: "#5ee3a1",
  abp: "#ff6b64",
  pleth: "#64d2ff",
  resp: "#f5d565",
  temp: "#e5e5ea",
} as const;

/** IBM Plex Sans (bundled with the app), thin weights for the large numerics. */
export const KEYNOTE_FONT =
  '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif';

const SOURCE_LABEL: Record<LiveVitals["source"], string> = {
  simulated: "Simulated telemetry",
  sensor: "Sensor",
  mixed: "Mixed · sensor + simulated",
};

/* ------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* ------------------------------------------------------------------------- */

const RM_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeRm(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeRm,
    () => (window.matchMedia ? window.matchMedia(RM_QUERY).matches : false),
    () => false,
  );
}

/*
 * UTC clock store. The snapshot is cached and only changes in the timer
 * tick, so getSnapshot returns the same string for React's repeated
 * consistency checks even when a second boundary falls between them.
 */
let clockValue: string | null = null;
const utcNow = () => new Date().toISOString().slice(11, 19);
function subscribeSecond(cb: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    clockValue = utcNow();
    cb();
    // Re-align to just after the next whole second.
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
  };
  // Refresh a value left over from an earlier mount; React re-reads the
  // snapshot after subscribing and re-renders if it changed.
  clockValue = utcNow();
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
  return () => clearTimeout(timer);
}
function getClockSnapshot(): string | null {
  if (clockValue == null) clockValue = utcNow();
  return clockValue;
}
/** Current UTC time as "HH:MM:SS", client-only (null during SSR/hydration). */
export function useUtcClock(): string | null {
  return useSyncExternalStore(subscribeSecond, getClockSnapshot, () => null);
}

/* ------------------------------------------------------------------------- */
/* Alarm helpers                                                              */
/* ------------------------------------------------------------------------- */

export function topAlarm(alarms: MonitorAlarm[]): MonitorAlarm | null {
  return alarms.find((a) => a.priority === "high") ?? alarms[0] ?? null;
}

/** Highest-priority alarm for a set of indicators (numeric block inversion). */
export function alarmFor(alarms: MonitorAlarm[], ...ids: IndicatorId[]): MonitorAlarm | null {
  const hits = alarms.filter((a) => a.indicator && ids.includes(a.indicator));
  return hits.find((a) => a.priority === "high") ?? hits[0] ?? null;
}

/** Philips-style alarm prefix: *** high, ** medium. */
export function alarmPrefix(a: MonitorAlarm): string {
  return a.priority === "high" ? "***" : "**";
}

/**
 * Alarm prefix as an element. Under prefers-reduced-motion the band and the
 * numerics stop flashing, but the high-priority "***" keeps blinking
 * (IEC 60601-1-8 expects a flashing indicator for high priority).
 */
export function AlarmPrefix({ alarm }: { alarm: MonitorAlarm }) {
  return <span className={alarm.priority === "high" ? "dm-prefix-high" : undefined}>{alarmPrefix(alarm)}</span>;
}

/* ------------------------------------------------------------------------- */
/* Tags (squared, uppercase; never rounded pills)                             */
/* ------------------------------------------------------------------------- */

const TAG = "inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-[9.5px] font-semibold leading-none";

/** Solid, permanent DEMO tag (like a bedside monitor in demo mode). */
export function DemoTag({ className = "" }: { className?: string }) {
  return (
    <span className={`${TAG} bg-white text-black ${className}`} title="Demo monitor: not a medical device">
      Demo
    </span>
  );
}

const ACTIVITY_LABEL: Record<Exclude<LiveVitals["activity"], "rest">, { text: string; title: string }> = {
  exercise: { text: "Exercise", title: "Scheduled exercise: higher heart and resp rates are expected; alarm limits adjusted" },
  sleep: { text: "Sleep", title: "Sleep period: lower heart rate is expected; low limits adjusted" },
};

/** Small neutral activity tag ("EXERCISE" / "SLEEP"); nothing at rest. */
export function ActivityTag({ activity, className = "" }: { activity: LiveVitals["activity"]; className?: string }) {
  if (activity === "rest") return null;
  const a = ACTIVITY_LABEL[activity];
  return (
    <span className={`${TAG} bg-white/[0.08] text-white/75 ${className}`} title={a.title}>
      {a.text}
    </span>
  );
}

/** Heart-rate / resp alarm limits for the current activity (mirrors computeAlarms). */
export function activityLimits(activity: LiveVitals["activity"]) {
  const L = ALARM_LIMITS;
  return {
    hrHigh: activity === "exercise" ? L.hrExercise.high : L.hr.high,
    hrLow: activity === "sleep" ? L.hrSleep.low : L.hr.low,
    respHigh: activity === "exercise" ? L.respExercise.high : L.resp.high,
    respLow: L.resp.low,
  };
}

const SOURCE_SHORT: Record<LiveVitals["source"], string> = {
  simulated: "Simulated",
  sensor: "Sensor",
  mixed: "Sensor + sim",
};

/** Data-source tag; shortened when its @container (the monitor stage) is narrow. */
export function SourceTag({ source, className = "" }: { source: LiveVitals["source"]; className?: string }) {
  return (
    <span className={`${TAG} text-white/60 ring-1 ring-inset ring-white/15 ${className}`} title={SOURCE_LABEL[source]}>
      <span className="@md:hidden">{SOURCE_SHORT[source]}</span>
      <span className="hidden @md:inline">{SOURCE_LABEL[source]}</span>
    </span>
  );
}

/** Amber training-scenario tag: drills must never look like a real emergency. */
export function DrillTag({
  scenario,
  compact = false,
  className = "",
}: {
  scenario: NonNullable<LiveVitals["scenario"]>;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`${TAG} ${compact ? "" : "!h-auto min-h-[18px] py-[3px] leading-[1.25]"} min-w-0 bg-[#ffcc00] text-[#1c1400] ${className}`}
    >
      <span className={compact ? "truncate" : ""}>
        {compact ? "Drill" : "Training scenario"} · {mmss(scenario.elapsedS)}
        {!compact && <> · {scenario.label}</>}
      </span>
    </span>
  );
}

export function fmt(v: number | null, digits = 0): string {
  return v == null ? "---" : v.toFixed(digits);
}

/**
 * Numeric text that eases (cross-fades) when its value changes, but not on
 * first mount, so numbers never jump yet never start dimmed. Uses the Web
 * Animations API and is skipped under prefers-reduced-motion.
 */
export function Val({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const prev = useRef(children);
  useEffect(() => {
    if (prev.current === children) return;
    prev.current = children;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.(RM_QUERY).matches) return;
    el.animate(
      [
        { opacity: 0.4, filter: "blur(1.5px)" },
        { opacity: 1, filter: "blur(0px)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [children]);
  return (
    <span ref={ref} className="inline-block whitespace-nowrap">
      {children}
    </span>
  );
}
