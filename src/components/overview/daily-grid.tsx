import { STATUS_LABEL, STATUS_TEXT } from "@/components/ui";
import { INDICATORS, classify } from "@/lib/health/knowledge";
import type { IndicatorId, ReadingSource, Status } from "@/lib/types";
import { formatValue } from "./format";
import { StatusIcon } from "./status-icon";

export interface DailyCell {
  value: number;
  source: ReadingSource;
}

export interface DailyRow {
  id: IndicatorId;
  /** One entry per day, oldest first; null = nothing logged that day. */
  cells: (DailyCell | null)[];
}

const CELL_TONE: Record<Status, string> = {
  nominal: "border-border",
  caution: "border-caution/60 bg-caution/10",
  critical: "border-critical/60 bg-critical/10",
  unknown: "border-border",
};

/**
 * Compact 7-day table for the daily self-check-in indicators. Each cell shows
 * the value (text) plus a shape icon for non-nominal values, so status never
 * depends on colour alone.
 */
export function DailyGrid({ days, rows }: { days: string[]; rows: DailyRow[] }) {
  return (
    <div className="relative -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[540px] border-separate border-spacing-1 text-left text-sm">
        <caption className="sr-only">Daily check-in values for the last 7 days, oldest to newest</caption>
        <thead className="text-[11px] text-muted">
          <tr>
            <th scope="col" className="pr-2 font-normal">
              Indicator
            </th>
            {days.map((d, i) => (
              <th key={d} scope="col" className="text-center font-normal">
                {i === days.length - 1 ? "Today" : d.slice(5).replace("-", ".")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((row) => {
            const def = INDICATORS[row.id];
            return (
              <tr key={row.id}>
                <th scope="row" className="pr-2 text-xs font-normal">
                  <span className="block font-medium text-fg">{def.short}</span>
                  <span className="text-muted">{def.unit}</span>
                </th>
                {row.cells.map((c, i) => {
                  if (!c) {
                    return (
                      <td key={i} className="rounded-md border border-dashed border-border py-1.5 text-center text-xs text-muted">
                        <span aria-hidden>—</span>
                        <span className="sr-only">no entry</span>
                      </td>
                    );
                  }
                  const s = classify(row.id, c.value);
                  const real = c.source !== "simulated";
                  return (
                    <td
                      key={i}
                      className={`rounded-md border py-1.5 text-center text-xs ${CELL_TONE[s]} ${real ? "font-semibold" : ""}`}
                      title={`${def.short} ${days[i]}: ${formatValue(row.id, c.value)} · ${STATUS_LABEL[s]} · ${real ? "crew entry" : "simulated"}`}
                    >
                      <span className={`inline-flex items-center justify-center gap-1 ${s === "nominal" ? "" : STATUS_TEXT[s]}`}>
                        {s !== "nominal" && <StatusIcon status={s} size={11} />}
                        {formatValue(row.id, c.value, false)}
                        {real && (
                          <span className="text-accent" aria-label="crew entry">
                            *
                          </span>
                        )}
                      </span>
                      {s === "nominal" && <span className="sr-only">, nominal</span>}
                      {!real && <span className="sr-only">, simulated</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
