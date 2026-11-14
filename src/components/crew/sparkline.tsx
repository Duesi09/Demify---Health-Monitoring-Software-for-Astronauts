import { nominalBand } from "@/components/overview/format";
import { STATUS_TEXT } from "@/components/ui";
import type { IndicatorId, Status } from "@/lib/types";
import type { Spark } from "./record-data";

const W = 104;
const H = 28;
const PAD = 3;

/**
 * Tiny server-rendered SVG trend (no chart library). The shaded strip is the
 * indicator's normal range where it overlaps the plotted values; the end dot
 * carries the current status colour (status itself is shown as text nearby).
 */
export function Sparkline({
  id,
  spark,
  status,
  label,
  decimals,
  unit,
}: {
  id: IndicatorId;
  spark: Spark;
  status: Status;
  label: string;
  decimals: number;
  unit: string;
}) {
  const vs = spark.points.map((p) => p[1]);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (f: number) => PAD + f * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const d = spark.points.map(([f, v], i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = nominalBand(id);
  const bandTop = band ? y(Math.min(band.to, hi)) : 0;
  const bandBottom = band ? y(Math.max(band.from, lo)) : 0;
  const last = spark.points[spark.points.length - 1];
  // Screen readers read every digit: round to the indicator's precision and say the unit.
  const f = (v: number) => {
    const t = v.toFixed(decimals);
    return Number(t) === 0 ? (0).toFixed(decimals) : t;
  };
  const u = unit ? ` ${unit}` : "";
  const aria = `${label}, last ${spark.window}${spark.basis === "simulated" ? " (simulated)" : ""}: from ${f(vs[0])} to ${f(last[1])}${u}, range ${f(Math.min(...vs))} to ${f(Math.max(...vs))}${u}`;
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={aria}
      className="block overflow-visible"
    >
      {band && bandBottom > bandTop && (
        <rect x={PAD} width={W - 2 * PAD} y={bandTop} height={bandBottom - bandTop} fill="var(--nominal)" opacity={0.1} />
      )}
      <path
        d={d}
        fill="none"
        stroke="var(--series-1)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(last[0])}
        cy={y(last[1])}
        r={2.6}
        className={status === "nominal" || status === "unknown" ? "text-fg" : STATUS_TEXT[status]}
        fill="currentColor"
      />
    </svg>
  );
}
