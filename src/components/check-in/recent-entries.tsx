import { STATUS_LABEL } from "@/components/ui";
import { StatusIcon } from "@/components/overview/status-icon";
import { formatUtc, formatValue } from "@/components/overview/format";
import { INDICATORS, classify } from "@/lib/health/knowledge";
import type { Reading } from "@/lib/types";

/**
 * Recent crew entries and DEVICE readings, grouped by submission time. Only
 * manual and sensor readings are listed: SIMULATED demo values never appear here.
 */
export function RecentEntries({ readings, limit = 8 }: { readings: Reading[]; limit?: number }) {
  const groups = new Map<string, Reading[]>();
  for (const r of readings) {
    const g = groups.get(r.takenAt) ?? [];
    g.push(r);
    groups.set(r.takenAt, g);
  }
  const list = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, limit);

  if (!list.length) {
    return (
      <p className="text-sm text-muted">
        No crew entries in the last 14 days. Until you check in, the daily values on the Overview are simulated demo data.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {list.map(([takenAt, rs]) => {
        const note = rs.find((r) => r.note)?.note;
        const source = rs[0].source;
        return (
          <li key={takenAt} className="rounded-lg border border-border bg-surface-2/50 p-3">
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
              <time dateTime={takenAt}>{formatUtc(takenAt)}</time>
              <span>
                {rs.length} value{rs.length === 1 ? "" : "s"} · {source === "manual" ? "crew entry" : source === "sensor" ? "DEVICE" : source}
              </span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {rs.map((r) => {
                const s = classify(r.indicator, r.value);
                return (
                  <li
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-border bg-surface px-1.5 py-0.5 text-xs"
                    title={`${INDICATORS[r.indicator].label}: ${STATUS_LABEL[s]}`}
                  >
                    <StatusIcon status={s} size={12} />
                    <span className="text-muted">{INDICATORS[r.indicator].short}</span>
                    <span className="tabular">{formatValue(r.indicator, r.value)}</span>
                  </li>
                );
              })}
            </ul>
            {note && <p className="mt-2 text-xs italic text-muted">“{note}”</p>}
          </li>
        );
      })}
    </ol>
  );
}
