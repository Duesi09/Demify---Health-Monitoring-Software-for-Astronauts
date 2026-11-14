"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Shared time-series chart. One y-axis only (never dual-axis); series colours
 * come from the validated --series-N tokens; status colours are reserved for
 * threshold lines. Hover shows a crosshair + tooltip.
 */

export interface SeriesDef {
  key: string;
  label: string;
  /** CSS colour, use "var(--series-1)" etc. */
  color: string;
  dashed?: boolean;
}

type DomainBound = number | "auto";

export interface Band {
  from: number;
  to: number;
  label?: string;
}

export interface RefLine {
  y: number;
  label: string;
  tone?: "caution" | "critical" | "muted";
}

export interface TimeSeriesChartProps {
  data: Array<{ t: string } & Record<string, number | string | null>>;
  series: SeriesDef[];
  unit?: string;
  height?: number;
  log?: boolean;
  yDomain?: [DomainBound, DomainBound];
  /**
   * Values that must stay visible on the y-axis (e.g. a threshold the data is
   * far below). Serializable, so server components can pass it.
   */
  includeY?: number[];
  /** Shaded "normal" band, drawn in neutral tint. */
  band?: Band;
  refLines?: RefLine[];
  /** Format for x-axis ticks; default HH:MM UTC. */
  xFormat?: "time" | "date" | "datetime";
  decimals?: number;
  /** Draw a dot on every point (use for sparse, e.g. manually entered, data). */
  showDots?: boolean;
  ariaLabel: string;
}

const TONE: Record<NonNullable<RefLine["tone"]>, string> = {
  caution: "var(--caution)",
  critical: "var(--critical)",
  muted: "var(--muted)",
};

function fmtX(iso: string, mode: TimeSeriesChartProps["xFormat"]) {
  const d = new Date(iso);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const md = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (mode === "date") return md;
  if (mode === "datetime") return `${md} ${hm}`;
  return hm;
}

function fmtVal(v: number, decimals: number | undefined) {
  if (Math.abs(v) > 0 && (Math.abs(v) < 0.01 || Math.abs(v) >= 1e5)) return v.toExponential(1);
  return v.toFixed(decimals ?? (Math.abs(v) < 10 ? 2 : 0));
}

export function TimeSeriesChart({
  data,
  series,
  unit = "",
  height = 220,
  log = false,
  yDomain = ["auto", "auto"],
  band,
  refLines = [],
  xFormat = "time",
  decimals,
  showDots = false,
  includeY = [],
  ariaLabel,
}: TimeSeriesChartProps) {
  const domain: [number | "auto" | ((v: number) => number), number | "auto" | ((v: number) => number)] = includeY.length
    ? [
        yDomain[0] === "auto" ? (min: number) => Math.min(min, ...includeY) : yDomain[0],
        yDomain[1] === "auto" ? (max: number) => Math.max(max, ...includeY) * (log ? 2 : 1.05) : yDomain[1],
      ]
    : yDomain;
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        No data in this time range
      </div>
    );
  }
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="flex w-full flex-col text-[11px]">
      <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer off: the role=img wrapper is the text alternative; recharts' layer adds an unnamed role=application tab stop. */}
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: string) => fmtX(v, xFormat)}
            stroke="var(--muted)"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={40}
          />
          <YAxis
            scale={log ? "log" : "auto"}
            domain={domain}
            allowDataOverflow={log}
            stroke="var(--muted)"
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => fmtVal(v, decimals)}
          />
          {band && (
            <ReferenceArea
              y1={band.from}
              y2={band.to}
              fill="var(--nominal)"
              fillOpacity={0.07}
              stroke="none"
              ifOverflow="hidden"
            />
          )}
          {refLines.map((r) => (
            <ReferenceLine
              key={`${r.label}-${r.y}`}
              y={r.y}
              stroke={TONE[r.tone ?? "muted"]}
              strokeDasharray="4 4"
              ifOverflow="hidden"
              label={{ value: r.label, position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--fg)",
              fontSize: 12,
            }}
            labelFormatter={(v) => `${fmtX(String(v), "datetime")} UTC`}
            formatter={(value, name) => [
              typeof value === "number" ? `${fmtVal(value, decimals)} ${unit}` : String(value),
              series.find((s) => s.key === name)?.label ?? String(name),
            ]}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.key}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={showDots || data.length < 3 ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </div>
      {series.length > 1 && (
        <ul className="mt-2 flex shrink-0 flex-wrap gap-4 text-xs text-muted" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
