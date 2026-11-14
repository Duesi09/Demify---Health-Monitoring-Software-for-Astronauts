"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Segmented } from "@/components/ui";
import type { CrewTrendsData, TrendChart, TrendCrew } from "./trends-data";

/**
 * "Crew trends" small multiples for the overview: one chart per indicator,
 * every crew member as a line, the same colour for the same person in every
 * chart (validated --series-N tokens in crew order). The legend is drawn once
 * above the grid; a Charts/Tables switch gives every chart a table view.
 */

type View = "charts" | "tables";

function crewColor(i: number): string {
  return `var(--series-${(i % 4) + 1})`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC labels, so server and client render the same text. */
/** "Mission Specialist 1" -> "MS1", "Commander" -> "Cmdr", "Pilot" -> "Pilot". */
function shortName(name: string): string {
  const words = name.split(/\s+/);
  if (words.length > 1) return words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join("");
  return name.length > 6 ? `${name.slice(0, 4)}.` : name;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtT(iso: string, window: TrendChart["window"], long = false): string {
  const d = new Date(iso);
  // "Nov 8": unambiguous for an international audience (08.11 reads as 11 August in the US).
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (window === "7d") return day;
  const hm = `${pad2(d.getUTCHours())}:00`;
  return long ? `${day} ${hm}` : hm;
}

function fmtV(v: number | null | undefined, c: TrendChart): string {
  return v == null ? "—" : v.toFixed(c.decimals);
}

function unitText(c: TrendChart): string {
  return c.unit === "%" || c.unit.startsWith("/") ? c.unit : ` ${c.unit}`;
}

function latest(c: TrendChart, crewId: string): number | null {
  for (let i = c.rows.length - 1; i >= 0; i--) {
    const v = c.rows[i].v[crewId];
    if (v != null) return v;
  }
  return null;
}

function bandText(c: TrendChart): string {
  if (!c.band) return c.nominalText;
  return `${fmtV(c.band.from, c)}–${fmtV(c.band.to, c)}${unitText(c)}`;
}

function ariaSummary(c: TrendChart, crew: TrendCrew[]): string {
  const last = crew.map((m) => `${m.name} ${fmtV(latest(c, m.id), c)}${unitText(c)}`).join(", ");
  return `${c.title}, ${c.method.toLowerCase()}. Latest: ${last}. Nominal range ${bandText(c)}.`;
}

function Legend({ crew }: { crew: TrendCrew[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Crew colours">
      {crew.map((m, i) => (
        <li key={m.id} className="flex items-center gap-2">
          <svg width="18" height="6" aria-hidden className="shrink-0">
            <line
              x1="1"
              y1="3"
              x2="17"
              y2="3"
              stroke={crewColor(i)}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={i >= 4 ? "4 3" : undefined}
            />
          </svg>
          {m.name}
        </li>
      ))}
      <li className="flex items-center gap-2 text-muted">
        <span aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px] bg-nominal/15 ring-1 ring-inset ring-nominal/30" />
        Nominal range
      </li>
    </ul>
  );
}

function TrendPlot({ chart, crew }: { chart: TrendChart; crew: TrendCrew[] }) {
  const data = chart.rows.map((r) => ({ t: r.t, ...r.v }));
  const names = new Map(crew.map((m) => [m.id, m.name]));
  const order = new Map(crew.map((m, i) => [m.id, i]));
  return (
    <div role="img" aria-label={ariaSummary(chart, crew)} className="h-[180px] w-full text-[11px]">
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer off: the role=img wrapper carries the text alternative; the table view has the values. */}
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: string) => fmtT(v, chart.window)}
            stroke="var(--muted)"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={chart.window === "24h" ? 28 : 8}
          />
          <YAxis
            domain={chart.yDomain}
            allowDataOverflow
            stroke="var(--muted)"
            tickLine={false}
            axisLine={false}
            width={36}
            ticks={chart.yTicks}
            interval={0}
            tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(chart.decimals))}
          />
          {chart.band && (
            <ReferenceArea
              y1={chart.band.from}
              y2={chart.band.to}
              fill="var(--nominal)"
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="hidden"
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--fg)",
              fontSize: 12,
            }}
            itemSorter={(item) => order.get(String(item.dataKey)) ?? 0}
            labelFormatter={(v) => `${fmtT(String(v), chart.window, true)} UTC`}
            formatter={(value, name) => [
              typeof value === "number" ? `${value.toFixed(chart.decimals)}${unitText(chart)}` : String(value),
              names.get(String(name)) ?? String(name),
            ]}
          />
          {crew.map((m, i) => (
            <Line
              key={m.id}
              type="linear"
              dataKey={m.id}
              name={m.id}
              stroke={crewColor(i)}
              strokeWidth={2}
              strokeDasharray={i >= 4 ? "5 4" : undefined}
              dot={chart.window === "7d" ? { r: 2.5, fill: crewColor(i), strokeWidth: 0 } : false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendTable({ chart, crew }: { chart: TrendChart; crew: TrendCrew[] }) {
  const anyReal = chart.rows.some((r) => r.real?.length);
  // Newest first: the question is usually "what is it now".
  const rows = [...chart.rows].reverse();
  const newestDay = rows[0]?.t.slice(0, 10);
  const rowLabel = (t: string) =>
    chart.window === "24h" && t.slice(0, 10) === newestDay ? fmtT(t, chart.window) : fmtT(t, chart.window, true);
  return (
    <div
      className="max-h-[220px] overflow-auto rounded-[3px] border border-border"
      role="region"
      tabIndex={0}
      aria-label={`${chart.title} table, scrollable`}
    >
      <table className="w-full table-fixed border-collapse text-xs tabular">
        <caption className="sr-only">
          {chart.title}, {chart.method.toLowerCase()}, in {chart.unit}. Times in UTC.
        </caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-muted">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-medium">
              {chart.window === "24h" ? "Hour (UTC)" : "Day (UTC)"}
            </th>
            {crew.map((m) => (
              <th key={m.id} scope="col" className="px-1.5 py-1.5 text-right font-medium" title={m.name}>
                {/* Short header so all four crew columns fit the card; full name for screen readers. */}
                <span aria-hidden>{shortName(m.name)}</span>
                <span className="sr-only">{m.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t} className="border-t border-border/60">
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal text-muted">
                {rowLabel(r.t)}
              </th>
              {crew.map((m) => (
                <td key={m.id} className="px-2 py-1 text-right">
                  {fmtV(r.v[m.id], chart)}
                  {r.real?.includes(m.id) && (
                    <span title="Entered by crew or device" aria-label="entered by crew or device">
                      *
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {anyReal && <p className="border-t border-border px-2 py-1 text-[11px] text-muted">* Entered by crew or device</p>}
    </div>
  );
}

function TrendCard({ chart, crew, view }: { chart: TrendChart; crew: TrendCrew[]; view: View }) {
  const headingId = `trend-${chart.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`flex min-w-0 flex-col rounded-[24px] border border-border/70 bg-surface p-5 ${
        // 1440 px: the three 24 h vitals share one row, the two daily check-ins the next.
        chart.window === "24h" ? "xl:col-span-2" : "xl:col-span-3"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-base font-semibold tracking-tight">
          {chart.title}
        </h3>
        <span className="shrink-0 text-xs text-muted">{chart.unit}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{chart.method}</p>
      <div className="mt-4">{view === "charts" ? <TrendPlot chart={chart} crew={crew} /> : <TrendTable chart={chart} crew={crew} />}</div>
      <p className="mt-3 text-xs text-muted">Nominal {bandText(chart)}</p>
    </section>
  );
}

export function CrewTrends({ data }: { data: CrewTrendsData }) {
  const [view, setView] = useState<View>("charts");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Legend crew={data.crew} />
        <Segmented<View>
          label="Show crew trends as"
          value={view}
          onChange={setView}
          options={[
            { value: "charts", label: "Charts" },
            { value: "tables", label: "Tables" },
          ]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {data.charts.map((c) => (
          <TrendCard key={c.id} chart={c} crew={data.crew} view={view} />
        ))}
      </div>
    </div>
  );
}
