import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { RECORD_GROUPS, type RecordRow } from "./record-data";
import { Sparkline } from "./sparkline";

function fmt(v: number | null, decimals: number): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(decimals);
}

function SourceText({ row }: { row: RecordRow }) {
  if (!row.sourceLabel) return <span className="text-muted">—</span>;
  const real = row.source !== "simulated";
  return (
    <span
      className={`inline-flex items-center rounded-[3px] px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.07em] ${
        real ? "border border-accent/50 text-accent" : "border border-dashed border-muted/50 text-muted"
      }`}
    >
      {row.sourceLabel}
    </span>
  );
}

function Trend({ row }: { row: RecordRow }) {
  if (!row.spark) return <span className="text-xs text-muted">no trend</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Sparkline id={row.id} spark={row.spark} status={row.status} label={`${row.short} trend`} />
      <span className="text-[10px] text-muted">
        {row.spark.window}
        {row.spark.basis === "simulated" ? " · sim." : ""}
      </span>
    </span>
  );
}

/**
 * Complete health record for one crew member: every indicator grouped by
 * body system. A table from 640 px up, stacked cards below.
 */
export function HealthRecord({ rows }: { rows: RecordRow[] }) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = RECORD_GROUPS.map((g) => ({ ...g, rows: g.ids.map((id) => byId.get(id)).filter((r) => r != null) }));

  return (
    <>
      {/* ≥ 640 px: table (scrolls inside its own box if ever too narrow) */}
      <div
        role="region"
        aria-label="Health record table"
        tabIndex={0}
        className="hidden overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-accent sm:block"
      >
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <caption className="sr-only">
            All health indicators with current value, status, normal range, pre-flight baseline, change, trend, time of
            last measurement and data source
          </caption>
          <thead className="bg-surface-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Indicator</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Current</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Normal range</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Pre-flight</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Change</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Trend</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Last measured</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Source</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id} className="border-t border-border">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={9}
                  className="bg-surface px-3 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-fg"
                >
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 align-middle hover:bg-surface-2/50">
                  <th scope="row" className="px-3 py-2.5 font-normal">
                    <Link href={`/guidance#ind-${r.id}`} className="font-medium text-fg hover:text-accent hover:underline">
                      {r.short}
                    </Link>
                    <span className="block text-[11px] text-muted">{r.label}</span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">
                    <span className="text-base font-semibold">{fmt(r.value, r.decimals)}</span>{" "}
                    <span className="text-xs text-muted">{r.unit}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} size="xs" />
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5 text-xs text-muted">{r.normal}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular text-muted">
                    {r.baseline == null ? "—" : `${fmt(r.baseline, r.decimals)} ${r.unit}`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular">{r.change ?? <span className="text-muted">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <Trend row={r} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular">
                    {r.takenUtc ? (
                      <>
                        <span className="block">{r.takenRel}</span>
                        <span className="text-muted">{r.takenUtc}</span>
                      </>
                    ) : (
                      <span className="text-muted">never</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <SourceText row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* < 640 px: stacked cards */}
      <div className="space-y-6 sm:hidden">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`rec-${g.id}`}>
            <h3 id={`rec-${g.id}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
              {g.title}
            </h3>
            <ul className="space-y-2">
              {g.rows.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/guidance#ind-${r.id}`} className="min-w-0 font-medium hover:text-accent hover:underline">
                      {r.short}
                    </Link>
                    <StatusBadge status={r.status} size="xs" />
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <p className="tabular">
                      <span className="text-2xl font-semibold">{fmt(r.value, r.decimals)}</span>{" "}
                      <span className="text-xs text-muted">{r.unit}</span>
                    </p>
                    <Trend row={r} />
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">Normal</dt>
                    <dd>{r.normal}</dd>
                    <dt className="text-muted">Pre-flight</dt>
                    <dd className="tabular">
                      {r.baseline == null ? "—" : `${fmt(r.baseline, r.decimals)} ${r.unit}`}
                      {r.change && <span className="text-muted"> · change {r.change}</span>}
                    </dd>
                    <dt className="text-muted">Measured</dt>
                    <dd className="tabular">{r.takenUtc ? `${r.takenRel} · ${r.takenUtc}` : "never"}</dd>
                    <dt className="text-muted">Source</dt>
                    <dd>
                      <SourceText row={r} />
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
