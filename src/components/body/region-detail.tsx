import Link from "next/link";
import { ArrowUpRight, BookOpen, PhoneCall, Ruler } from "lucide-react";
import { BODY_REGIONS, HAZARDS, INDICATORS } from "@/lib/health/knowledge";
import type { Assessment, BodyRegionId, IndicatorId, Reading, Status } from "@/lib/types";
import { StatusBadge, STATUS_TEXT, tagClass } from "@/components/ui";
import { BasisTag } from "@/components/guidance/basis";
import { SOURCE_LABEL } from "@/components/overview/format";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { REGION_ICON, STATUS_RANK } from "./regions";

function formatValue(a: Assessment): string {
  if (a.value == null) return "—";
  return a.value.toFixed(INDICATORS[a.indicator].decimals);
}

/** Deterministic UTC timestamp (same on server and client, no hydration drift). */
function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${iso.slice(11, 16)} UTC`;
}

const STATUS_RING: Record<Status, string> = {
  nominal: "border-border",
  caution: "border-caution/40",
  critical: "border-critical/50",
  unknown: "border-border border-dashed",
};

export function RegionDetail({
  region,
  status,
  assessments,
  sources,
  crewName,
}: {
  region: BodyRegionId;
  status: Status;
  assessments: Partial<Record<IndicatorId, Assessment>>;
  sources: Partial<Record<IndicatorId, Reading["source"]>>;
  crewName: string;
}) {
  const def = BODY_REGIONS[region];
  const Icon = REGION_ICON[region];
  const rows = def.indicators
    .map((id) => assessments[id])
    .filter((a): a is Assessment => !!a)
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  const escalations = rows.filter((a) => a.escalate);
  const measured = rows.filter((a) => a.status !== "unknown").length;

  return (
    <section
      key={region}
      aria-live="polite"
      aria-labelledby="region-detail-title"
      className="bm-panel-in rounded-xl border border-border bg-surface"
    >
      <header className="border-b border-border p-4 md:p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg">
            <Icon size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 id="region-detail-title" className="text-xl font-semibold tracking-[-0.015em]">
                {def.name}
              </h2>
              <StatusBadge status={status} size="md" />
            </div>
            <p className="mt-1 text-sm text-muted">{def.function}</p>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-4 md:p-6">
        {escalations.length > 0 && (
          <div role="alert" className="rounded-lg border border-critical/50 bg-critical/10 p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-critical">
              <PhoneCall size={16} aria-hidden />
              Contact the flight surgeon
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {escalations.map((a) => (
                <li key={a.indicator}>
                  <span className="font-medium">{INDICATORS[a.indicator].short}:</span>{" "}
                  <span className="text-muted">{INDICATORS[a.indicator].escalation}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Start the crew actions below now; do not wait for a reply if the comm delay is long.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-muted">How spaceflight affects it</h3>
          <p className="mt-1.5 text-sm leading-relaxed">{def.spaceEffects}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="NASA hazards involved">
            {def.hazards.map((h) => (
              <li key={h}>
                <a
                  href={HAZARDS[h].url}
                  target="_blank"
                  rel="noreferrer"
                  className={tagClass("sm", true)}
                >
                  {HAZARDS[h].name}
                  <ArrowUpRight size={11} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold text-muted">Indicators</h3>
            <span className="text-xs text-muted">
              {measured} of {rows.length} measured for {crewName}
            </span>
          </div>
          <ul className="mt-2 space-y-2.5">
            {rows.map((a) => {
              const ind = INDICATORS[a.indicator];
              const src = sources[a.indicator];
              const time = formatTime(a.takenAt);
              return (
                <li key={a.indicator} className={`rounded-lg border bg-surface-2/40 p-3.5 ${STATUS_RING[a.status]}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-medium">{ind.label}</span>
                      <BasisTag basis={ind.basis} source={ind.sources[0]?.label} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-semibold tabular ${a.value == null ? "text-muted" : STATUS_TEXT[a.status]}`}>
                        {formatValue(a)}
                        <span className="ml-1 text-xs font-normal text-muted">{a.value != null && ind.unit}</span>
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted">{a.finding}</p>

                  {a.actions.length > 0 && (
                    <div className="mt-2.5">
                      <p className="text-xs font-semibold text-fg">Do now</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm marker:text-muted">
                        {a.actions.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
                    <dt className="flex items-center gap-1 font-medium text-fg/80">
                      <Ruler size={12} aria-hidden /> Measured with
                    </dt>
                    <dd>{ind.measurement}</dd>
                    <dt className="font-medium text-fg/80">Nominal</dt>
                    <dd>{ind.ranges.nominal}</dd>
                    {(time || src) && (
                      <>
                        <dt className="font-medium text-fg/80">Latest</dt>
                        <dd>
                          {[time, src && SOURCE_LABEL[src]].filter(Boolean).join(" · ")}
                        </dd>
                      </>
                    )}
                  </dl>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {ind.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-accent/90 underline-offset-2 hover:text-accent hover:underline"
                      >
                        {s.label}
                        <ArrowUpRight size={11} aria-hidden />
                      </a>
                    ))}
                    <Link
                      href={`/guidance#ind-${a.indicator}`}
                      className="ml-auto inline-flex items-center gap-1 text-muted hover:text-fg"
                    >
                      <BookOpen size={12} aria-hidden /> Reference
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted">{DISCLAIMER_SHORT}</p>
      </div>
    </section>
  );
}
