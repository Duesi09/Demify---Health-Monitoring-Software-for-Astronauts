import type { ComponentType } from "react";
import { TimeSeriesChart, type Band, type RefLine, type SeriesDef } from "@/components/charts/time-series";
import { StatusBadge } from "@/components/ui";
import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, ReadingSource, Status } from "@/lib/types";
import { formatValue } from "./format";
import { SimulatedTag, SourceTag } from "./status-icon";

export interface VitalPart {
  id: IndicatorId;
  value: number | null;
  baseline?: number;
  /** Where this part's current value came from (overrides the tile-level source). */
  source?: ReadingSource;
}

export interface VitalTileProps {
  title: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  parts: VitalPart[];
  status: Status;
  source?: ReadingSource;
  chart: {
    data: Array<{ t: string } & Record<string, number | null | string>>;
    series: SeriesDef[];
    band?: Band;
    refLines?: RefLine[];
    /** "simulated" or "measured" — shown in the caption so trends are labelled honestly. */
    basis: "simulated" | "measured";
  };
}

function Delta({ part }: { part: VitalPart }) {
  if (part.value == null || part.baseline == null || part.baseline === 0) return null;
  const def = INDICATORS[part.id];
  const diff = part.value - part.baseline;
  const pct = (diff / part.baseline) * 100;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  return (
    <span className="tabular">
      {sign}
      {Math.abs(diff).toFixed(def.decimals)} ({sign}
      {Math.abs(pct).toFixed(0)} %)
    </span>
  );
}

/** One vital sign: current value, status, change vs pre-flight baseline and a 24 h trend. */
export function VitalTile({ title, icon: Icon, parts, status, source, chart }: VitalTileProps) {
  const unit = INDICATORS[parts[0].id].unit;
  const valueText = parts.map((p) => formatValue(p.id, p.value, false)).join(" / ");
  const hasBaseline = parts.some((p) => p.baseline != null && p.value != null);
  return (
    <section
      aria-labelledby={`vital-${parts[0].id}`}
      className="flex min-w-0 flex-col rounded-[22px] border border-border/70 bg-surface/80 p-5"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 id={`vital-${parts[0].id}`} className="flex items-center gap-2 text-[11px] font-medium text-muted">
          <Icon size={15} aria-hidden />
          {title}
        </h3>
        <StatusBadge status={status} />
      </header>
      <p className="mt-3 text-4xl font-light leading-none tracking-[-0.03em] tabular">
        {valueText}
        <span className="ml-1.5 text-sm font-normal tracking-normal text-muted">{unit}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        {hasBaseline && (
          <span>
            vs pre-flight{" "}
            {parts.map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                {parts.length > 1 && `${INDICATORS[p.id].short.split(" ")[0].toLowerCase()} `}
                <Delta part={p} />
              </span>
            ))}
          </span>
        )}
        {parts.some((p) => p.source) && new Set(parts.map((p) => p.source)).size > 1
          ? parts.map((p) =>
              p.source === "simulated" ? (
                <SimulatedTag key={p.id} label={`${INDICATORS[p.id].short.split(" ")[0].toLowerCase()}: simulated`} />
              ) : p.source ? (
                <SourceTag key={p.id} source={`${INDICATORS[p.id].short.split(" ")[0].toLowerCase()}: ${p.source === "manual" ? "crew entry" : p.source}`} />
              ) : null,
            )
          : source === "simulated"
            ? <SimulatedTag />
            : source
              ? <SourceTag source={source} />
              : null}
      </div>
      <div className="mt-3">
        <TimeSeriesChart
          ariaLabel={`${title}, last 24 hours${chart.basis === "simulated" ? " (simulated telemetry)" : ""}. Current ${valueText} ${unit}, status ${status}.`}
          data={chart.data}
          series={chart.series}
          band={chart.band}
          refLines={chart.refLines}
          unit={unit}
          decimals={INDICATORS[parts[0].id].decimals}
          height={120}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        24 h trend · {chart.basis === "simulated" ? "simulated telemetry" : "crew / sensor readings"}
        {chart.band && " · shaded = normal range"}
      </p>
    </section>
  );
}
