import Link from "next/link";
import { ArrowUpRight, Stethoscope } from "lucide-react";
import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, ReadingSource } from "@/lib/types";
import { formatDelay } from "./format";
import { StatusIcon } from "./status-icon";

export interface EscalationItem {
  crewId: string;
  crewName: string;
  role: string;
  findings: {
    indicator: IndicatorId;
    status: "caution" | "critical" | "nominal" | "unknown";
    finding: string;
    source?: ReadingSource;
  }[];
}

/**
 * Top-of-page alert listing every crew member whose data warrants contacting
 * the flight surgeon. With long signal delays the crew acts first.
 */
export function EscalationBanner({ items, commDelaySeconds }: { items: EscalationItem[]; commDelaySeconds: number }) {
  if (!items.length) return null;
  const longDelay = commDelaySeconds >= 60;
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
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-critical">Escalation</p>
          <h2 id="escalation-heading" className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
            Contact the flight surgeon: {items.length} crew member{items.length > 1 ? "s" : ""} need
            {items.length > 1 ? "" : "s"} medical review
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-fg/85 md:text-[15px]">
            {longDelay ? (
              <>
                One-way signal delay is <strong>{formatDelay(commDelaySeconds)}</strong>. Do not wait for a reply: start
                the crew actions on the Body Map now, then send the data and your notes to the ground.
              </>
            ) : (
              <>
                Request a private medical conference with the flight surgeon now (signal delay{" "}
                {formatDelay(commDelaySeconds)}). Start the listed crew actions while you connect.
              </>
            )}
          </p>
          <ul className="mt-5 grid gap-3 xl:grid-cols-2">
            {items.map((it) => (
              <li key={it.crewId} className="rounded-2xl border border-critical/25 bg-surface/70 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold">
                    {it.crewName} <span className="font-normal text-muted">· {it.role}</span>
                  </h3>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <Link
                      href={`/crew/${it.crewId}`}
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
                <ul className="mt-2 space-y-1.5 text-sm">
                  {it.findings.map((f) => (
                    <li key={f.indicator} className="flex gap-2">
                      <StatusIcon status={f.status} className="mt-0.5" />
                      <span className="min-w-0">
                        {f.finding}{" "}
                        <span className="text-muted">
                          Escalate when: {INDICATORS[f.indicator].escalation}
                          {f.source === "simulated" && " (simulated demo data)"}
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
