"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import type { I4Analyte, I4PanelData, RefRange } from "@/lib/sources/osdr";
import type { SourceResult } from "@/lib/types";
import { Provenance } from "@/components/ui";
import {
  ANALYTE_INFO,
  DEFAULT_ANALYTE,
  FEATURED,
  SUBJECT_STYLE,
  fmtTick,
  fmtValue,
  unitLabel,
  type PanelId,
} from "./analyte-info";

type Meta = Omit<SourceResult<unknown>, "data">;

export interface ExplorerProps {
  panels: { data: I4PanelData; meta: Meta }[];
  timepoints: { timepoint: string; day: number }[];
  subjects: { id: string; sex: "M" | "F" }[];
  flight: { launch: string; splashdown: string; durationDays: number };
}

type XMode = "draws" | "days";
type Row = { tp: string; day: number } & Record<string, number | string | null>;

function cellRange(a: I4Analyte, s: number, t: number): RefRange | null {
  return a.refs?.[s]?.[t] ?? a.ref;
}
function position(v: number | null, r: RefRange | null): "low" | "high" | null {
  if (v == null || !r) return null;
  if (r[0] != null && v < r[0]) return "low";
  if (r[1] != null && v > r[1]) return "high";
  return null;
}

const PANEL_TABS: { id: PanelId; label: string }[] = [
  { id: "CMP", label: "Metabolic" },
  { id: "CBC", label: "Blood count" },
  { id: "CARDIO", label: "Inflammation" },
  { id: "CYTOKINE", label: "Cytokines" },
];

export function BiomarkerExplorer({ panels, timepoints, subjects, flight }: ExplorerProps) {
  const available = PANEL_TABS.filter((t) => panels.some((p) => p.data.panel === t.id));
  const [panelId, setPanelId] = useState<PanelId>(available[0]?.id ?? "CMP");
  const [analyteByPanel, setAnalyteByPanel] = useState<Record<string, string>>({});
  const [view, setView] = useState<"chart" | "table">("chart");
  const [xMode, setXMode] = useState<XMode>("draws");

  const panel = panels.find((p) => p.data.panel === panelId) ?? panels[0];
  const analytes = panel?.data.analytes ?? [];
  const featured = FEATURED[panelId].filter((id) => analytes.some((a) => a.id === id));
  const others = analytes
    .filter((a) => !featured.includes(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const analyteId = analyteByPanel[panelId] ?? DEFAULT_ANALYTE[panelId];
  const analyte = analytes.find((a) => a.id === analyteId) ?? analytes[0];

  if (!panel || !analyte) {
    return <p className="text-sm text-muted">No Inspiration4 data available.</p>;
  }
  const info = ANALYTE_INFO[analyte.id];
  const unit = unitLabel(analyte.unit);
  const clinical = panel.data.kind === "clinical";
  const mixedRanges = !!analyte.refs;
  const outOfRange = analyte.values.flatMap((row, s) =>
    row.flatMap((v, t) => {
      const pos = position(v, cellRange(analyte, s, t));
      return pos ? [{ s, t, v, pos }] : [];
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Blood panel" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {available.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === panelId}
              onClick={() => setPanelId(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                t.id === panelId ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted sm:max-w-xs">
          Analyte
          <select
            value={analyte.id}
            onChange={(e) => setAnalyteByPanel((m) => ({ ...m, [panelId]: e.target.value }))}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-fg"
          >
            <optgroup label="Key spaceflight markers">
              {featured.map((id) => {
                const a = analytes.find((x) => x.id === id)!;
                return (
                  <option key={id} value={id}>
                    {a.name}
                  </option>
                );
              })}
            </optgroup>
            {others.length > 0 && (
              <optgroup label="All other analytes">
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Segmented
            label="X axis"
            value={xMode}
            onChange={(v) => setXMode(v as XMode)}
            options={[
              { value: "draws", label: "Blood draws" },
              { value: "days", label: "Days to scale" },
            ]}
            disabled={view === "table"}
          />
          <Segmented
            label="View"
            value={view}
            onChange={(v) => setView(v as "chart" | "table")}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-semibold">
              {analyte.name}
              {unit && <span className="ml-1.5 font-normal text-muted">{unit}</span>}
            </h3>
            <p className="text-[11px] text-muted">
              {clinical
                ? analyte.ref
                  ? `Shaded: lab reference range ${fmtRange(analyte.ref)}${mixedRanges ? " (most draws; sex-specific ranges in table)" : ""}`
                  : "No reference range reported"
                : "Research assay: no clinical reference range"}
            </p>
          </div>
          {view === "chart" ? (
            <AnalyteChart
              analyte={analyte}
              timepoints={timepoints}
              subjects={subjects}
              xMode={xMode}
              flightDays={flight.durationDays}
              unit={unit}
            />
          ) : (
            <AnalyteTable analyte={analyte} timepoints={timepoints} subjects={subjects} unit={unit} />
          )}
          {view === "chart" && <Legend subjects={subjects} showRangeKey={clinical && outOfRange.length > 0} showFlagKey={!!analyte.flags?.some((f) => f.kind === "suspect")} />}
        </div>

        <aside className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">
              Why it matters in space{info ? ` · ${info.system}` : ""}
            </p>
            <p className="mt-1.5 leading-relaxed">{info?.why ?? panel.data.description}</p>
          </div>
          {clinical && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted">Outside lab range</p>
              {outOfRange.length === 0 ? (
                <p className="mt-1.5 text-muted">All draws within the reported reference range.</p>
              ) : (
                <ul className="mt-1.5 space-y-1 tabular">
                  {outOfRange.map((o) => (
                    <li key={`${o.s}-${o.t}`} className="flex items-center justify-between gap-2">
                      <span>
                        {subjects[o.s].id} · {timepoints[o.t].timepoint}
                      </span>
                      <span className={o.pos === "high" ? "text-critical" : "text-caution"}>
                        {o.pos === "high" ? "▲ High" : "▼ Low"} {fmtValue(o.v)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {analyte.flags && analyte.flags.length > 0 && (
            <div className="rounded-lg border border-caution/40 p-3">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-caution">
                <AlertTriangle size={12} aria-hidden /> Data-quality notes
              </p>
              <ul className="mt-1.5 space-y-1.5 text-xs">
                {dedupeFlags(analyte.flags).map((f) => (
                  <li key={f.key}>
                    <span className="font-medium">{f.where}:</span> <span className="text-muted">{f.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-1 text-xs text-muted">
            <p>
              Dataset:{" "}
              <a href={panel.data.study.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                {panel.data.study.accession} <ExternalLink size={11} aria-hidden />
              </a>{" "}
              · {panel.data.label}
            </p>
            <p className="break-all font-mono text-[10px]">{panel.data.study.file}</p>
            <Provenance result={panel.meta} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function dedupeFlags(flags: NonNullable<I4Analyte["flags"]>) {
  // Collapse identical notes for the same person (e.g. three pre-flight range notes).
  const groups = new Map<string, { subject: string; tps: string[]; note: string }>();
  for (const f of flags) {
    const k = `${f.subject}|${f.kind}|${f.note}`;
    const g = groups.get(k) ?? { subject: f.subject, tps: [], note: f.note };
    g.tps.push(f.timepoint);
    groups.set(k, g);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, where: `${g.subject} ${g.tps.join(", ")}`, note: g.note }));
}

function fmtRange(r: RefRange) {
  if (r[0] != null && r[1] != null) return `${fmtValue(r[0])}–${fmtValue(r[1])}`;
  if (r[0] != null) return `≥ ${fmtValue(r[0])}`;
  if (r[1] != null) return `≤ ${fmtValue(r[1])}`;
  return "—";
}

function Segmented({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-lg border border-border bg-surface-2 p-1 ${disabled ? "opacity-50" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            o.value === value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ subjects, showRangeKey, showFlagKey }: { subjects: ExplorerProps["subjects"]; showRangeKey: boolean; showFlagKey: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      {subjects.map((s) => {
        const st = SUBJECT_STYLE[s.id];
        return (
          <li key={s.id} className="flex items-center gap-1.5">
            <svg width="20" height="8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke={st.color} strokeWidth="2" strokeDasharray={st.dashed ? "4 3" : undefined} />
            </svg>
            {s.id} ({s.sex === "F" ? "female" : "male"})
          </li>
        );
      })}
      {showRangeKey && (
        <li className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--critical)" strokeWidth="1.5" />
          </svg>
          Outside lab range
        </li>
      )}
      {showFlagKey && (
        <li className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--caution)" strokeWidth="1.5" />
          </svg>
          Suspect value (see note)
        </li>
      )}
    </ul>
  );
}

// ------------------------------------------------------------------ chart

function buildRows(a: I4Analyte, timepoints: ExplorerProps["timepoints"], subjects: ExplorerProps["subjects"]): Row[] {
  return timepoints.map((tp, t) => {
    const row: Row = { tp: tp.timepoint, day: tp.day };
    subjects.forEach((s, si) => {
      row[s.id] = a.values[si]?.[t] ?? null;
    });
    return row;
  });
}

function AnalyteChart({
  analyte,
  timepoints,
  subjects,
  xMode,
  flightDays,
  unit,
}: {
  analyte: I4Analyte;
  timepoints: ExplorerProps["timepoints"];
  subjects: ExplorerProps["subjects"];
  xMode: XMode;
  flightDays: number;
  unit: string;
}) {
  const data = useMemo(() => buildRows(analyte, timepoints, subjects), [analyte, timepoints, subjects]);
  const suspect = new Set((analyte.flags ?? []).filter((f) => f.kind === "suspect").map((f) => `${f.subject}|${f.timepoint}`));
  const xKey = xMode === "draws" ? "tp" : "day";
  const ref = analyte.ref;

  return (
    <div
      role="img"
      aria-label={`${analyte.name} for the four Inspiration4 crew members across seven blood draws, before and after the three-day flight`}
      className="h-[300px] w-full text-[11px] sm:h-[320px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 22, right: 44, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          {xMode === "draws" ? (
            <XAxis dataKey="tp" type="category" stroke="var(--muted)" tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} padding={{ left: 12, right: 12 }} />
          ) : (
            <XAxis
              dataKey="day"
              type="number"
              domain={[-100, 200]}
              ticks={[-90, -60, -30, 0, 30, 60, 90, 120, 150, 180]}
              tickFormatter={(v: number) => (v === 0 ? "Launch" : v > 0 ? `+${v}` : String(v))}
              stroke="var(--muted)"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
          )}
          <YAxis
            stroke="var(--muted)"
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmtTick(v)}
          />
          {ref && (
            <ReferenceArea
              y1={ref[0] ?? undefined}
              y2={ref[1] ?? undefined}
              fill="var(--nominal)"
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          <FlightMarker xMode={xMode} flightDays={flightDays} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, label, payload }) =>
              active && payload?.length ? (
                <ChartTooltip analyte={analyte} subjects={subjects} timepoints={timepoints} label={label} xMode={xMode} unit={unit} />
              ) : null
            }
          />
          {subjects.map((s, si) => {
            const st = SUBJECT_STYLE[s.id];
            return (
              <Line
                key={s.id}
                type="linear"
                dataKey={s.id}
                name={s.id}
                stroke={st.color}
                strokeWidth={2}
                strokeDasharray={st.dashed ? "6 4" : undefined}
                connectNulls
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
                  const t = p.index ?? 0;
                  const v = typeof p.value === "number" ? p.value : null;
                  if (p.cx == null || p.cy == null || v == null) return <g key={`${s.id}-${t}`} />;
                  const pos = position(v, cellRange(analyte, si, t));
                  const bad = suspect.has(`${s.id}|${timepoints[t]?.timepoint}`);
                  return (
                    <g key={`${s.id}-${t}`}>
                      <circle cx={p.cx} cy={p.cy} r={3.5} fill={st.color} stroke="var(--surface)" strokeWidth={1.5} />
                      {pos && <circle cx={p.cx} cy={p.cy} r={7} fill="none" stroke="var(--critical)" strokeWidth={1.5} />}
                      {bad && <rect x={p.cx - 7} y={p.cy - 7} width={14} height={14} fill="none" stroke="var(--caution)" strokeWidth={1.5} />}
                    </g>
                  );
                }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              />
            );
          })}
          <DirectLabels data={data} xKey={xKey} subjects={subjects} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical band marking the 3-day flight, labelled. */
function FlightMarker({ xMode, flightDays }: { xMode: XMode; flightDays: number }) {
  const x = useXAxisScale();
  const area = usePlotArea();
  if (!x || !area) return null;
  let x0: number | undefined;
  let x1: number | undefined;
  if (xMode === "draws") {
    const a = x("L-3");
    const b = x("R+1");
    if (a == null || b == null) return null;
    const mid = (a + b) / 2;
    x0 = mid - 3;
    x1 = mid + 3;
  } else {
    x0 = x(0);
    x1 = x(flightDays);
    if (x0 == null || x1 == null) return null;
    if (x1 - x0 < 4) {
      const mid = (x0 + x1) / 2;
      x0 = mid - 2;
      x1 = mid + 2;
    }
  }
  const mid = (x0 + x1) / 2;
  return (
    <g aria-hidden pointerEvents="none">
      <rect x={x0} y={area.y} width={x1 - x0} height={area.height} fill="var(--accent)" fillOpacity={0.22} />
      <text x={mid} y={area.y - 8} textAnchor="middle" fill="var(--accent)" fontSize={10} fontWeight={600}>
        Flight · {flightDays} d
      </text>
    </g>
  );
}

/** Subject id at the end of each line, nudged apart so labels never overlap. */
function DirectLabels({ data, xKey, subjects }: { data: Row[]; xKey: "tp" | "day"; subjects: ExplorerProps["subjects"] }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  const items = subjects
    .map((s) => {
      const last = [...data].reverse().find((r) => typeof r[s.id] === "number");
      if (!last) return null;
      const px = x(last[xKey]);
      const py = y(last[s.id] as number);
      return px == null || py == null ? null : { id: s.id, px, py, ly: py };
    })
    .filter((v): v is { id: string; px: number; py: number; ly: number } => v != null)
    .sort((a, b) => a.py - b.py);
  const GAP = 12;
  for (let i = 1; i < items.length; i++) {
    if (items[i].ly - items[i - 1].ly < GAP) items[i].ly = items[i - 1].ly + GAP;
  }
  return (
    <g aria-hidden pointerEvents="none">
      {items.map((it) => (
        <text key={it.id} x={it.px + 9} y={it.ly + 3.5} fontSize={10.5} fill="var(--fg)">
          {it.id}
        </text>
      ))}
    </g>
  );
}

function ChartTooltip({
  analyte,
  subjects,
  timepoints,
  label,
  xMode,
  unit,
}: {
  analyte: I4Analyte;
  subjects: ExplorerProps["subjects"];
  timepoints: ExplorerProps["timepoints"];
  label: unknown;
  xMode: XMode;
  unit: string;
}) {
  const t = timepoints.findIndex((tp) => (xMode === "draws" ? tp.timepoint === label : tp.day === label));
  if (t < 0) return null;
  const tp = timepoints[t];
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">
        {tp.timepoint}{" "}
        <span className="font-normal text-muted">
          · {tp.day < 0 ? `${-tp.day} d before launch` : `${tp.day - 3} d after splashdown`}
        </span>
      </p>
      <ul className="mt-1 space-y-0.5 tabular">
        {subjects.map((s, si) => {
          const v = analyte.values[si]?.[t] ?? null;
          const pos = position(v, cellRange(analyte, si, t));
          return (
            <li key={s.id} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: SUBJECT_STYLE[s.id].color }} aria-hidden />
                {s.id}
              </span>
              <span>
                {fmtValue(v)} {v != null ? unit : ""}
                {pos && <span className={`ml-1.5 ${pos === "high" ? "text-critical" : "text-caution"}`}>{pos === "high" ? "▲ High" : "▼ Low"}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ table

function AnalyteTable({
  analyte,
  timepoints,
  subjects,
  unit,
}: {
  analyte: I4Analyte;
  timepoints: ExplorerProps["timepoints"];
  subjects: ExplorerProps["subjects"];
  unit: string;
}) {
  const notes = new Map((analyte.flags ?? []).map((f) => [`${f.subject}|${f.timepoint}`, f]));
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">
          {analyte.name} ({unit}) per crew member and blood draw
        </caption>
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-normal">Crew</th>
            {timepoints.map((tp) => (
              <th key={tp.timepoint} scope="col" className={`px-3 py-2 text-right font-normal ${tp.timepoint === "R+1" ? "border-l border-accent/50" : ""}`}>
                {tp.timepoint}
              </th>
            ))}
            {analyte.ref && <th scope="col" className="px-3 py-2 text-right font-normal">Lab range</th>}
          </tr>
        </thead>
        <tbody className="tabular">
          {subjects.map((s, si) => {
            const ranges = new Set(timepoints.map((_, t) => JSON.stringify(cellRange(analyte, si, t))));
            return (
              <tr key={s.id} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SUBJECT_STYLE[s.id].color }} aria-hidden />
                    {s.id} <span className="text-xs font-normal text-muted">{s.sex}</span>
                  </span>
                </th>
                {timepoints.map((tp, t) => {
                  const v = analyte.values[si]?.[t] ?? null;
                  const pos = position(v, cellRange(analyte, si, t));
                  const note = notes.get(`${s.id}|${tp.timepoint}`);
                  return (
                    <td
                      key={tp.timepoint}
                      title={note?.note}
                      className={`px-3 py-2 text-right ${tp.timepoint === "R+1" ? "border-l border-accent/50" : ""} ${
                        pos === "high" ? "font-semibold text-critical" : pos === "low" ? "font-semibold text-caution" : ""
                      }`}
                    >
                      {pos === "high" && <span aria-label="high">▲ </span>}
                      {pos === "low" && <span aria-label="low">▼ </span>}
                      {fmtValue(v)}
                      {note?.kind === "suspect" && <span className="ml-0.5 text-caution" aria-label="suspect value">*</span>}
                      {note?.kind === "range" && <span className="ml-0.5 text-muted" aria-label="range note">†</span>}
                    </td>
                  );
                })}
                {analyte.ref && (
                  <td className="px-3 py-2 text-right text-xs text-muted">
                    {ranges.size === 1 ? fmtRange(cellRange(analyte, si, 0) ?? analyte.ref) : "varies†"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Unit: {unit || "ratio"} · ▲/▼ outside the lab reference range · * suspect value · † range note (hover a cell) · vertical rule = flight
      </p>
    </div>
  );
}
