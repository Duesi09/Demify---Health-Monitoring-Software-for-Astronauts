"use client";

import { useEffect, useRef, useState } from "react";
import { CircleStop, Siren, TriangleAlert } from "lucide-react";
import { DrillTag } from "@/components/overview/status-icon";
import { StatusBadge } from "@/components/ui";
import type { LiveVitals, MonitorAlarm, ScenarioType } from "@/lib/types";
import { useCrewLiveContext } from "./crew-live";
import { DRILL_BUTTONS, SCENARIO_NAME, activeProtocol, buildProtocol, type ProtocolId } from "./protocols";
import { ResponseChecklist } from "./response-checklist";
import { formatElapsed } from "./use-crew-live";

interface Sheet {
  key: string;
  protocol: ProtocolId;
  drill: boolean;
  /**
   * The alarm that opened the sheet, as first seen. It is looked up again by
   * its stable id on every poll (its text carries the live number, so it
   * changes from one sample to the next); this copy is the fallback once the
   * alarm has cleared, so the indicator-specific steps stay on the sheet.
   */
  alarm: MonitorAlarm | null;
}

function sheetFor(v: LiveVitals): Sheet | null {
  const p = activeProtocol(v);
  if (!p) return null;
  if (v.scenario) return { key: `drill:${v.scenario.type}:${v.scenario.startedAt}`, protocol: p.id, drill: true, alarm: null };
  // A general sheet belongs to one alarm; the specific protocols (STEMI, VF,
  // hypertensive crisis) persist while the alarm that maps to them changes.
  const key = p.id === "general" ? `alarm:general:${p.alarm?.id ?? "?"}` : `alarm:${p.id}`;
  return { key, protocol: p.id, drill: false, alarm: p.alarm };
}

type FocusTarget = "end" | "buttons" | null;

/**
 * Emergency drill panel + response checklist for one crew member.
 * Drills only change SIMULATED telemetry and are labelled as training
 * everywhere; starting one needs an inline confirmation.
 */
export function EmergencyConsole({
  crewId,
  crewName,
  commDelaySeconds,
  missionName,
}: {
  crewId: string;
  crewName: string;
  commDelaySeconds: number;
  missionName: string;
}) {
  const { live, receivedAt, nowMs, refetch, refreshing, refreshPage } = useCrewLiveContext();
  const [confirm, setConfirm] = useState<ScenarioType | null>(null);
  const [busy, setBusy] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const focusTarget = useRef<FocusTarget>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const firstDrillRef = useRef<HTMLButtonElement>(null);

  const scenario = live.scenario;
  // Only an in-flight request disables the controls; a background page
  // refresh does not (it would also block moving focus to them).
  const pending = busy !== null;

  // The response sheet stays open after the alarm clears or the drill ends
  // (for the debrief) until it is closed; a new event opens a fresh sheet.
  const current = sheetFor(live);
  const [sheet, setSheet] = useState<Sheet | null>(current);
  if (current && current.key !== sheet?.key) setSheet(current);

  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

  // Keep keyboard / screen-reader focus on the panel when the control that
  // had it unmounts (start -> "End drill", end/cancel -> the drill buttons).
  // The request is kept until the target exists and is enabled.
  useEffect(() => {
    const el = focusTarget.current === "end" ? endRef.current : focusTarget.current === "buttons" ? firstDrillRef.current : null;
    if (!el || el.disabled) return;
    el.focus();
    focusTarget.current = null;
  });

  function cancelConfirm() {
    setConfirm(null);
    focusTarget.current = "buttons";
  }

  const elapsedS =
    scenario == null
      ? 0
      : receivedAt != null && nowMs != null
        ? scenario.elapsedS + (nowMs - receivedAt) / 1000
        : scenario.elapsedS;

  async function call(kind: "start" | "end", type?: ScenarioType) {
    setBusy(kind);
    setError(null);
    try {
      const res =
        kind === "start"
          ? await fetch("/api/scenarios", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ crewId, type }),
            })
          : await fetch(`/api/scenarios?crewId=${encodeURIComponent(crewId)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
      }
      setConfirm(null);
      await refetch();
      focusTarget.current = kind === "start" ? "end" : "buttons";
      setAnnounce(
        kind === "start"
          ? `Training scenario started for ${crewName}: ${type ? SCENARIO_NAME[type] : "drill"}. Not a real emergency.`
          : `Training scenario ended for ${crewName}.`,
      );
      refreshPage();
    } catch (e) {
      setError(
        kind === "start"
          ? `Could not start the drill: ${e instanceof Error ? e.message : "network error"}`
          : `Could not end the drill: ${e instanceof Error ? e.message : "network error"}`,
      );
    } finally {
      setBusy(null);
    }
  }

  const liveAlarm = sheet?.alarm ? (live.alarms.find((a) => a.id === sheet.alarm?.id) ?? sheet.alarm) : null;
  const protocol = sheet
    ? buildProtocol(sheet.protocol, {
        commDelaySeconds,
        missionName,
        alarm: liveAlarm,
      })
    : null;

  return (
    <div className={`grid items-start gap-5 ${sheet ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
      <section
        aria-labelledby="drill-heading"
        className={`min-w-0 rounded-2xl border p-5 md:p-6 ${
          scenario ? "border-[#ffcc00]/70 bg-[#ffcc00]/[0.05]" : "border-border bg-surface"
        }`}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="drill-heading" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Siren size={18} aria-hidden className={scenario ? "text-caution" : "text-muted"} />
              Emergency drill
            </h3>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Drills only alter the simulated telemetry of {crewName} so the crew can rehearse; no real reading changes.
            </p>
          </div>
          {scenario ? (
            <DrillTag label="Drill active" />
          ) : (
            <StatusBadge status="unknown" label="No drill" size="md" />
          )}
        </header>

        {scenario ? (
          <div className="mt-5">
            <div className="rounded-xl border border-[#ffcc00]/60 bg-[#ffcc00]/[0.08] px-4 py-3">
              <p>
                <DrillTag label="Training scenario · drill · not a real emergency" className="!h-auto min-h-[18px] py-[3px] leading-[1.25]" />
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">{scenario.label ?? SCENARIO_NAME[scenario.type]}</p>
              <p className="mt-1 text-sm tabular text-muted" aria-live="off">
                Running for <span className="font-semibold">{formatElapsed(elapsedS)}</span> · started{" "}
                {scenario.startedAt.slice(11, 19)} UTC · ends automatically after 30 min
              </p>
            </div>
            <button
              ref={endRef}
              type="button"
              disabled={pending}
              onClick={() => call("end")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-fg/30 bg-fg px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CircleStop size={16} aria-hidden />
              {busy === "end" ? "Ending drill…" : "End drill"}
            </button>
          </div>
        ) : confirm ? (
          <div
            role="group"
            aria-labelledby="drill-confirm-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !pending) {
                e.stopPropagation();
                cancelConfirm();
              }
            }}
            className="mt-5 rounded-xl border border-caution/60 bg-caution/[0.07] p-4"
          >
            <p id="drill-confirm-title" className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert size={16} className="text-caution" aria-hidden />
              Start training scenario: {SCENARIO_NAME[confirm]}?
            </p>
            <p className="mt-1 text-sm text-muted">
              {DRILL_BUTTONS.find((b) => b.type === confirm)?.effect} Every screen will show red alarms for {crewName},
              labelled <span className="font-semibold text-fg">DRILL</span>. It ends automatically after 30 minutes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                ref={confirmRef}
                type="button"
                disabled={pending}
                onClick={() => call("start", confirm)}
                className="inline-flex items-center gap-2 rounded-lg bg-critical-fill px-4 py-2 text-sm font-semibold text-on-critical transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "start" ? "Starting drill…" : "Yes, start drill"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={cancelConfirm}
                className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={`mt-5 grid gap-2 sm:grid-cols-3 ${sheet ? "xl:grid-cols-1" : ""}`}>
            {DRILL_BUTTONS.map((b, i) => (
              <button
                key={b.type}
                ref={i === 0 ? firstDrillRef : undefined}
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  focusTarget.current = null;
                  setConfirm(b.type);
                }}
                className="group flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-left text-sm font-medium transition hover:border-critical/60 hover:bg-critical/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {b.label}
                <span aria-hidden className="text-muted transition group-hover:translate-x-0.5 group-hover:text-critical">
                  →
                </span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-critical/60 bg-critical/10 px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}
        {refreshing && !busy && <p className="mt-3 text-xs text-muted">Updating the page…</p>}
        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>
      </section>

      {sheet && protocol && (
        <ResponseChecklist
          key={sheet.key}
          protocol={protocol}
          drill={sheet.drill}
          drillRunning={sheet.drill && scenario != null}
          alarmActive={!sheet.drill && current?.key === sheet.key}
          alarmText={liveAlarm?.text ?? null}
          drillElapsed={scenario && sheet.drill ? formatElapsed(elapsedS) : null}
          onClose={current?.key === sheet.key ? null : () => setSheet(null)}
        />
      )}
    </div>
  );
}
