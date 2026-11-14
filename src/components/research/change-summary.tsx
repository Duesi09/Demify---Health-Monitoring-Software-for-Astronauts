import type { ChangeRow } from "@/lib/sources/osdr";
import { ANALYTE_INFO, SUBJECT_STYLE, fmtPct, fmtValue, unitLabel } from "./analyte-info";

/**
 * "What changed after flight": % change at R+1 (one day after splashdown)
 * versus each person's own pre-flight mean (L-92/L-44/L-3). Server-safe.
 */
export function ChangeSummary({ rows, subjects }: { rows: ChangeRow[]; subjects: { id: string; sex: "M" | "F" }[] }) {
  if (!rows.length) return <p className="text-sm text-muted">No data.</p>;
  return (
    <div>
      {/* Phones: one compact block per marker instead of a wide table. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={`${r.panel}-${r.analyteId}`} className="rounded-lg border border-border p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {r.name} <span className="text-xs font-normal text-muted">{unitLabel(r.unit)}</span>
              </p>
              <p className="shrink-0 text-xs text-muted">
                mean <span className="font-medium text-fg tabular">{fmtPct(r.meanPct)}</span>
              </p>
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1 text-xs tabular">
              {r.cells.map((c) => (
                <div key={c.subject} className="rounded bg-surface-2 px-1.5 py-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: SUBJECT_STYLE[c.subject].color }} aria-hidden />
                    {c.subject}
                  </span>
                  <span className={c.notable ? "font-semibold text-fg" : "text-muted"}>{fmtPct(c.pct)}</span>
                  {c.range === "high" && <span className="block text-[10px] text-critical">▲ High</span>}
                  {c.range === "low" && <span className="block text-[10px] text-caution">▼ Low</span>}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <caption className="sr-only">Percent change one day after landing versus pre-flight mean, per crew member</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-normal">Marker</th>
              <th scope="col" className="py-2 pr-4 font-normal">System</th>
              {subjects.map((s) => (
                <th key={s.id} scope="col" className="py-2 pr-4 text-right font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: SUBJECT_STYLE[s.id].color }} aria-hidden />
                    {s.id}
                  </span>
                </th>
              ))}
              <th scope="col" className="py-2 text-right font-normal">Crew mean</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={`${r.panel}-${r.analyteId}`} className="border-t border-border">
                <th scope="row" className="py-2 pr-4 text-left font-medium">
                  {r.name}
                  <span className="ml-1 text-xs font-normal text-muted">{unitLabel(r.unit)}</span>
                </th>
                <td className="py-2 pr-4 text-xs text-muted">{ANALYTE_INFO[r.analyteId]?.system ?? "—"}</td>
                {r.cells.map((c) => {
                  const title = `${c.subject}: pre-flight mean ${fmtValue(c.baseline)} → R+1 ${fmtValue(c.postflight)} ${unitLabel(r.unit)}`;
                  return (
                    <td key={c.subject} className="py-2 pr-4 text-right" title={title}>
                      <span className={c.notable ? "font-semibold text-fg" : "text-muted"}>{fmtPct(c.pct)}</span>
                      {c.range === "high" && <span className="ml-1 text-xs text-critical">▲ High</span>}
                      {c.range === "low" && <span className="ml-1 text-xs text-caution">▼ Low</span>}
                      {c.notable && c.range !== "high" && c.range !== "low" && (
                        <span className="ml-1 text-xs text-accent" aria-label="notable change">●</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2 text-right font-medium">{fmtPct(r.meanPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        R+1 value versus each person&apos;s own pre-flight mean (L-92, L-44, L-3; suspect values excluded). ● notable change (≥ 15 % for
        clinical tests, ≥ 50 % for research immunoassays) · ▲/▼ R+1 value outside the lab reference range. Hover a cell for the raw values.
        Four people and one short flight: these are observations, not statistically tested effects.
      </p>
    </div>
  );
}
