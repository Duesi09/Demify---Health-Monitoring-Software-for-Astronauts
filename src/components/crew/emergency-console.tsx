"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, Siren, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import type { LiveVitals, ScenarioType } from "@/lib/types";
import { DRILL_BUTTONS, SCENARIO_NAME, activeProtocol, buildProtocol, type ProtocolId } from "./protocols";
import { ResponseChecklist } from "./response-checklist";
import { formatElapsed, useCrewLive } from "./use-crew-live";

interface Sheet {
  key: string;
  protocol: ProtocolId;
  drill: boolean;
  alarmText: string | null;
}

function sheetFor(v: LiveVitals): Sheet | null {
  const p = activeProtocol(v);
  if (!p) return null;
  return v.scenario
    ? { key: `drill:${v.scenario.type}:${v.scenario.startedAt}`, protocol: p.id, drill: true, alarmText: null }
    : { key: `alarm:${p.id}`, protocol: p.id, drill: false, alarmText: p.alarm?.text ?? null };
}

/**
 * Emergency drill panel + response checklist for one crew member.
 * Drills only change SIMULATED telemetry and are labelled as training
 * everywhere; starting one needs an inline confirmation.
 */
export function EmergencyConsole({
  crewId,
  crewName,
  initial,
  commDelaySeconds,
  missionName,
}: {
  crewId: string;
  crewName: string;
  initial: LiveVitals;
  commDelaySeconds: number;
  missionName: string;
}) {
  const router = useRouter();
  const { live, receivedAt, nowMs, refetch } = useCrewLive(crewId, initial);
  const [confirm, setConfirm] = useState<ScenarioType | null>(null);
  const [busy, setBusy] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const confirmRef = useRef<HTMLButtonElement>(null);

  const scenario = live.scenario;
  const pending = busy !== null || refreshing;

  // The response sheet stays open after the alarm clears or the drill ends
  // (for the debrief) until it is closed; a new event opens a fresh sheet.
  const current = sheetFor(live);
  const [sheet, setSheet] = useState<Sheet | null>(current);
  if (current && current.key !== sheet?.key) setSheet(current);

  useEffect(() => {
    if (confirm) confirmRef.current?.focus();
  }, [confirm]);

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
      startRefresh(() => router.refresh());
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

  const protocol = sheet
    ? buildProtocol(sheet.protocol, {
        commDelaySeconds,
        missionName,
        alarm: sheet.drill ? null : live.alarms.find((a) => a.text === sheet.alarmText) ?? null,
      })
    : null;

  return (
    <div className={`grid items-start gap-5 ${sheet ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
      <section
        aria-labelledby="drill-heading"
        className={`min-w-0 rounded-2xl border p-5 md:p-6 ${
          scenario ? "border-critical/70 bg-critical/[0.06]" : "border-border bg-surface"
        }`}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="drill-heading" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <Siren size={18} aria-hidden className={scenario ? "text-critical" : "text-muted"} />
              Emergency drill
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Drills only alter the simulated telemetry of {crewName} so the crew can rehearse; no real reading changes.
            </p>
          </div>
          {scenario ? (
            <StatusBadge status="critical" label="Drill active" flash size="md" />
          ) : (
            <StatusBadge status="unknown" label="No drill" size="md" />
          )}
        </header>

        {scenario ? (
          <div className="mt-5">
            <div className="rounded-xl bg-critical-fill px-4 py-3 text-on-critical">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Training scenario · drill · not a real emergency</p>
              <p className="mt-1 text-lg font-semibold leading-snug">{scenario.label ?? SCENARIO_NAME[scenario.type]}</p>
              <p className="mt-1 text-sm tabular" aria-live="off">
                Running for <span className="font-semibold">{formatElapsed(elapsedS)}</span> · started{" "}
                {scenario.startedAt.slice(11, 19)} UTC · ends automatically after 30 min
              </p>
            </div>
            <button
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
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={`mt-5 grid gap-2 sm:grid-cols-3 ${sheet ? "xl:grid-cols-1" : ""}`}>
            {DRILL_BUTTONS.map((b) => (
              <button
                key={b.type}
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
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
      </section>

      {sheet && protocol && (
        <ResponseChecklist
          key={sheet.key}
          protocol={protocol}
          drill={sheet.drill}
          drillRunning={sheet.drill && scenario != null}
          alarmActive={!sheet.drill && current?.key === sheet.key}
          alarmText={sheet.alarmText}
          drillElapsed={scenario && sheet.drill ? formatElapsed(elapsedS) : null}
          onClose={current?.key === sheet.key ? null : () => setSheet(null)}
        />
      )}
    </div>
  );
}
