import Link from "next/link";
import { Stethoscope } from "lucide-react";
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
      className="rounded-xl border border-critical/60 bg-critical/10 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <Stethoscope size={22} className="mt-0.5 shrink-0 text-critical" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="escalation-heading" className="text-base font-semibold text-critical">
            Contact the flight surgeon: {items.length} crew member{items.length > 1 ? "s" : ""} need
            {items.length > 1 ? "" : "s"} medical review
          </h2>
          <p className="mt-1 text-sm">
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
          <ul className="mt-3 space-y-3">
            {items.map((it) => (
              <li key={it.crewId} className="rounded-lg border border-critical/30 bg-surface/60 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold">
                    {it.crewName} <span className="font-normal text-muted">· {it.role}</span>
                  </h3>
                  <Link
                    href={`/body?crew=${it.crewId}`}
                    className="text-xs text-accent underline-offset-2 hover:underline focus-visible:underline"
                  >
                    Open actions for {it.crewName}
                  </Link>
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
