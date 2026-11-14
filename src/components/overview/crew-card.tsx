import Link from "next/link";
import { ArrowUpRight, ClipboardPlus, PersonStanding } from "lucide-react";
import { MiniMonitor } from "@/components/monitor/mini-monitor";
import { StatusBadge, STATUS_LABEL } from "@/components/ui";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { BodyRegionId, LiveVitals, ReadingSource, Status } from "@/lib/types";
import { DrillTag, StatusIcon } from "./status-icon";

export interface CrewCardFinding {
  indicator: string;
  status: Status;
  finding: string;
  source?: ReadingSource;
}

export interface CrewCardProps {
  id: string;
  name: string;
  role: string;
  /** Overall status from the (server) health assessment. */
  overall: Status;
  regions: Record<BodyRegionId, Status>;
  findings: CrewCardFinding[];
  /** Latest live monitor sample; when given, the card shows the demo monitor and reacts to its alarms. */
  vitals?: LiveVitals;
  /** @deprecated The overview no longer has a selected crew member; kept for compatibility. */
  selected?: boolean;
}

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

const TELEMETRY: Record<LiveVitals["source"], string> = {
  simulated: "simulated telemetry",
  sensor: "sensor telemetry",
  mixed: "sensor + simulated telemetry",
};

/** Short region label for the status row: "Heart & vessels" -> "Heart". */
function regionShort(id: BodyRegionId): string {
  return BODY_REGIONS[id].name.split(/[ &]/)[0];
}

/**
 * At-a-glance card for one crew member: overall status, a live demo monitor
 * strip, body-region status, top findings and links. A high-priority monitor
 * alarm turns the card red (glowing border, flashing status); drills carry a
 * "Training scenario" tag. Presentational: data comes from props.
 */
export function CrewCard({ id, name, role, overall, regions, findings, vitals }: CrewCardProps) {
  const alarms = vitals?.alarms ?? [];
  const alarmLevel = alarms.some((a) => a.priority === "high") ? "high" : alarms.length ? "medium" : null;
  // Live alarms can be newer than the server assessment: show the worse of both.
  const live: Status = alarmLevel === "high" ? "critical" : alarmLevel === "medium" ? "caution" : "unknown";
  const status = RANK[live] > RANK[overall] ? live : overall;
  const drill = vitals?.scenario ?? null;
  const sameRole = role.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <article
      aria-labelledby={`crew-${id}-name`}
      data-alarm={alarmLevel ?? undefined}
      className={`flex flex-col rounded-[26px] border bg-surface/80 p-5 backdrop-blur transition-[border-color,box-shadow] duration-500 md:p-6 ${
        alarmLevel === "high" ? "ac-card-high" : alarmLevel === "medium" ? "ac-card-medium" : "border-border/70"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            {sameRole ? `Crew · ${id.toUpperCase()}` : role}
          </p>
          <h3 id={`crew-${id}-name`} className="mt-1 truncate text-2xl font-semibold tracking-tight">
            <Link href={`/crew/${id}`} className="hover:text-accent focus-visible:text-accent">
              {name}
            </Link>
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={status} size="md" flash={alarmLevel === "high"} />
          {drill && <DrillTag label="Training scenario" />}
        </div>
      </header>

      {vitals && (
        <div className="mt-4">
          <MiniMonitor vitals={vitals} />
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span className="font-medium text-fg/80">Demo monitor</span>
            <span aria-hidden>·</span>
            <span>{TELEMETRY[vitals.source]}</span>
            <span aria-hidden>·</span>
            <span>waveforms synthesised from telemetry</span>
            {drill && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-caution">drill: {drill.label}</span>
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Body regions</h4>
        <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Body regions for ${name}`}>
          {(Object.keys(BODY_REGIONS) as BodyRegionId[]).map((r) => {
            const s = regions[r] ?? "unknown";
            return (
              <li key={r} title={`${BODY_REGIONS[r].name}: ${STATUS_LABEL[s]}`}>
                <StatusBadge status={s} size="xs" label={regionShort(r)} />
                <span className="sr-only">: {STATUS_LABEL[s]}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex-1">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Top findings</h4>
        {findings.length ? (
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug">
            {findings.map((f) => (
              <li key={f.indicator} className="flex gap-2">
                <StatusIcon status={f.status} size={14} className="mt-px" />
                <span className="min-w-0">
                  {f.finding}
                  {f.source === "simulated" && <span className="text-muted"> (simulated)</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted">All assessed indicators within normal range.</p>
        )}
      </div>

      <footer className="mt-6 flex flex-wrap gap-2 text-[13px]">
        <Link
          href={`/crew/${id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-medium text-bg transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open monitor<span className="sr-only"> for {name}</span>
          <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
        </Link>
        <Link
          href={`/body?crew=${id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          <PersonStanding size={14} aria-hidden /> Body map<span className="sr-only"> for {name}</span>
        </Link>
        <Link
          href={`/check-in?crew=${id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          <ClipboardPlus size={14} aria-hidden /> Check in<span className="sr-only"> {name}</span>
        </Link>
      </footer>
    </article>
  );
}
