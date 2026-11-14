"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DoseBar {
  name: string;
  title: string;
  start: string;
  days: number;
  gcr: number;
  saa: number;
  total: number;
}

/**
 * Stacked bars of mean daily absorbed dose per ISS mission, split into
 * galactic cosmic rays (GCR) and South Atlantic Anomaly (SAA) protons.
 */
export function IssDoseChart({ bars, mean }: { bars: DoseBar[]; mean: number }) {
  const data = bars.map((b) => ({ ...b, label: `${b.name} '${b.start.slice(2, 4)}` }));
  return (
    <div>
      <div
        role="img"
        aria-label={`Mean ISS absorbed dose rate per mission, ${bars.length} missions from ${bars[0]?.start.slice(0, 4)} to ${bars.at(-1)?.start.slice(0, 4)}, split into cosmic-ray and South Atlantic Anomaly components`}
        className="h-[220px] w-full text-[11px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted)" tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} angle={-35} textAnchor="end" height={44} />
            <YAxis stroke="var(--muted)" tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => v.toFixed(2)} />
            <ReferenceLine
              y={mean}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{ value: `mean ${mean.toFixed(2)}`, position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)", fillOpacity: 0.6 }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                if (!d) return null;
                return (
                  <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-muted">
                      {d.start} · {d.days} days
                    </p>
                    <ul className="mt-1 space-y-0.5 tabular">
                      <li>Total {d.total.toFixed(3)} mGy/day</li>
                      <li className="text-muted">GCR {d.gcr.toFixed(3)} · SAA {d.saa.toFixed(3)}</li>
                    </ul>
                  </div>
                );
              }}
            />
            <Bar dataKey="gcr" name="Galactic cosmic rays" stackId="d" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
            <Bar dataKey="saa" name="South Atlantic Anomaly" stackId="d" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-1)" }} aria-hidden />
          Galactic cosmic rays (GCR)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-2)" }} aria-hidden />
          South Atlantic Anomaly protons (SAA)
        </li>
      </ul>
    </div>
  );
}
