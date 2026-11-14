import Link from "next/link";
import { ClipboardPlus, PersonStanding } from "lucide-react";
import { StatusBadge, STATUS_LABEL } from "@/components/ui";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { BodyRegionId, ReadingSource, Status } from "@/lib/types";
import { StatusIcon } from "./status-icon";

export interface CrewCardProps {
  id: string;
  name: string;
  role: string;
  overall: Status;
  regions: Record<BodyRegionId, Status>;
  findings: { indicator: string; status: Status; finding: string; source?: ReadingSource }[];
  selected: boolean;
}

/** At-a-glance health card for one crew member. */
export function CrewCard({ id, name, role, overall, regions, findings, selected }: CrewCardProps) {
  return (
    <article
      aria-labelledby={`crew-${id}-name`}
      className={`flex flex-col rounded-xl border bg-surface p-4 ${
        selected ? "border-accent/70 ring-1 ring-accent/40" : "border-border"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`crew-${id}-name`} className="truncate text-sm font-semibold">
            <Link
              href={`/?crew=${id}#detail`}
              className="hover:text-accent focus-visible:text-accent"
              aria-current={selected ? "true" : undefined}
            >
              {name}
            </Link>
          </h3>
          <p className="text-xs text-muted">{role}</p>
        </div>
        <StatusBadge status={overall} className="shrink-0" />
      </header>

      <ul className="mt-3 flex flex-wrap gap-1" aria-label={`Body regions for ${name}`}>
        {(Object.keys(BODY_REGIONS) as BodyRegionId[]).map((r) => {
          const s = regions[r] ?? "unknown";
          const tone =
            s === "critical"
              ? "border-critical/50 text-critical"
              : s === "caution"
                ? "border-caution/50 text-caution"
                : "border-border text-muted";
          return (
            <li
              key={r}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${tone}`}
              title={`${BODY_REGIONS[r].name}: ${STATUS_LABEL[s]}`}
            >
              <StatusIcon status={s} size={11} />
              <span>{BODY_REGIONS[r].name.split(" ")[0]}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex-1">
        <h4 className="text-[11px] uppercase tracking-wider text-muted">Top findings</h4>
        {findings.length ? (
          <ul className="mt-1.5 space-y-1.5 text-xs">
            {findings.map((f) => (
              <li key={f.indicator} className="flex gap-1.5">
                <StatusIcon status={f.status} size={13} className="mt-px" />
                <span className="min-w-0">
                  {f.finding}
                  {f.source === "simulated" && <span className="text-muted"> (simulated)</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-muted">All assessed indicators within normal range.</p>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link
          href={`/body?crew=${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          <PersonStanding size={14} aria-hidden /> Body map<span className="sr-only"> for {name}</span>
        </Link>
        <Link
          href={`/check-in?crew=${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-2.5 py-1.5 text-accent hover:bg-accent/10 focus-visible:bg-accent/10"
        >
          <ClipboardPlus size={14} aria-hidden /> Check in<span className="sr-only"> {name}</span>
        </Link>
      </footer>
    </article>
  );
}
