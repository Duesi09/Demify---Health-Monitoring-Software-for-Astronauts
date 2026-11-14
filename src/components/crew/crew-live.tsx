"use client";

import { createContext, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DrillTag } from "@/components/overview/status-icon";
import { StatusBadge } from "@/components/ui";
import type { LiveVitals } from "@/lib/types";
import { useCrewLive } from "./use-crew-live";

/**
 * One live poll per crew page, shared by every client piece that needs the
 * current sample (drill panel, response sheet, header drill tag, stage glow,
 * record notes). The monitor itself keeps its own faster poll.
 *
 * It also keeps the server-rendered parts (health record, findings, switcher
 * tags) in step with drills: when the drill state seen by the poll differs
 * from the one the page was rendered with, the page is refreshed, and while a
 * drill runs it is refreshed every DRILL_REFRESH_MS so the record follows the
 * scenario as it evolves.
 */

type Ctx = ReturnType<typeof useCrewLive> & { refreshing: boolean; refreshPage: () => void };

const CrewLiveContext = createContext<Ctx | null>(null);

const DRILL_REFRESH_MS = 15_000;

function drillKey(v: LiveVitals): string | null {
  return v.scenario ? `${v.scenario.type}:${v.scenario.startedAt}` : null;
}

export function CrewLiveProvider({
  crewId,
  initial,
  children,
}: {
  crewId: string;
  initial: LiveVitals;
  children: ReactNode;
}) {
  const router = useRouter();
  const poll = useCrewLive(crewId, initial);
  const [refreshing, startRefresh] = useTransition();
  const serverKey = drillKey(initial);
  const liveKey = drillKey(poll.live);
  const requested = useRef<string | null>(serverKey);

  // Drill started/ended elsewhere (another tab, the API, the 30 min auto-end):
  // re-render the server parts once for the new state.
  useEffect(() => {
    if (poll.receivedAt == null || liveKey === serverKey || requested.current === liveKey) return;
    requested.current = liveKey;
    startRefresh(() => router.refresh());
  }, [liveKey, serverKey, poll.receivedAt, router]);

  // While a drill runs, keep the record and findings following the scenario.
  useEffect(() => {
    if (!liveKey) return;
    const t = setInterval(() => {
      if (!document.hidden) startRefresh(() => router.refresh());
    }, DRILL_REFRESH_MS);
    return () => clearInterval(t);
  }, [liveKey, router]);

  const value: Ctx = {
    ...poll,
    refreshing,
    refreshPage: () => {
      requested.current = liveKey;
      startRefresh(() => router.refresh());
    },
  };
  return <CrewLiveContext.Provider value={value}>{children}</CrewLiveContext.Provider>;
}

export function useCrewLiveContext(): Ctx {
  const ctx = useContext(CrewLiveContext);
  if (!ctx) throw new Error("useCrewLiveContext must be used inside <CrewLiveProvider>");
  return ctx;
}

/** Amber drill tag for the page header, driven by the live poll. */
export function LiveDrillTag() {
  const { live } = useCrewLiveContext();
  if (!live.scenario) return null;
  return (
    <DrillTag
      label={`Training scenario · drill · ${live.scenario.label}`}
      className="!h-auto min-h-[18px] max-w-full py-[3px] leading-[1.25]"
    />
  );
}

/** Background glow of the monitor stage: red while a drill or a high-priority alarm is active. */
export function StageGlow() {
  const { live } = useCrewLiveContext();
  const red = live.scenario != null || live.alarms.some((x) => x.priority === "high");
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 transition-[background] duration-700"
      style={{
        background: `radial-gradient(60% 55% at 50% 85%, ${red ? "rgba(220,38,38,0.22)" : "rgba(92,200,255,0.14)"}, transparent 70%)`,
      }}
    />
  );
}

/** Footnote under the monitor stage. */
export function StageFootnote() {
  const { live } = useCrewLiveContext();
  return (
    <p className="relative mt-8 flex flex-wrap items-center justify-center gap-2 px-2 text-center text-[11px] text-white/45">
      {live.scenario && (
        <DrillTag
          label="Training scenario running · not a real emergency"
          className="!h-auto min-h-[18px] max-w-full py-[3px] leading-[1.25]"
        />
      )}
      <span>Data: NASA OSDR · NOAA SWPC</span>
    </p>
  );
}

const ACTIVITY_LABEL: Record<LiveVitals["activity"], string> = {
  rest: "at rest",
  exercise: "exercising",
  sleep: "asleep",
};

/**
 * Explains why the record's vitals can differ from the monitor: the record
 * judges the resting median of the last hour, the monitor shows this second.
 */
export function RecordBasisNote({ crewName }: { crewName: string }) {
  const { live } = useCrewLiveContext();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <p className="min-w-[min(100%,18rem)] flex-1">
        <span className="font-semibold">Vitals: resting median of the last 60 min</span>
        <span className="text-muted"> · live values in the monitor above</span>
        {live.scenario && (
          <span className="text-muted"> · rows tagged DRILL show the current drill sample instead</span>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-live="polite">
        <span>
          Now: {crewName} is <span className="font-semibold text-fg">{ACTIVITY_LABEL[live.activity]}</span>
        </span>
        {live.scenario && <DrillTag label="Drill" />}
      </p>
    </div>
  );
}

/**
 * Alarms the monitor is raising right now, so the findings (judged on the
 * resting median) never silently disagree with the monitor above them.
 */
export function LiveAlarmsNote() {
  const { live } = useCrewLiveContext();
  const alarms = live.alarms;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm ${
        alarms.some((a) => a.priority === "high" && !a.drill) ? "border-critical/60" : "border-border"
      } bg-surface`}
    >
      <span className="text-[11px] font-medium text-muted">Monitor now</span>
      {alarms.length === 0 ? (
        <span className="text-muted">
          No live alarms ({ACTIVITY_LABEL[live.activity]}). Findings below use the resting median of the last 60 min.
        </span>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {alarms.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-1.5">
                <StatusBadge status={a.priority === "high" ? "critical" : "caution"} label={a.text} size="xs" />
                {a.drill && <DrillTag label="Drill" />}
              </li>
            ))}
          </ul>
          <span className="text-xs text-muted">
            {ACTIVITY_LABEL[live.activity]} · alarm limits adapt to activity; findings below use the resting median of the
            last 60 min{live.scenario ? " or the drill sample" : ""}.
          </span>
        </>
      )}
    </div>
  );
}
