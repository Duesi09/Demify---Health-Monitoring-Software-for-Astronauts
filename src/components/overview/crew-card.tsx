import Link from "next/link";
import { ArrowUpRight, ClipboardPlus, PersonStanding } from "lucide-react";
import { MiniMonitor } from "@/components/monitor/mini-monitor";
import { StatusBadge, STATUS_LABEL } from "@/components/ui";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import { REGION_ICON } from "@/components/body/regions";
import { withLink, type LinkProfileId } from "@/lib/link";
import type { BodyRegionId, LiveVitals, ReadingSource, Status } from "@/lib/types";
import { DrillTag, StatusIcon } from "./status-icon";

export interface CrewCardFinding {
  indicator: string;
  status: Status;
  finding: string;
  source?: ReadingSource;
  /** The value comes from a training scenario (Assessment.drill). */
  drill?: boolean;
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
  /** Signal-delay profile chosen with ?link=, carried into the card's links (null: none chosen). */
  link?: LinkProfileId | null;
}

const RANK: Record<Status, number> = { unknown: 0, nominal: 1, caution: 2, critical: 3 };

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
const CHIP: Record<Status, string> = {
  nominal: "border-border bg-surface text-fg",
  caution: "border-transparent bg-caution-fill text-on-caution",
  critical: "border-transparent bg-critical-fill text-on-critical",
  unknown: "border-dashed border-border bg-transparent text-muted",
};

/**
 * Body-region chip: the organ's own icon plus its name. Regions that need
 * attention switch to a solid alarm fill (amber / red); nominal regions stay
 * quiet with the icon tinted green. The status is also spelled out for
 * screen readers and in the tooltip.
 */
function RegionChip({ region, status }: { region: BodyRegionId; status: Status }) {
  const Icon = REGION_ICON[region];
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-[5px] border px-1.5 text-[11.5px] font-medium leading-none ${CHIP[status]}`}
    >
      <Icon
        size={13}
        strokeWidth={2.2}
        aria-hidden
        className={status === "nominal" ? "text-nominal" : status === "unknown" ? "text-muted" : ""}
      />
      {regionShort(region)}
      <span className="sr-only">: {STATUS_LABEL[status]}</span>
    </span>
  );
}

export function CrewCard({ id, name, role, overall, regions, findings, vitals, link = null }: CrewCardProps) {
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
      className={`flex flex-col rounded-[26px] border bg-surface p-5 transition-[border-color,box-shadow] duration-500 md:p-6 ${
        alarmLevel === "high" ? "ac-card-high" : alarmLevel === "medium" ? "ac-card-medium" : "border-border/70"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`crew-${id}-name`} className="text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
            <Link href={withLink(`/crew/${id}`, link)} className="hover:text-accent focus-visible:text-accent">
              {name}
            </Link>
          </h3>
          {!sameRole && <p className="mt-0.5 text-sm text-muted">{role}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={status} size="md" flash={alarmLevel === "high"} />
          {drill && <DrillTag label="Training scenario" />}
        </div>
      </header>

      {vitals && (
        <div className="mt-4">
          <MiniMonitor vitals={vitals} />
        </div>
      )}

      <div className="mt-5">
        <h4 className="text-[11px] font-medium text-muted">Body regions</h4>
        <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Body regions for ${name}`}>
          {(Object.keys(BODY_REGIONS) as BodyRegionId[]).map((r) => {
            const s = regions[r] ?? "unknown";
            return (
              <li key={r} title={`${BODY_REGIONS[r].name}: ${STATUS_LABEL[s]}`}>
                <RegionChip region={r} status={s} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex-1">
        <h4 className="text-[11px] font-medium text-muted">Top findings</h4>
        {findings.length ? (
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug">
            {findings.map((f) => (
              <li key={f.indicator} className="flex gap-2">
                <StatusIcon status={f.status} size={14} className="mt-px" />
                <span className="min-w-0">
                  {f.drill && <DrillTag label="Drill" className="mr-1.5 align-[1px]" />}
                  {f.finding}
                  {!f.drill && f.source === "simulated" && <span className="text-muted"> (SIMULATED)</span>}
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
          href={withLink(`/crew/${id}`, link)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-medium text-bg transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open monitor<span className="sr-only"> for {name}</span>
          <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
        </Link>
        <Link
          href={withLink(`/body?crew=${id}`, link)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          <PersonStanding size={14} aria-hidden /> Body map<span className="sr-only"> for {name}</span>
        </Link>
        <Link
          href={withLink(`/check-in?crew=${id}`, link)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          <ClipboardPlus size={14} aria-hidden /> Check in<span className="sr-only"> {name}</span>
        </Link>
      </footer>
    </article>
  );
}
