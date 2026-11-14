"use client";

import { useState } from "react";
import { ClipboardList, RotateCcw, X } from "lucide-react";
import { DrillTag } from "@/components/overview/status-icon";
import { StatusBadge } from "@/components/ui";
import type { Protocol } from "./protocols";

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

/**
 * Emergency response checklist in the style of a resuscitation code sheet:
 * each step is checked off with the (client) time it was done. State is local
 * to this browser tab; it is a training/coordination aid, not a medical record.
 */
export function ResponseChecklist({
  protocol,
  drill,
  drillRunning,
  alarmActive,
  alarmText,
  drillElapsed,
  onClose,
}: {
  protocol: Protocol;
  drill: boolean;
  drillRunning: boolean;
  alarmActive: boolean;
  alarmText: string | null;
  drillElapsed: string | null;
  /** Null while the triggering drill/alarm is still active (sheet cannot be closed). */
  onClose: (() => void) | null;
}) {
  const [done, setDone] = useState<Record<string, number>>({});
  const doneCount = protocol.steps.filter((s) => done[s.id] != null).length;
  const firstAt = Object.values(done).sort((a, b) => a - b)[0];

  // The time is read in the event handler: state updaters must stay pure.
  function toggle(id: string, checked: boolean, at: number) {
    setDone((d) => {
      const next = { ...d };
      if (checked) next[id] = at;
      else delete next[id];
      return next;
    });
  }

  return (
    <section
      aria-labelledby="sheet-heading"
      className={`min-w-0 rounded-2xl border bg-surface p-5 md:p-6 ${drill ? "border-[#ffcc00]/60" : "border-critical/60"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {drill ? (
              <DrillTag label="Drill · training scenario" />
            ) : (
              <StatusBadge status="critical" label={alarmActive ? "Alarm active" : "Alarm cleared"} size="xs" flash={alarmActive} />
            )}
            {drill && !drillRunning && <StatusBadge status="unknown" label="Drill ended · debrief" size="xs" />}
          </div>
          <h3 id="sheet-heading" className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight">
            <ClipboardList size={18} aria-hidden className={drill ? "text-caution" : "text-critical"} />
            Emergency response checklist
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {protocol.title}
            {alarmText && !drill ? ` · triggered by ${alarmText}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDone({})}
            disabled={!doneCount}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
          >
            <RotateCcw size={13} aria-hidden /> Clear
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={13} aria-hidden /> Close sheet
            </button>
          )}
        </div>
      </header>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted tabular">
        <span>
          {doneCount}/{protocol.steps.length} steps done
        </span>
        {drillElapsed && <span>Drill time {drillElapsed}</span>}
        {firstAt != null && <span>First action {clock(firstAt)} UTC</span>}
      </div>

      <ol className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {protocol.steps.map((s, i) => {
          const at = done[s.id];
          const checked = at != null;
          return (
            <li key={s.id} className={checked ? "bg-nominal/[0.06]" : ""}>
              <label className="flex cursor-pointer gap-3 px-3 py-3 sm:px-4">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(s.id, e.target.checked, Date.now())}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--nominal)]"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${checked ? "text-muted line-through decoration-muted/60" : "text-fg"}`}>
                    <span className="mr-1.5 font-semibold tabular text-muted">{i + 1}.</span>
                    {s.text}
                  </span>
                  {s.detail && <span className="mt-0.5 block text-xs text-muted">{s.detail}</span>}
                </span>
                <span className="w-[72px] shrink-0 text-right text-xs tabular">
                  {checked ? (
                    <span className="font-semibold text-nominal">
                      {clock(at)}
                      <span className="block text-[10px] font-normal text-muted">UTC</span>
                    </span>
                  ) : (
                    <span className="text-muted" aria-hidden>
                      —:—
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] text-muted">
        Follows the onboard medical checklist; the flight surgeon directs treatment. Times are this device&apos;s clock and
        are kept only in this browser tab.
      </p>
    </section>
  );
}
