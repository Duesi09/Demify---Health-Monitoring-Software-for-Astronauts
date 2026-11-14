import Link from "next/link";
import { ArrowUpRight, Stethoscope } from "lucide-react";
import { INDICATORS } from "@/lib/health/knowledge";
import type { CrewAssessment } from "@/lib/health/assess";
import { findingUnderLink, linkPolicy, withLink, type LinkProfileId } from "@/lib/link";
import type { IndicatorId, ReadingSource } from "@/lib/types";
import { bySeverity } from "./format";
import { DrillTag, SimulatedTag, StatusIcon } from "./status-icon";

export interface EscalationItem {
  crewId: string;
  crewName: string;
  role: string;
  /** Active training scenario for this crew member (label, e.g. "Heart attack (STEMI)"), if any. */
  scenarioLabel?: string | null;
  findings: {
    indicator: IndicatorId;
    status: "caution" | "critical" | "nominal" | "unknown";
    finding: string;
    source?: ReadingSource;
    /** The value comes from a training scenario (Assessment.drill). */
    drill?: boolean;
  }[];
}

/**
 * Banner items from the crew assessments: one per crew member with at least
 * one met escalation rule (Assessment.escalate), most severe finding first.
 */
export function escalationItems(
  all: Pick<CrewAssessment, "crew" | "escalations" | "sources" | "scenario">[],
): EscalationItem[] {
  return all
    .filter((a) => a.escalations.length)
    .map((a) => ({
      crewId: a.crew.id,
      crewName: a.crew.name,
      role: a.crew.role,
      scenarioLabel: a.scenario?.label ?? null,
      findings: [...a.escalations].sort(bySeverity).map((e) => ({
        indicator: e.indicator,
        status: e.status,
        finding: e.finding,
        source: a.sources[e.indicator],
        ...(e.drill ? { drill: true } : {}),
      })),
    }));
}

/** Every finding of this crew member is drill-driven. */
function drillOnly(it: EscalationItem): boolean {
  return it.findings.length > 0 && it.findings.every((f) => f.drill);
}

/** Every finding comes from SIMULATED telemetry or a drill: no crew entry or DEVICE reading among them. */
function simulatedOnly(it: EscalationItem): boolean {
  return it.findings.length > 0 && it.findings.every((f) => f.drill || f.source === "simulated");
}

/**
 * Top-of-page alert listing every crew member whose data warrants contacting
 * the flight surgeon. With long signal delays the crew acts first; in a
 * blackout (no contact) it acts on the onboard procedures and transmits when
 * contact returns (linkPolicy in src/lib/link.ts); finding texts then say
 * the rule is met but there is no contact (findingUnderLink).
 *
 * Findings driven by a training scenario are tagged DRILL. When every listed
 * finding comes from a drill, the whole banner is framed as a rehearsal
 * ("Training scenario · not a real emergency") and never tells the crew to
 * act now without that label. When the findings come from SIMULATED
 * telemetry (no drill, no crew entry or DEVICE reading), the banner says it
 * is training: in a real mission this prompts a call to the flight surgeon.
 */
export function EscalationBanner({
  items,
  commDelaySeconds,
  link = null,
}: {
  items: EscalationItem[];
  /** One-way signal delay in seconds; null means no contact (blackout). */
  commDelaySeconds: number | null;
  /** Signal-delay profile chosen with ?link=, carried into the links (null: none chosen). */
  link?: LinkProfileId | null;
}) {
  if (!items.length) return null;
  const policy = linkPolicy(commDelaySeconds);
  const allDrill = items.every(drillOnly);
  // Escalations raised from simulated data: show what would happen, framed as training.
  const training = !allDrill && items.every(simulatedOnly);
  const anyDrill = items.some((it) => it.scenarioLabel || it.findings.some((f) => f.drill));
  const n = items.length;
  const crewText = `${n} crew member${n > 1 ? "s" : ""}`;
  return (
    <section
      aria-labelledby="escalation-heading"
      className="rounded-[26px] border border-critical/50 bg-critical/[0.07] p-5 md:p-7"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-critical-fill text-on-critical">
          <Stethoscope size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {(anyDrill || training) && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {anyDrill && <DrillTag label={allDrill ? "Training scenario · drill" : "Includes a drill"} />}
              {training && <SimulatedTag />}
            </div>
          )}
          <h2 id="escalation-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
            {allDrill ? (
              <>Drill: rehearse contacting the flight surgeon for {crewText}</>
            ) : training ? (
              <>Training: in a real mission this prompts a call to the flight surgeon</>
            ) : policy.mode === "blackout" ? (
              <>
                Escalation rule met for {crewText}: no contact (blackout)
              </>
            ) : (
              <>
                Contact the flight surgeon: {crewText} {n > 1 ? "meet" : "meets"} an escalation rule
              </>
            )}
          </h2>
          {allDrill && (
            <p className="mt-2 max-w-3xl text-sm font-medium text-fg md:text-[15px]">
              Training scenario, not a real emergency. These findings come from a drill on simulated telemetry; practise
              the response below as you would for real.
            </p>
          )}
          {training && (
            <p className="mt-2 max-w-3xl text-sm font-medium text-fg md:text-[15px]">
              {crewText} {n > 1 ? "meet" : "meets"} an escalation rule on SIMULATED telemetry. Practise the steps
              below as you would in a real mission.
            </p>
          )}
          <p className="mt-2 max-w-3xl text-sm text-fg/85 md:text-[15px]">
            {allDrill && <strong className="font-semibold">In the drill: </strong>}
            {training && <strong className="font-semibold">In a real mission: </strong>}
            {policy.mode === "blackout" ? (
              <>
                <strong>No contact with the ground (blackout).</strong> Act on the onboard procedures: start the crew
                actions on the Body map now and log every value and action; transmit when contact returns.
              </>
            ) : policy.mode === "delayed" ? (
              <>
                One-way signal delay is <strong>{policy.label}</strong>. Do not wait for a reply: start the crew actions on
                the Body map now, then send the data and your notes to the ground.
              </>
            ) : (
              <>
                Request a private medical conference with the flight surgeon now (signal delay {policy.label}). Start the
                listed crew actions while you connect.
              </>
            )}
          </p>
          <ul className="mt-5 grid gap-3 xl:grid-cols-2">
            {items.map((it) => (
              <li key={it.crewId} className="rounded-2xl border border-critical/25 bg-surface/70 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                    <span>
                      {it.crewName}
                      {it.role !== it.crewName && <span className="font-normal text-muted"> · {it.role}</span>}
                    </span>
                    {(it.scenarioLabel || it.findings.some((f) => f.drill)) && (
                      <DrillTag label={drillOnly(it) ? "Drill" : "Drill active"} />
                    )}
                  </h3>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <Link
                      href={withLink(`/crew/${it.crewId}`, link)}
                      className="inline-flex items-center gap-0.5 text-accent underline-offset-2 hover:underline focus-visible:underline"
                    >
                      Open monitor<span className="sr-only"> for {it.crewName}</span>
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                    <Link
                      href={`/body?crew=${it.crewId}`}
                      className="text-accent underline-offset-2 hover:underline focus-visible:underline"
                    >
                      Open actions for {it.crewName}
                    </Link>
                  </span>
                </div>
                {(it.scenarioLabel || it.findings.some((f) => f.drill)) && (
                  <p className="mt-1.5 text-xs font-medium text-caution">
                    Training scenario{it.scenarioLabel ? ` (${it.scenarioLabel})` : ""}, not a real emergency
                    {drillOnly(it) ? "" : ". Findings without a DRILL tag are not from the drill"}.
                  </p>
                )}
                <ul className="mt-2 space-y-1.5 text-sm">
                  {it.findings.map((f) => (
                    <li key={f.indicator} className="flex gap-2">
                      <StatusIcon status={f.status} className="mt-0.5" />
                      <span className="min-w-0">
                        {f.drill && <DrillTag label="Drill" className="mr-1.5 align-[1px]" />}
                        {findingUnderLink(f.finding, policy.mode)}{" "}
                        <span className="text-muted">
                          Escalate when: {INDICATORS[f.indicator].escalation}
                          {f.drill ? " (training scenario value)" : f.source === "simulated" && " (SIMULATED data)"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
