import Link from "next/link";
import { OctagonAlert, PhoneCall } from "lucide-react";
import { bySeverity } from "@/components/overview/format";
import { DrillTag, SimulatedTag } from "@/components/overview/status-icon";
import { StatusBadge } from "@/components/ui";
import { INDICATORS } from "@/lib/health/knowledge";
import { findingUnderLink, linkPolicy } from "@/lib/link";
import type { Assessment, ReadingSource } from "@/lib/types";
import { actionUnderLink } from "./protocols";

/**
 * Non-nominal findings with their actions, plus an escalation callout.
 *
 * Like the overview banner, the callout is framed as training when every
 * escalation comes from SIMULATED telemetry or a drill ("Training: in a real
 * mission this prompts a call to the flight surgeon"). In a blackout it says
 * the criteria are met but there is no contact, and finding texts and crew
 * actions drop "contact the flight surgeon" for the onboard procedures.
 */
export function Findings({
  assessments,
  sources,
  crewName,
  commDelaySeconds,
  drill,
}: {
  assessments: Assessment[];
  sources: Partial<Record<string, ReadingSource>>;
  crewName: string;
  /** One-way signal delay in seconds; null means no contact (blackout). */
  commDelaySeconds: number | null;
  /** A training scenario is running: findings partly come from drill telemetry. */
  drill: boolean;
}) {
  const open = assessments.filter((a) => a.status === "caution" || a.status === "critical").sort(bySeverity);
  const escalations = open.filter((a) => a.escalate);
  const drillEsc = escalations.filter((a) => a.drill);
  const allDrill = drillEsc.length > 0 && drillEsc.length === escalations.length;
  // Escalations raised from simulated data only (no crew entry, no DEVICE reading): framed as training.
  const training = !allDrill && escalations.length > 0 && escalations.every((a) => a.drill || sources[a.indicator] === "simulated");
  const policy = linkPolicy(commDelaySeconds);
  const blackout = policy.mode === "blackout";

  return (
    <div className="space-y-4">
      {escalations.length > 0 && (
        <div role="note" className="rounded-2xl border border-critical/70 bg-critical/[0.08] p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="critical" label="Escalate" size="md" />
            {drillEsc.length > 0 && <DrillTag label="Drill · training scenario" />}
            {training && <SimulatedTag />}
          </div>
          {training && (
            <p className="mt-3 text-sm font-semibold">Training: in a real mission this prompts a call to the flight surgeon.</p>
          )}
          <p className="mt-3 flex items-start gap-2 text-sm">
            <PhoneCall size={16} className="mt-0.5 shrink-0 text-critical" aria-hidden />
            <span>
              {escalations.length === 1 ? "One finding meets" : `${escalations.length} findings meet`} the criteria to
              contact the flight surgeon for {crewName}:{" "}
              <span className="font-semibold">{escalations.map((e) => INDICATORS[e.indicator].short).join(", ")}</span>
              {blackout
                ? ", but there is no contact with the ground (blackout): act on the onboard procedures and transmit when contact returns."
                : `. One-way signal delay ${policy.label}${policy.mode === "delayed" ? ": start the onboard checklist first, then report." : "."}`}
              {training && drillEsc.length === 0 && " These values come from SIMULATED telemetry."}
              {allDrill
                ? " These values come from a training scenario, not a real emergency."
                : drillEsc.length > 0
                  ? ` ${drillEsc.map((e) => INDICATORS[e.indicator].short).join(", ")} ${drillEsc.length === 1 ? "comes" : "come"} from the training scenario; the others are not part of the drill.`
                  : drill
                    ? " A training scenario is running, but these findings are not part of it."
                    : ""}
            </span>
          </p>
        </div>
      )}

      {open.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          All indicators are nominal or have no data. Nothing to act on right now.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {open.map((a) => {
            const src = sources[a.indicator];
            return (
              <li key={a.indicator} className="min-w-0 rounded-2xl border border-border bg-surface p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/guidance#ind-${a.indicator}`} className="font-semibold hover:text-accent hover:underline">
                    {INDICATORS[a.indicator].short}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.drill && <DrillTag label="Drill" />}
                    {a.escalate && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-critical">
                        <OctagonAlert size={11} aria-hidden /> Escalate
                      </span>
                    )}
                    <StatusBadge status={a.status} size="xs" />
                  </div>
                </div>
                <p className="mt-1.5 text-sm">{findingUnderLink(a.finding, policy.mode)}</p>
                {a.drill ? (
                  <p className="mt-1 text-[11px] text-muted">training scenario value · not a real emergency</p>
                ) : (
                  src === "simulated" && <p className="mt-1 text-[11px] text-muted">simulated value</p>
                )}
                {a.actions.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {a.actions.map((x) => (
                      <li key={x} className="flex gap-2">
                        <span aria-hidden className="text-fg">
                          –
                        </span>
                        {actionUnderLink(x, policy.mode)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
