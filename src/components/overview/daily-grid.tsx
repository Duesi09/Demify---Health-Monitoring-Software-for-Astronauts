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
 * Marker for real (non-simulated) values, keyed by provenance so device or
 * data-feed values are never presented as something the astronaut typed in.
 */
const SOURCE_MARK: Record<Exclude<ReadingSource, "simulated">, { mark: string; label: string }> = {
  manual: { mark: "*", label: "crew entry" },
  sensor: { mark: "†", label: "sensor reading" },
  osdr: { mark: "†", label: "NASA OSDR data" },
  "noaa-swpc": { mark: "†", label: "NOAA SWPC data" },
};

/**
 * Compact 7-day table for the daily self-check-in indicators. Each cell shows
 * the value (text) plus a shape icon for non-nominal values, so status never
 * depends on colour alone.
 *
 * On narrow screens the table scrolls horizontally. The scroller is a focusable,
 * labelled region (keyboard users can scroll it with the arrow keys), starts
 * scrolled to the newest day (`direction: rtl` on the scroller only; the table
 * itself stays ltr), and keeps the indicator column pinned.
 */
export function DailyGrid({ days, rows }: { days: string[]; rows: DailyRow[] }) {
  const hasNonCrew = rows.some((r) => r.cells.some((c) => c && c.source !== "manual" && c.source !== "simulated"));
  return (
    <>
      <div
        role="region"
        tabIndex={0}
        aria-label="Daily check-in table, scrolls horizontally"
        className="relative -mx-1 overflow-x-auto rounded-md px-1 [direction:rtl] focus-visible:outline-2 focus-visible:outline-accent"
      >
        <table className="w-full min-w-[540px] border-separate border-spacing-1 text-left text-sm [direction:ltr]">
          <caption className="sr-only">Daily check-in values for the last 7 days, oldest to newest</caption>
          <thead className="text-[11px] text-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface pr-2 shadow-[-8px_0_0_var(--surface)] font-normal">
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
                  <th scope="row" className="sticky left-0 z-10 bg-surface pr-2 shadow-[-8px_0_0_var(--surface)] text-xs font-normal">
                    <span className="block font-medium text-fg">{def.short}</span>
                    <span className="text-muted">{def.unit}</span>
                  </th>
                  {row.cells.map((c, i) => {
                    if (!c) {
                      return (
                        <td key={i} className="rounded-[4px] border border-dashed border-border py-1.5 text-center text-xs text-muted">
                          <span aria-hidden>—</span>
                          <span className="sr-only">no entry</span>
                        </td>
                      );
                    }
                    const s = classify(row.id, c.value);
                    const real = c.source === "simulated" ? null : SOURCE_MARK[c.source];
                    return (
                      <td
                        key={i}
                        className={`rounded-[4px] border py-1.5 text-center text-xs ${CELL_TONE[s]} ${real ? "font-semibold" : ""}`}
                        title={`${def.short} ${days[i]}: ${formatValue(row.id, c.value)} · ${STATUS_LABEL[s]} · ${real ? real.label : "simulated"}`}
                      >
                        <span className={`inline-flex items-center justify-center gap-1 ${s === "nominal" ? "" : STATUS_TEXT[s]}`}>
                          {s !== "nominal" && <StatusIcon status={s} size={11} />}
                          {formatValue(row.id, c.value, false)}
                          {real && (
                            <span className="text-accent" aria-hidden>
                              {real.mark}
                            </span>
                          )}
                        </span>
                        {s === "nominal" && <span className="sr-only">, nominal</span>}
                        <span className="sr-only">, {real ? real.label : "simulated"}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasNonCrew && (
        <p className="mt-2 text-[11px] text-muted">
          <span className="text-accent" aria-hidden>
            †
          </span>{" "}
          Bold values marked † are device (sensor) or data-feed readings, not crew entries.
        </p>
      )}
    </>
  );
}
